// 방 하나의 진행 상태 머신. 네트워크·DB 를 모른다 — 변경을 이벤트로 알리기만 한다.
//
// 내보내는 이벤트
//   'state'              진행 상태가 바뀜 (모든 역할에 새 스냅샷 전송)
//   'roster'             참가자 목록·접속 상태만 바뀜 (참가자 화면에는 보낼 필요 없음)
//   'progress'           제출 현황만 바뀜
//   'private' (playerId, event, payload)   한 참가자에게만 보낼 내용
//   'score_events' (events)                새 점수 기록 (DB 저장용)
//   'round_rewrite' (roundIdx, events)     문제 무효 처리로 라운드 기록이 다시 계산됨
//   'players' (players)                    참가자 정보·점수가 바뀜 (DB 저장용)
//   'player_removed' (playerId)

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  PHASES, COMMANDS, ERRORS, EVENTS, GAME_MODES, DEFAULT_DISPLAY_SETTINGS,
} from '../../../shared/protocol.js';
import {
  roundLossCap, applyLossCap, judgeAnswer, rawDelta, reactionPoints,
} from '../../../shared/scoring.js';
import { buildEmojiAssignments } from '../../emojiAssign.js';
import { rankPlayers } from './standings.js';
import { computeAwards, drawWinners } from './awards.js';

const ok = (extra) => ({ ok: true, ...extra });
const fail = (error, message) => ({ ok: false, error, message });
const invalid = (message) => fail(ERRORS.INVALID, message);

const MIN_REACTION_MS = 80; // 사람이 낼 수 없는 반응 시간은 이 값으로 올린다
const MAX_NAME = 20;

export class Room extends EventEmitter {
  constructor({ id = randomUUID(), roomCode, createdAt = Date.now() }) {
    super();
    this.id = id;
    this.roomCode = roomCode;
    this.createdAt = createdAt;
    this.set = null;
    this.phase = PHASES.LOBBY;
    this.step = 0;
    this.r = 0;
    this.q = 0;
    this.players = new Map();   // id → player
    this.events = [];           // 점수 기록 { playerId, r, q, answer, isCorrect, raw, applied, ms, at }
    this.current = null;        // 진행 중인 문제의 실행 상태
    this.standings = { visible: false, scope: 'total', entries: [] };
    this.awards = null;         // { items, index, step }
    this.showMain = false;
    this.settings = { ...DEFAULT_DISPLAY_SETTINGS };
    this.finishedAt = null;
    this._deadlineTimer = null;
    this._signalTimer = null;
    this._rng = Math.random;
  }

  // ── 조회 ─────────────────────────────────────────────────
  get round() { return this.set?.rounds[this.r] || null; }
  get question() { return this.round?.questions[this.q] || null; }
  get isFinished() { return this.phase === PHASES.FINAL || this.phase === PHASES.AWARDS; }
  onlineCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n += 1;
    return n;
  }
  submittedCount() {
    if (!this.current) return 0;
    return this.current.emoji ? this.current.emoji.solved.size : this.current.answers.size;
  }

  // ── 세트·설정 ────────────────────────────────────────────
  loadSet(set) {
    if (this.phase !== PHASES.LOBBY) return invalid('게임이 시작된 뒤에는 세트를 바꿀 수 없습니다.');
    if (set.teams) {
      // 명단이 바뀌면 이미 입장한 참가자의 소속이 맞지 않을 수 있다 → 맞지 않으면 비운다
      for (const p of this.players.values()) {
        const g = set.teams.groups.find((x) => x.name === p.group);
        if (!g || !g.units.includes(p.unit)) { p.group = null; p.unit = null; }
      }
    }
    this.set = set;
    if (set.display) this.settings = { ...this.settings, ...set.display };
    this._changed();
    return ok();
  }

  updateSettings(patch) {
    const next = { ...this.settings };
    for (const key of Object.keys(DEFAULT_DISPLAY_SETTINGS)) {
      if (patch && key in patch) next[key] = patch[key];
    }
    const clamp = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    next.chatFontScale = clamp(next.chatFontScale, 0.5, 3, 1);
    next.chatOpacity = clamp(next.chatOpacity, 0, 1, 1);
    next.chatSpeed = clamp(next.chatSpeed, 0.25, 4, 1);
    next.standingsSpeed = clamp(next.standingsSpeed, 0.5, 2, 1);
    next.chatEnabled = next.chatEnabled !== false;
    this.settings = next;
    this.emit('state');
    return ok({ settings: next });
  }

  // ── 참가자 ───────────────────────────────────────────────
  _checkMembership(group, unit) {
    const teams = this.set?.teams;
    if (!teams) return { group: typeof group === 'string' && group.trim() ? group.trim().slice(0, MAX_NAME) : null, unit: null };
    const g = teams.groups.find((x) => x.name === group);
    if (!g) return { error: `${teams.labels.group}을(를) 선택해주세요.` };
    if (!g.units.includes(unit)) return { error: `${teams.labels.unit}을(를) 선택해주세요.` };
    return { group, unit };
  }

  register({ name, group, unit }) {
    if (!this.set) return invalid('아직 준비 중인 방입니다. 잠시 후 다시 시도해주세요.');
    if (this.isFinished) return invalid('이미 종료된 게임입니다.');
    const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : '';
    if (!cleanName) return fail(ERRORS.BAD_REQUEST, '이름을 입력해주세요.');
    const member = this._checkMembership(group, unit);
    if (member.error) return fail(ERRORS.BAD_REQUEST, member.error);

    // 같은 이름·소속이 이미 있으면: 접속이 끊긴 경우에만 이어받는다 (브라우저 초기화 등)
    for (const p of this.players.values()) {
      if (p.name === cleanName && p.group === member.group && p.unit === member.unit) {
        if (p.online) return fail(ERRORS.BAD_REQUEST, '같은 이름으로 이미 접속 중입니다. 이름을 조금 바꿔주세요.');
        return ok({ player: p, resumed: true });
      }
    }

    const player = {
      id: randomUUID(),
      name: cleanName,
      group: member.group,
      unit: member.unit,
      score: 0,
      totalResponseMs: 0,
      submitCount: 0,
      chatCount: 0,
      online: false,
      joinedAt: Date.now(),
      loss: {}, // 라운드별 감점 누계
    };
    this.players.set(player.id, player);
    this.emit('players', [player]);
    this.emit('roster');
    return ok({ player, resumed: false });
  }

  setOnline(playerId, online) {
    const p = this.players.get(playerId);
    if (!p || p.online === online) return;
    p.online = online;
    this.emit('roster');
    // 남은 사람이 모두 제출한 상태가 되면 마감
    if (!online) this._closeIfAllSubmitted();
  }

  updatePlayer(playerId, { name, group, unit }) {
    const p = this.players.get(playerId);
    if (!p) return fail(ERRORS.NOT_FOUND, '참가자를 찾을 수 없습니다.');
    if (name !== undefined) {
      const clean = String(name).trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
      if (!clean) return fail(ERRORS.BAD_REQUEST, '이름을 입력해주세요.');
      p.name = clean;
    }
    if (group !== undefined || unit !== undefined) {
      const member = this._checkMembership(group ?? p.group, unit ?? p.unit);
      if (member.error) return fail(ERRORS.BAD_REQUEST, member.error);
      p.group = member.group;
      p.unit = member.unit;
    }
    this.emit('players', [p]);
    this.emit('state');
    return ok();
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) return fail(ERRORS.NOT_FOUND, '참가자를 찾을 수 없습니다.');
    this.players.delete(playerId);
    const rounds = new Set(this.events.filter((e) => e.playerId === playerId).map((e) => e.r));
    this.events = this.events.filter((e) => e.playerId !== playerId);
    for (const r of rounds) this.emit('round_rewrite', r, this.events.filter((e) => e.r === r));
    if (this.current) {
      this.current.answers.delete(playerId);
      this.current.emoji?.solved.delete(playerId);
    }
    this.emit('player_removed', playerId);
    this.emit('state');
    return ok();
  }

  addChat(playerId) {
    const p = this.players.get(playerId);
    if (p) p.chatCount += 1;
  }

  // ── 진행 명령 ────────────────────────────────────────────
  command(type, args = {}) {
    if (typeof args.step === 'number' && args.step !== this.step) {
      return fail(ERRORS.STALE, '이미 처리된 명령입니다.');
    }
    switch (type) {
      case COMMANDS.NEXT: return this._next();
      case COMMANDS.REVEAL: return this._reveal();
      case COMMANDS.SKIP: return this._skip();
      case COMMANDS.GOTO: return this._goto(args.round, args.question);
      case COMMANDS.PAUSE: return this._pause();
      case COMMANDS.RESUME: return this._resume();
      case COMMANDS.EXTEND_TIME: return this._extend(args.seconds);
      case COMMANDS.SHOW_STANDINGS: return this._showStandings(args.scope);
      case COMMANDS.HIDE_STANDINGS: return this._hideStandings();
      case COMMANDS.END_GAME: return this._endGame();
      case COMMANDS.AWARD_NEXT: return this._awardNext();
      case COMMANDS.AWARD_STEP: return this._awardStep();
      case COMMANDS.SHOW_MAIN: return this._setMain(true);
      case COMMANDS.HIDE_MAIN: return this._setMain(false);
      default: return fail(ERRORS.BAD_REQUEST, `알 수 없는 명령입니다: ${type}`);
    }
  }

  // `next` 가 지금 무엇을 하는지 — 리모트 주 버튼 라벨에 쓴다
  nextAction() {
    switch (this.phase) {
      case PHASES.LOBBY: return this.set ? 'start_game' : null;
      case PHASES.ROUND_INTRO: return 'open_question';
      case PHASES.QUESTION_OPEN:
      case PHASES.QUESTION_CLOSED: return 'reveal';
      case PHASES.QUESTION_REVEAL: return this.q + 1 < this.round.questions.length ? 'next_question' : 'end_round';
      case PHASES.ROUND_END: return this.r + 1 < this.set.rounds.length ? 'next_round' : 'finish';
      case PHASES.FINAL: return this.awards?.items.length ? 'award_next' : null;
      case PHASES.AWARDS: {
        const item = this.awards.items[this.awards.index];
        if (this.awards.step < item.steps) return 'award_step';
        return this.awards.index + 1 < this.awards.items.length ? 'award_next' : null;
      }
      default: return null;
    }
  }

  _next() {
    switch (this.nextAction()) {
      case 'start_game': return this._enterRound(0);
      case 'open_question': return this._openQuestion();
      case 'reveal': return this._reveal();
      case 'next_question': this.q += 1; return this._openQuestion();
      case 'end_round': return this._endRound();
      case 'next_round': return this._enterRound(this.r + 1);
      case 'finish': return this._finish();
      case 'award_next': return this._awardNext();
      case 'award_step': return this._awardStep();
      default:
        return invalid(this.phase === PHASES.LOBBY ? '먼저 문제 세트를 올려주세요.' : '더 진행할 항목이 없습니다.');
    }
  }

  _enterRound(index) {
    this.r = index;
    this.q = 0;
    this.current = null;
    this.phase = PHASES.ROUND_INTRO;
    this.standings.visible = false;
    this.showMain = false;
    this._changed();
    return ok();
  }

  _openQuestion() {
    const round = this.round;
    const question = this.question;
    if (!question) return invalid('문제가 없습니다.');
    this._clearTimers();
    this._voidQuestion(this.r, this.q); // 같은 문제를 다시 내면 이전 채점은 무효
    const now = Date.now();
    this.current = {
      openedAt: now,
      deadlineAt: now + question.timeLimit * 1000,
      pausedRemainingMs: null,
      pausedTotalMs: 0,
      answers: new Map(), // playerId → { answer, isCorrect, delta, ms, accuracy, falseStart }
      reaction: null,
      emoji: null,
    };

    if (round.gameMode === GAME_MODES.REACTION) {
      const maxDelay = Math.max(1000, Math.min(4000, question.timeLimit * 1000 - 1000));
      const delay = 1000 + this._rng() * (maxDelay - 1000);
      this.current.reaction = { signalAt: now + delay, signaled: false, results: [] };
    }
    if (round.gameMode === GAME_MODES.EMOJI_FIND) {
      const ids = [...this.players.values()].filter((p) => p.online).map((p) => p.id);
      const { assignments, codeToPlayerId } = buildEmojiAssignments(ids, question);
      this.current.emoji = { assignments, codeToPlayerId, solved: new Set() };
    }

    this.phase = PHASES.QUESTION_OPEN;
    this.standings.visible = false;
    this.showMain = false;
    this._armTimers();
    this._changed();
    return ok();
  }

  _armTimers() {
    this._clearTimers();
    const c = this.current;
    if (!c || this.phase !== PHASES.QUESTION_OPEN || c.pausedRemainingMs !== null) return;
    const now = Date.now();
    this._deadlineTimer = setTimeout(() => this._close(), Math.max(0, c.deadlineAt - now));
    if (c.reaction && !c.reaction.signaled) {
      this._signalTimer = setTimeout(() => {
        c.reaction.signaled = true;
        c.reaction.signalAt = Date.now();
        this.emit('state');
      }, Math.max(0, c.reaction.signalAt - now));
    }
  }

  _clearTimers() {
    clearTimeout(this._deadlineTimer);
    clearTimeout(this._signalTimer);
    this._deadlineTimer = null;
    this._signalTimer = null;
  }

  // 접수 마감 (정답은 아직 공개하지 않음)
  _close({ silent = false } = {}) {
    if (this.phase !== PHASES.QUESTION_OPEN) return;
    this._clearTimers();
    const c = this.current;
    const added = [];
    if (c.reaction) {
      // 빠른 순으로 순위 점수 지급
      c.reaction.results.sort((a, b) => a.ms - b.ms);
      c.reaction.results.forEach((res, idx) => {
        const player = this.players.get(res.playerId);
        if (!player) return;
        const raw = reactionPoints(this.question, idx);
        const ev = this._addScore(player, { answer: `${res.ms}ms`, isCorrect: true, raw, ms: res.ms });
        added.push(ev);
        res.rank = idx + 1;
        res.points = ev.applied;
        c.answers.set(player.id, { ...c.answers.get(player.id), isCorrect: true, delta: ev.applied, rank: idx + 1 });
        this.emit('private', player.id, EVENTS.PLAYER_RESULT, {
          isCorrect: true, delta: ev.applied, score: player.score, rank: idx + 1, ms: res.ms,
        });
      });
    }
    if (added.length) this.emit('score_events', added);
    this.emit('players', [...this.players.values()]);
    this.phase = PHASES.QUESTION_CLOSED;
    if (!silent) this._changed();
  }

  _reveal() {
    if (this.phase === PHASES.QUESTION_OPEN) this._close({ silent: true });
    if (this.phase !== PHASES.QUESTION_CLOSED) return invalid('공개할 문제가 없습니다.');
    this.phase = PHASES.QUESTION_REVEAL;
    this._changed();
    return ok();
  }

  _endRound() {
    this.phase = PHASES.ROUND_END;
    this.current = null;
    if (this.round.standingsAfter) this._fillStandings('total');
    this._changed();
    return ok();
  }

  _finish() {
    this._clearTimers();
    this.current = null;
    this.phase = PHASES.FINAL;
    this.finishedAt = Date.now();
    this.standings.visible = false;
    this.awards = { items: computeAwards(this.set, this.players.values(), this.events), index: -1, step: 0 };
    this.emit('players', [...this.players.values()]);
    this._changed();
    return ok();
  }

  _endGame() {
    if (!this.set || this.phase === PHASES.LOBBY) return invalid('아직 게임이 시작되지 않았습니다.');
    if (this.isFinished) return invalid('이미 종료된 게임입니다.');
    // 진행 중이던 문제는 마감까지만 반영한다
    if (this.phase === PHASES.QUESTION_OPEN) this._close({ silent: true });
    return this._finish();
  }

  // 현재 문제를 무효 처리하고 다음 문제(또는 라운드 종료)로
  _skip() {
    if (this.phase !== PHASES.QUESTION_OPEN && this.phase !== PHASES.QUESTION_CLOSED) {
      return invalid('건너뛸 문제가 없습니다.');
    }
    this._clearTimers();
    this._voidQuestion(this.r, this.q);
    if (this.q + 1 < this.round.questions.length) {
      this.q += 1;
      return this._openQuestion();
    }
    return this._endRound();
  }

  _goto(round, question = 0) {
    if (!this.set) return invalid('문제 세트가 없습니다.');
    if (this.isFinished) return invalid('이미 종료된 게임입니다.');
    const target = this.set.rounds[round];
    if (!Number.isInteger(round) || !Number.isInteger(question) || !target || !target.questions[question]) {
      return fail(ERRORS.BAD_REQUEST, '없는 문제입니다.');
    }
    this._clearTimers();
    // 공개 전에 떠나는 문제는 무효
    if (this.phase === PHASES.QUESTION_OPEN || this.phase === PHASES.QUESTION_CLOSED) {
      this._voidQuestion(this.r, this.q);
    }
    if (question === 0) return this._enterRound(round);
    this.r = round;
    this.q = question;
    return this._openQuestion();
  }

  _pause() {
    const c = this.current;
    if (this.phase !== PHASES.QUESTION_OPEN || c.pausedRemainingMs !== null) return invalid('일시정지할 수 없습니다.');
    c.pausedRemainingMs = Math.max(0, c.deadlineAt - Date.now());
    c.pausedAt = Date.now();
    this._clearTimers();
    this._changed();
    return ok();
  }

  _resume() {
    const c = this.current;
    if (this.phase !== PHASES.QUESTION_OPEN || c.pausedRemainingMs === null) return invalid('일시정지 상태가 아닙니다.');
    const now = Date.now();
    const pausedFor = now - c.pausedAt;
    c.pausedTotalMs += pausedFor;
    c.deadlineAt = now + c.pausedRemainingMs;
    if (c.reaction && !c.reaction.signaled) c.reaction.signalAt += pausedFor;
    c.pausedRemainingMs = null;
    c.pausedAt = null;
    this._armTimers();
    this._changed();
    return ok();
  }

  _extend(seconds = 10) {
    const c = this.current;
    if (this.phase !== PHASES.QUESTION_OPEN) return invalid('진행 중인 문제가 없습니다.');
    if (typeof seconds !== 'number' || !(seconds > 0) || seconds > 300) return fail(ERRORS.BAD_REQUEST, '연장 시간이 올바르지 않습니다.');
    if (c.pausedRemainingMs !== null) c.pausedRemainingMs += seconds * 1000;
    else { c.deadlineAt += seconds * 1000; this._armTimers(); }
    this._changed();
    return ok();
  }

  _fillStandings(scope) {
    const list = [...this.players.values()];
    let ranked;
    if (scope === 'round') {
      const totals = new Map();
      for (const e of this.events) if (e.r === this.r) totals.set(e.playerId, (totals.get(e.playerId) || 0) + e.applied);
      ranked = rankPlayers(list, (p) => totals.get(p.id) || 0);
    } else {
      ranked = rankPlayers(list);
    }
    this.standings = {
      visible: true,
      scope: scope === 'round' ? 'round' : 'total',
      entries: ranked.slice(0, this.set?.standingsTop || 10).map(({ playerId, ...e }) => e),
    };
  }

  _showStandings(scope = 'total') {
    if (!this.set) return invalid('문제 세트가 없습니다.');
    if (this.phase === PHASES.QUESTION_OPEN) return invalid('문제 진행 중에는 집계를 띄울 수 없습니다.');
    this._fillStandings(scope);
    this.showMain = false;
    this._changed();
    return ok();
  }

  _hideStandings() {
    if (!this.standings.visible) return ok();
    this.standings.visible = false;
    this._changed();
    return ok();
  }

  _setMain(on) {
    if (this.showMain === on) return ok();
    this.showMain = on;
    if (on) this.standings.visible = false;
    this._changed();
    return ok();
  }

  _awardNext() {
    if (!this.isFinished) return invalid('게임이 끝난 뒤에 시상할 수 있습니다.');
    const a = this.awards;
    if (a.index + 1 >= a.items.length) return invalid('더 진행할 시상 항목이 없습니다.');
    a.index += 1;
    a.step = 0;
    const item = a.items[a.index];
    if (item.result.kind === 'draw' && item.result.winners.length === 0) {
      item.result.winners = drawWinners(this.players.values(), item.count, this._rng);
      item.steps = item.result.winners.length;
    }
    this.phase = PHASES.AWARDS;
    this.showMain = false;
    this._changed();
    return ok();
  }

  _awardStep() {
    if (this.phase !== PHASES.AWARDS) return invalid('진행 중인 시상 항목이 없습니다.');
    const a = this.awards;
    if (a.step >= a.items[a.index].steps) return invalid('이미 모두 공개했습니다.');
    a.step += 1;
    this._changed();
    return ok();
  }

  // ── 답안 ─────────────────────────────────────────────────
  _acceptingAnswers() {
    return this.phase === PHASES.QUESTION_OPEN && this.current.pausedRemainingMs === null;
  }

  _elapsedMs() {
    const c = this.current;
    return Math.max(0, Date.now() - c.openedAt - c.pausedTotalMs);
  }

  submitAnswer(playerId, answer) {
    if (!this._acceptingAnswers()) return invalid('지금은 제출할 수 없습니다.');
    const player = this.players.get(playerId);
    if (!player) return fail(ERRORS.NOT_FOUND, '참가자를 찾을 수 없습니다.');
    const mode = this.round.gameMode;
    if (mode === GAME_MODES.REACTION) return invalid('반응속도 문제입니다.');
    if (typeof answer !== 'string' && typeof answer !== 'number') return fail(ERRORS.BAD_REQUEST, '답안이 비어 있습니다.');
    const text = String(answer).slice(0, 2000);
    if (mode === GAME_MODES.EMOJI_FIND) return this._submitEmoji(player, text);

    const c = this.current;
    if (c.answers.has(playerId)) return invalid('이미 제출했습니다.');
    const ms = this._elapsedMs();
    const { isCorrect, accuracy } = judgeAnswer(mode, this.question, text);
    const ev = this._addScore(player, { answer: text, isCorrect, raw: rawDelta(mode, this.question, isCorrect), ms });
    const result = { isCorrect, delta: ev.applied, score: player.score, accuracy };
    c.answers.set(playerId, { answer: text, isCorrect, delta: ev.applied, ms, accuracy });
    this.emit('score_events', [ev]);
    this.emit('private', playerId, EVENTS.PLAYER_RESULT, result);
    this.emit('progress');
    this._closeIfAllSubmitted();
    return ok(result);
  }

  // 이모지 사람 찾기: 오답은 감점 없이 재시도, 정답이면 잠금
  _submitEmoji(player, code) {
    const { assignments, codeToPlayerId, solved } = this.current.emoji;
    if (solved.has(player.id)) return invalid('이미 찾았습니다.');
    const mine = assignments.get(player.id);
    const targetId = codeToPlayerId.get(code.trim());
    const target = targetId ? assignments.get(targetId) : null;
    const isCorrect = !!(mine && target && targetId !== player.id && target.groupId === mine.groupId);
    if (!isCorrect) {
      const result = { isCorrect: false, delta: 0, score: player.score, retry: true };
      this.emit('private', player.id, EVENTS.PLAYER_RESULT, result);
      return ok(result);
    }
    solved.add(player.id);
    const ms = this._elapsedMs();
    const ev = this._addScore(player, { answer: code.trim(), isCorrect: true, raw: this.question.points, ms });
    const result = { isCorrect: true, delta: ev.applied, score: player.score };
    this.current.answers.set(player.id, { answer: code.trim(), isCorrect: true, delta: ev.applied, ms });
    this.emit('score_events', [ev]);
    this.emit('private', player.id, EVENTS.PLAYER_RESULT, result);
    this.emit('progress');
    this._closeIfAllSubmitted();
    return ok(result);
  }

  submitReaction(playerId, clientMs) {
    if (!this._acceptingAnswers() || !this.current.reaction) return invalid('지금은 누를 수 없습니다.');
    const player = this.players.get(playerId);
    if (!player) return fail(ERRORS.NOT_FOUND, '참가자를 찾을 수 없습니다.');
    const c = this.current;
    if (c.answers.has(playerId)) return invalid('이미 눌렀습니다.');

    if (!c.reaction.signaled) {
      // 신호 전에 누르면 실격 (점수 없음)
      c.answers.set(playerId, { falseStart: true, isCorrect: false, delta: 0 });
      const result = { falseStart: true, isCorrect: false, delta: 0, score: player.score };
      this.emit('private', playerId, EVENTS.PLAYER_RESULT, result);
      this.emit('progress');
      this._closeIfAllSubmitted();
      return ok(result);
    }
    // 기기에서 잰 시간을 쓰되, 서버가 잰 시간보다 짧게 주장할 수는 있어도 하한은 둔다
    const serverMs = Math.max(0, Date.now() - c.reaction.signalAt);
    const claimed = typeof clientMs === 'number' && Number.isFinite(clientMs) ? clientMs : serverMs;
    const ms = Math.round(Math.max(MIN_REACTION_MS, Math.min(claimed, Math.max(serverMs, MIN_REACTION_MS))));
    c.answers.set(playerId, { ms });
    c.reaction.results.push({ playerId, name: player.name, ms });
    this.emit('progress');
    this._closeIfAllSubmitted();
    return ok({ ms });
  }

  _closeIfAllSubmitted() {
    if (this.phase !== PHASES.QUESTION_OPEN || !this.current) return;
    const c = this.current;
    let online = 0;
    for (const p of this.players.values()) {
      if (!p.online) continue;
      online += 1;
      const done = c.emoji ? c.emoji.solved.has(p.id) : c.answers.has(p.id);
      if (!done) return;
    }
    if (online > 0) this._close();
  }

  // ── 점수 기록 ────────────────────────────────────────────
  _lossCap(r) {
    return roundLossCap(this.set.rounds[r].questions, this.set.scoring.lossCapRatio);
  }

  _applyToPlayer(player, r, raw) {
    if (raw >= 0) { player.score += raw; return raw; }
    const used = player.loss[r] || 0;
    const applied = applyLossCap(used, -raw, this._lossCap(r));
    player.loss[r] = used + applied;
    player.score -= applied;
    return applied === 0 ? 0 : -applied;
  }

  _addScore(player, { answer, isCorrect, raw, ms }) {
    const applied = this._applyToPlayer(player, this.r, raw);
    player.totalResponseMs += ms;
    player.submitCount += 1;
    const ev = { playerId: player.id, r: this.r, q: this.q, answer, isCorrect, raw, applied, ms, at: Date.now() };
    this.events.push(ev);
    return ev;
  }

  // 한 문제의 채점을 지우고, 그 라운드의 손실 한도를 처음부터 다시 적용한다
  _voidQuestion(r, q) {
    const removed = this.events.filter((e) => e.r === r && e.q === q);
    if (removed.length === 0) return;
    this.events = this.events.filter((e) => !(e.r === r && e.q === q));
    const affected = new Set();
    for (const e of removed) {
      const p = this.players.get(e.playerId);
      if (!p) continue;
      p.totalResponseMs -= e.ms;
      p.submitCount -= 1;
      affected.add(p);
    }
    // 지운 기록의 점수를 되돌린 뒤, 남은 기록으로 라운드를 다시 계산
    for (const e of removed) {
      const p = this.players.get(e.playerId);
      if (p) p.score -= e.applied;
    }
    for (const p of affected) {
      const mine = this.events.filter((e) => e.playerId === p.id && e.r === r);
      for (const e of mine) p.score -= e.applied;
      p.loss[r] = 0;
      for (const e of mine) e.applied = this._applyToPlayer(p, r, e.raw);
    }
    this.emit('round_rewrite', r, this.events.filter((e) => e.r === r));
    this.emit('players', [...affected]);
  }

  _changed() {
    this.step += 1;
    this.emit('state');
  }

  dispose() {
    this._clearTimers();
    this.removeAllListeners();
  }

  // ── 저장·복구 ────────────────────────────────────────────
  toSnapshot() {
    const c = this.current;
    return {
      phase: this.phase,
      step: this.step,
      r: this.r,
      q: this.q,
      players: [...this.players.values()].map(({ online, ...p }) => p),
      current: c && {
        ...c,
        answers: [...c.answers.entries()],
        emoji: c.emoji && {
          assignments: [...c.emoji.assignments.entries()],
          codeToPlayerId: [...c.emoji.codeToPlayerId.entries()],
          solved: [...c.emoji.solved],
        },
      },
      standings: this.standings,
      awards: this.awards,
      showMain: this.showMain,
      settings: this.settings,
      finishedAt: this.finishedAt,
    };
  }

  static fromSnapshot({ id, roomCode, createdAt, set, state, events = [] }) {
    const room = new Room({ id, roomCode, createdAt });
    room.set = set || null;
    if (!state) return room;
    room.phase = state.phase;
    room.step = state.step;
    room.r = state.r;
    room.q = state.q;
    for (const p of state.players || []) room.players.set(p.id, { ...p, loss: p.loss || {}, online: false });
    room.events = events;
    room.standings = state.standings || room.standings;
    room.awards = state.awards || null;
    room.showMain = !!state.showMain;
    room.settings = { ...DEFAULT_DISPLAY_SETTINGS, ...state.settings };
    room.finishedAt = state.finishedAt || null;
    const c = state.current;
    if (c) {
      room.current = {
        ...c,
        answers: new Map(c.answers),
        emoji: c.emoji && {
          assignments: new Map(c.emoji.assignments),
          codeToPlayerId: new Map(c.emoji.codeToPlayerId),
          solved: new Set(c.emoji.solved),
        },
      };
      // 서버가 내려가 있던 동안 마감 시각이 지났으면 바로 마감된다
      if (room.phase === PHASES.QUESTION_OPEN) room._armTimers();
    }
    return room;
  }
}
