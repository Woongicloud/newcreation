// 역할별 상태 스냅샷. 같은 방 상태라도 누가 보느냐에 따라 내용이 다르다.
//   참가자  — 정답은 공개 단계에서만, 본인 점수·순위만
//   Display — 문제·제출 현황·집계·시상 (공개된 부분만)
//   진행자  — 정답, 다음 순서, 순서표
//   관리자  — 진행자 내용 + 참가자 전체 목록

import { PHASES, ROLES, GAME_MODES, PROTOCOL_VERSION } from '../../../shared/protocol.js';
import { rankPlayers } from './standings.js';
import { revealedPart } from './awards.js';

// 한 번의 전송에서 여러 화면이 같이 쓰는 계산 결과
export function buildContext(room) {
  const ranked = rankPlayers(room.players.values());
  return { ranked, rankById: new Map(ranked.map((e) => [e.playerId, e.rank])) };
}

function questionView(room, { withAnswer }) {
  const round = room.round;
  const q = room.question;
  if (!q || room.phase === PHASES.ROUND_INTRO || room.phase === PHASES.ROUND_END) return null;
  const view = {
    id: `${room.r}:${room.q}`,
    number: room.q + 1,
    gameMode: round.gameMode,
    content: q.content,
    choices: q.choices,
    imageUrls: q.imageUrls,
    audioUrl: q.audioUrl,
    consonantHint: q.consonantHint,
    timeLimit: q.timeLimit,
    points: q.points,
    penalty: q.penalty,
  };
  // 장문 타이핑은 원문을 보고 따라 치는 게임이라 원문을 항상 보낸다
  if (round.gameMode === GAME_MODES.LONG_TYPING) view.targetText = q.correctAnswer;
  if (withAnswer && q.correctAnswer !== null) view.correctAnswer = q.correctAnswer;
  return view;
}

function revealStats(room) {
  const c = room.current;
  const q = room.question;
  const answers = [...c.answers.values()];
  const stats = {
    answered: answers.length,
    correct: answers.filter((a) => a.isCorrect).length,
  };
  if (q.choices) {
    const norm = (s) => String(s ?? '').replace(/\s/g, '').toLowerCase();
    stats.choiceCounts = q.choices.map((choice) => answers.filter((a) => norm(a.answer) === norm(choice)).length);
  }
  if (c.reaction) {
    stats.reaction = c.reaction.results.slice(0, 10).map((r) => ({ rank: r.rank, name: r.name, ms: r.ms, points: r.points }));
    stats.falseStarts = answers.filter((a) => a.falseStart).length;
  }
  return stats;
}

function awardView(room, { full }) {
  const a = room.awards;
  if (!a || room.phase !== PHASES.AWARDS) return null;
  const item = a.items[a.index];
  const view = {
    index: a.index,
    total: a.items.length,
    type: item.type,
    title: item.title,
    reveal: item.reveal,
    step: a.step,
    steps: item.steps,
    revealed: revealedPart(item, a.step),
  };
  // 슬롯 연출에 돌릴 이름 후보
  if (item.reveal === 'slot') {
    view.pool = [...room.players.values()].slice(0, 40).map((p) => p.name);
  }
  if (full) view.result = item.result;
  return view;
}

function baseView(room, role) {
  const c = room.current;
  const set = room.set;
  const round = room.round;
  const inQuestion = [PHASES.QUESTION_OPEN, PHASES.QUESTION_CLOSED, PHASES.QUESTION_REVEAL].includes(room.phase);
  const staff = role === ROLES.HOST || role === ROLES.ADMIN;
  const revealed = room.phase === PHASES.QUESTION_REVEAL;

  const view = {
    v: PROTOCOL_VERSION,
    role,
    roomCode: room.roomCode,
    step: room.step,
    phase: room.phase,
    serverNow: Date.now(),
    sessionName: set?.sessionName || null,
    hasSet: !!set,
    teams: set?.teams ? { labels: set.teams.labels, groups: set.teams.groups } : null,
    settings: room.settings,
    showMain: room.showMain,
    playerCount: room.players.size,
    onlineCount: room.onlineCount(),
    position: set && room.phase !== PHASES.LOBBY && !room.isFinished ? {
      round: room.r,
      roundCount: set.rounds.length,
      question: room.q,
      questionCount: round.questions.length,
      theme: round.theme,
      gameMode: round.gameMode,
    } : null,
    question: inQuestion ? questionView(room, { withAnswer: staff || revealed }) : null,
    timer: inQuestion && c ? {
      deadlineAt: c.pausedRemainingMs === null ? c.deadlineAt : null,
      paused: c.pausedRemainingMs !== null,
      remainingMs: c.pausedRemainingMs,
    } : null,
    submittedCount: inQuestion ? room.submittedCount() : 0,
    reaction: inQuestion && c?.reaction ? { signaled: c.reaction.signaled } : null,
    stats: revealed && c ? revealStats(room) : null,
    standings: room.standings.visible ? room.standings : null,
    award: awardView(room, { full: staff }),
  };
  return view;
}

function outline(room) {
  if (!room.set) return [];
  return room.set.rounds.map((r) => ({
    theme: r.theme,
    gameMode: r.gameMode,
    questions: r.questions.map((q) => ({ content: q.content.slice(0, 60), correctAnswer: q.correctAnswer })),
  }));
}

function nextPreview(room) {
  const action = room.nextAction();
  const preview = { action };
  const set = room.set;
  if (!set) return preview;
  let target = null;
  if (action === 'open_question') target = [room.r, room.q];
  else if (action === 'next_question') target = [room.r, room.q + 1];
  else if (action === 'next_round') preview.theme = set.rounds[room.r + 1].theme;
  else if (action === 'start_game') preview.theme = set.rounds[0].theme;
  else if (action === 'award_next') preview.title = room.awards.items[room.awards.index + 1].title;
  if (target) {
    const q = set.rounds[target[0]].questions[target[1]];
    preview.content = q.content.slice(0, 60);
    preview.correctAnswer = q.correctAnswer;
  }
  return preview;
}

const playerRow = (p, rank) => ({
  id: p.id, name: p.name, group: p.group, unit: p.unit, score: p.score, online: p.online, rank,
});

export function viewFor(room, role, playerId, ctx = buildContext(room)) {
  const view = baseView(room, role);

  if (role === ROLES.PLAYER) {
    const p = room.players.get(playerId);
    if (!p) return view;
    const c = room.current;
    const mine = c?.answers.get(p.id) || null;
    const emoji = c?.emoji?.assignments.get(p.id);
    view.me = {
      id: p.id,
      name: p.name,
      group: p.group,
      unit: p.unit,
      score: p.score,
      rank: ctx.rankById.get(p.id) ?? null,
      // 이모지 찾기는 맞힐 때까지 다시 낼 수 있으므로 정답을 찾았을 때만 제출 완료
      answered: c ? (c.emoji ? c.emoji.solved.has(p.id) : !!mine) : false,
      result: mine ? {
        isCorrect: mine.isCorrect, delta: mine.delta, accuracy: mine.accuracy,
        falseStart: mine.falseStart, rank: mine.rank, ms: mine.ms,
      } : null,
      emoji: emoji ? { emojiSet: emoji.emojiSet, code: emoji.code } : null,
    };
    return view;
  }

  if (role === ROLES.DISPLAY) {
    // 대기실에서 입장한 사람 이름을 보여준다
    if (room.phase === PHASES.LOBBY) {
      view.lobby = [...room.players.values()].filter((p) => p.online)
        .map((p) => ({ name: p.name, group: p.group, unit: p.unit }));
    }
    return view;
  }

  // 진행자·관리자
  view.next = nextPreview(room);
  view.outline = outline(room);
  // 시상 세트 구성 (관리자 편집·리모트 미리보기용)
  view.awardConfig = room.set?.awards || [];
  if (room.isFinished && room.awards) {
    view.awardList = room.awards.items.map((i) => ({ type: i.type, title: i.title, reveal: i.reveal, steps: i.steps, result: i.result }));
    view.awardIndex = room.awards.index;
  }
  if (role === ROLES.ADMIN) {
    view.players = ctx.ranked.map((e) => playerRow(room.players.get(e.playerId), e.rank));
  }
  return view;
}
