import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PHASES, COMMANDS as C, ERRORS, ROLES } from '../../shared/protocol.js';
import { Room } from '../src/rooms/room.js';
import { viewFor } from '../src/rooms/views.js';
import { makeRoom, makeSet, mc, cmd } from './helpers.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('진행 흐름', () => {
  it('next 하나로 세트 끝까지 진행한다', () => {
    const { room, ids } = makeRoom();
    const seen = [room.phase];
    const answerAll = () => ids.forEach((id) => room.submitAnswer(id, room.round.gameMode === 'short_answer' ? '방주' : 'a'));
    for (let i = 0; i < 40 && room.phase !== PHASES.FINAL; i++) {
      if (room.phase === PHASES.QUESTION_OPEN) answerAll();
      else expect(cmd(room, C.NEXT).ok).toBe(true);
      seen.push(room.phase);
    }
    expect(room.phase).toBe(PHASES.FINAL);
    // 대기 → 라운드 안내 → (접수 → 마감 → 공개) × 4 → 라운드 종료 → ...
    expect(seen.slice(0, 6)).toEqual([
      PHASES.LOBBY, PHASES.ROUND_INTRO, PHASES.QUESTION_OPEN,
      PHASES.QUESTION_CLOSED, PHASES.QUESTION_REVEAL, PHASES.QUESTION_OPEN,
    ]);
    expect(seen.filter((p) => p === PHASES.ROUND_END)).toHaveLength(2);
    expect([...room.players.values()].every((p) => p.score === 500)).toBe(true);
  });

  it('세트 없이 시작할 수 없다', () => {
    const room = new Room({ roomCode: 'X' });
    expect(cmd(room, C.NEXT)).toMatchObject({ ok: false, error: ERRORS.INVALID });
  });

  it('같은 step 의 명령은 한 번만 처리한다 (더블 탭·두 기기 동시 조작)', () => {
    const { room } = makeRoom();
    cmd(room, C.NEXT);
    cmd(room, C.NEXT); // 문제 1 접수 중
    cmd(room, C.REVEAL);
    const step = room.step;
    expect(room.command(C.NEXT, { step }).ok).toBe(true);
    expect(room.command(C.NEXT, { step })).toMatchObject({ ok: false, error: ERRORS.STALE });
    expect(room.q).toBe(1); // 문제 2 — 3으로 건너뛰지 않음
  });

  it('제한 시간이 지나면 마감하고, 진행자가 공개할 때까지 정답을 내보내지 않는다', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    vi.advanceTimersByTime(9_999);
    expect(room.phase).toBe(PHASES.QUESTION_OPEN);
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect(room.submitAnswer(ids[1], 'a').ok).toBe(false);

    expect(viewFor(room, ROLES.DISPLAY).question.correctAnswer).toBeUndefined();
    expect(viewFor(room, ROLES.PLAYER, ids[0]).question.correctAnswer).toBeUndefined();
    expect(viewFor(room, ROLES.HOST).question.correctAnswer).toBe('a');
    cmd(room, C.NEXT);
    expect(room.phase).toBe(PHASES.QUESTION_REVEAL);
    const display = viewFor(room, ROLES.DISPLAY);
    expect(display.question.correctAnswer).toBe('a');
    expect(display.stats).toMatchObject({ answered: 1, correct: 1, choiceCounts: [1, 0, 0, 0] });
  });

  it('접속 중인 사람이 모두 제출하면 바로 마감한다', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    room.submitAnswer(ids[1], 'b');
    expect(room.phase).toBe(PHASES.QUESTION_OPEN);
    room.setOnline(ids[2], false); // 마지막 사람이 나가면 남은 사람 기준으로 마감
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
  });

  it('일시정지 중에는 제출과 타이머가 멈추고, 재개하면 남은 시간부터 간다', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    vi.advanceTimersByTime(4_000);
    expect(cmd(room, C.PAUSE).ok).toBe(true);
    expect(viewFor(room, ROLES.DISPLAY).timer).toMatchObject({ paused: true, remainingMs: 6_000, deadlineAt: null });
    expect(room.submitAnswer(ids[0], 'a').ok).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe(PHASES.QUESTION_OPEN);
    cmd(room, C.RESUME);
    vi.advanceTimersByTime(2_000);
    room.submitAnswer(ids[0], 'a');
    expect(room.events[0].ms).toBe(6_000); // 정지 시간은 응답 시간에서 뺀다
    cmd(room, C.EXTEND_TIME, { seconds: 10 });
    vi.advanceTimersByTime(13_999);
    expect(room.phase).toBe(PHASES.QUESTION_OPEN);
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
  });

  it('게임 종료는 진행 중인 문제를 마감하고 최종 단계로 간다', () => {
    const { room, ids } = makeRoom();
    expect(cmd(room, C.END_GAME).ok).toBe(false); // 시작 전
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    expect(cmd(room, C.END_GAME).ok).toBe(true);
    expect(room.phase).toBe(PHASES.FINAL);
    expect(room.players.get(ids[0]).score).toBe(100);
    expect(room.register({ name: '늦음', group: '중1', unit: 'A' }).ok).toBe(false);
  });
});

describe('점수', () => {
  it('맞으면 지정 점수, 틀리면 지정 감점 — 빨리 내도 늦게 내도 같다', () => {
    const { room, ids, p } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    vi.advanceTimersByTime(9_000);
    room.submitAnswer(ids[1], 'a');
    room.submitAnswer(ids[2], 'b');
    expect([p(0).score, p(1).score, p(2).score]).toEqual([100, 100, -50]);
    expect(room.submitAnswer(ids[0], 'b').ok).toBe(false); // 중복 제출
  });

  it('라운드 감점 누계는 감점 합의 50%에서 멈춘다', () => {
    // 감점 50 × 4문제 = 200 → 한도 100
    const { room, ids, p } = makeRoom();
    cmd(room, C.NEXT);
    const deltas = [];
    for (let i = 0; i < 4; i++) {
      cmd(room, C.NEXT);
      deltas.push(room.submitAnswer(ids[0], 'b').delta);
      room.submitAnswer(ids[1], 'a');
      room.submitAnswer(ids[2], 'a');
      cmd(room, C.NEXT);
    }
    expect(deltas).toEqual([-50, -50, 0, 0]);
    expect(p(0).score).toBe(-100);
    expect(room.events.filter((e) => e.playerId === ids[0]).map((e) => [e.raw, e.applied])).toEqual([
      [-50, -50], [-50, -50], [-50, 0], [-50, 0],
    ]);
    // 한도는 라운드마다 새로 시작한다
    cmd(room, C.NEXT); cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(room.r).toBe(1);
    expect(room.submitAnswer(ids[0], '틀림').delta).toBe(-25); // 감점 50 × 1문제 → 한도 25
    expect(p(0).score).toBe(-125);
  });

  it('건너뛴 문제는 무효가 되고 손실 한도를 다시 계산한다', () => {
    const { room, ids, p } = makeRoom({ set: makeSet({ rounds: [{ gameMode: 'multiple_choice', questions: [mc(), mc(), mc(), mc()] }] }) });
    cmd(room, C.NEXT);
    for (let i = 0; i < 2; i++) { // 문제 1, 2 오답 → 한도 100 소진
      cmd(room, C.NEXT);
      ids.forEach((id) => room.submitAnswer(id, 'b'));
      cmd(room, C.NEXT);
    }
    cmd(room, C.NEXT); // 문제 3
    room.submitAnswer(ids[0], 'a');
    expect(p(0).score).toBe(0);
    expect(cmd(room, C.SKIP).ok).toBe(true);
    expect(room.q).toBe(3);
    expect(p(0)).toMatchObject({ score: -100, submitCount: 2 });
    expect(room.events.some((e) => e.q === 2)).toBe(false);

    // 이미 채점한 문제로 돌아가 다시 내면 이전 채점은 지워지고 한도가 되살아난다
    ids.forEach((id) => room.submitAnswer(id, 'b'));
    expect(p(0).score).toBe(-100);
    cmd(room, C.GOTO, { round: 0, question: 1 });
    expect(room.phase).toBe(PHASES.QUESTION_OPEN);
    // 문제 2 무효 + 공개 전이던 문제 4 무효 → 문제 1 오답만 남음
    expect(p(0).score).toBe(-50);
    room.submitAnswer(ids[0], 'a');
    expect(p(0).score).toBe(50);
  });

  it('반응속도: 신호 전에 누르면 실격, 빠른 순으로 순위 점수', () => {
    const set = makeSet({ rounds: [{ gameMode: 'reaction', rankPoints: [300, 200], points: 50, questions: [{ timeLimit: 6 }] }] });
    const { room, ids, p } = makeRoom({ set, players: [['가', '중1', 'A'], ['나', '중1', 'B'], ['다', '중2', 'A'], ['라', '중2', 'A']] });
    room._rng = () => 0.5;
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(viewFor(room, ROLES.DISPLAY).reaction).toEqual({ signaled: false });
    expect(room.submitReaction(ids[3], 10)).toMatchObject({ ok: true, falseStart: true });
    vi.advanceTimersByTime(3_000);
    expect(viewFor(room, ROLES.PLAYER, ids[0]).reaction).toEqual({ signaled: true });
    vi.advanceTimersByTime(400);
    room.submitReaction(ids[0], 350);
    room.submitReaction(ids[1], 250);
    room.submitReaction(ids[2], 1); // 사람이 낼 수 없는 값은 하한으로 올린다
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect([p(0).score, p(1).score, p(2).score, p(3).score]).toEqual([50, 200, 300, 0]);
    expect(room.events.find((e) => e.playerId === ids[2]).ms).toBe(80);
    cmd(room, C.NEXT);
    expect(viewFor(room, ROLES.DISPLAY).stats.reaction.map((r) => [r.name, r.rank, r.points])).toEqual([
      ['다', 1, 300], ['나', 2, 200], ['가', 3, 50],
    ]);
  });

  it('이모지 찾기: 오답은 감점 없이 재시도, 같은 조의 코드를 내면 정답', () => {
    const set = makeSet({ rounds: [{ gameMode: 'emoji_find', questions: [{ timeLimit: 60, points: 200, penalty: 50 }] }] });
    const { room, ids, p } = makeRoom({ set, players: [['가', '중1', 'A'], ['나', '중1', 'B']] });
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    const mine = viewFor(room, ROLES.PLAYER, ids[0]).me.emoji;
    const theirs = viewFor(room, ROLES.PLAYER, ids[1]).me.emoji;
    expect(mine.emojiSet).toEqual(theirs.emojiSet);
    expect(room.submitAnswer(ids[0], '00000')).toMatchObject({ ok: true, isCorrect: false, retry: true, delta: 0 });
    expect(room.submitAnswer(ids[0], mine.code).isCorrect).toBe(false); // 자기 코드
    expect(viewFor(room, ROLES.PLAYER, ids[0]).me.answered).toBe(false);
    expect(room.submitAnswer(ids[0], theirs.code)).toMatchObject({ isCorrect: true, delta: 200 });
    expect(room.submitAnswer(ids[0], theirs.code).ok).toBe(false);
    room.submitAnswer(ids[1], mine.code);
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect([p(0).score, p(1).score]).toEqual([200, 200]);
  });
});

describe('참가자', () => {
  it('학년·브릿지를 명단에서 골라야 입장된다', () => {
    const { room } = makeRoom({ players: [] });
    expect(room.register({ name: '  ', group: '중1', unit: 'A' }).ok).toBe(false);
    expect(room.register({ name: '가', group: '중3', unit: 'A' }).ok).toBe(false);
    expect(room.register({ name: '가', group: '중2', unit: 'B' }).ok).toBe(false); // 중2 에는 B 가 없다
    expect(room.register({ name: '가', group: '중2', unit: 'A' }).ok).toBe(true);
    const empty = new Room({ roomCode: 'X' });
    expect(empty.register({ name: '가', group: '중1', unit: 'A' }).ok).toBe(false); // 세트가 올라오기 전
  });

  it('같은 이름·소속: 접속 중이면 거절, 끊겼으면 이어받는다', () => {
    const { room, ids } = makeRoom();
    expect(room.register({ name: '가', group: '중1', unit: 'A' }).ok).toBe(false);
    room.setOnline(ids[0], false);
    expect(room.register({ name: '가', group: '중1', unit: 'A' })).toMatchObject({ ok: true, resumed: true, player: { id: ids[0] } });
    expect(room.register({ name: '가', group: '중1', unit: 'B' })).toMatchObject({ ok: true, resumed: false });
  });

  it('관리자가 소속을 고치거나 내보낼 수 있다', () => {
    const { room, ids, p } = makeRoom();
    expect(room.updatePlayer(ids[0], { group: '중2', unit: 'A' }).ok).toBe(true);
    expect(p(0)).toMatchObject({ group: '중2', unit: 'A' });
    expect(room.updatePlayer(ids[0], { unit: 'Z' }).ok).toBe(false);
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[1], 'a');
    room.removePlayer(ids[1]);
    expect(room.players.size).toBe(2);
    expect(room.events).toHaveLength(0);
  });
});

describe('정답 공개 전 결과 숨김', () => {
  it('참가자는 공개 전까지 정오답·점수 변화를 받지 않는다 (반응속도 포함)', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    room.submitAnswer(ids[1], 'b');
    let me = viewFor(room, ROLES.PLAYER, ids[1]).me;
    expect(me).toMatchObject({ answered: true, answer: 'b', result: null, score: 0 });
    room.submitAnswer(ids[2], 'a');
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect(viewFor(room, ROLES.PLAYER, ids[1]).me).toMatchObject({ result: null, score: 0 });
    cmd(room, C.REVEAL);
    me = viewFor(room, ROLES.PLAYER, ids[1]).me;
    expect(me).toMatchObject({ score: -50, result: { isCorrect: false, delta: -50 } });
    // 다음 문제로 넘어가면 지난 점수는 그대로 보인다
    cmd(room, C.NEXT);
    expect(viewFor(room, ROLES.PLAYER, ids[1]).me).toMatchObject({ score: -50, answered: false, result: null });
  });

  it('반응속도 순위 점수도 공개 때 보인다', () => {
    const set = makeSet({ rounds: [{ gameMode: 'reaction', rankPoints: [300], points: 50, questions: [{ timeLimit: 6 }] }] });
    const { room, ids } = makeRoom({ set, players: [['가', '중1', 'A']] });
    room._rng = () => 0;
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    vi.advanceTimersByTime(1500);
    room.submitReaction(ids[0], 200);
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect(viewFor(room, ROLES.PLAYER, ids[0]).me).toMatchObject({ score: 0, result: null });
    cmd(room, C.REVEAL);
    expect(viewFor(room, ROLES.PLAYER, ids[0]).me).toMatchObject({ score: 300, result: { rank: 1, delta: 300 } });
  });
});

describe('집계와 메인 화면', () => {
  it('상위 10명을 등수·학년·브릿지·이름·점수로 내보낸다', () => {
    const players = Array.from({ length: 14 }, (_, i) => [`참가자${i + 1}`, '중1', i % 2 ? 'A' : 'B']);
    const { room, ids } = makeRoom({ players });
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(cmd(room, C.SHOW_STANDINGS).ok).toBe(false); // 문제 진행 중에는 띄울 수 없다
    ids.forEach((id, i) => { vi.advanceTimersByTime(10); room.submitAnswer(id, i < 12 ? 'a' : 'b'); });
    expect(room.phase).toBe(PHASES.QUESTION_CLOSED);
    expect(cmd(room, C.SHOW_STANDINGS).ok).toBe(false); // 마감 후에도 정답 공개 전에는 점수로 정답이 드러나므로 불가
    cmd(room, C.REVEAL);
    expect(cmd(room, C.SHOW_STANDINGS).ok).toBe(true);
    const { standings } = viewFor(room, ROLES.DISPLAY);
    expect(standings.entries).toHaveLength(10);
    expect(standings.entries[0]).toEqual({ rank: 1, name: '참가자1', group: '중1', unit: 'B', score: 100 });
    // 동점이면 먼저 낸 사람이 위
    expect(standings.entries.map((e) => e.name)).toEqual(Array.from({ length: 10 }, (_, i) => `참가자${i + 1}`));
    // 10위 밖 참가자도 자기 순위는 받는다
    expect(viewFor(room, ROLES.PLAYER, ids[13]).me).toMatchObject({ rank: 14, score: -50 });
    cmd(room, C.HIDE_STANDINGS);
    expect(viewFor(room, ROLES.DISPLAY).standings).toBeNull();
  });

  it('standingsAfter 라운드는 끝나면 집계를 자동으로 띄운다', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.GOTO, { round: 1, question: 0 });
    cmd(room, C.NEXT);
    ids.forEach((id) => room.submitAnswer(id, '방주'));
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(room.phase).toBe(PHASES.ROUND_END);
    expect(room.standings.visible).toBe(true);
  });

  it('메인 화면 전환은 진행을 바꾸지 않고, 다음 진행에서 풀린다', () => {
    const { room } = makeRoom();
    cmd(room, C.NEXT);
    cmd(room, C.SHOW_MAIN);
    expect(viewFor(room, ROLES.DISPLAY)).toMatchObject({ showMain: true, phase: PHASES.ROUND_INTRO });
    cmd(room, C.NEXT);
    expect(room.showMain).toBe(false);
  });
});

describe('저장과 복구', () => {
  it('진행 중인 방을 스냅샷에서 되살린다', () => {
    const { room, ids } = makeRoom();
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    room.submitAnswer(ids[0], 'a');
    vi.advanceTimersByTime(3_000);
    const saved = JSON.parse(JSON.stringify({
      id: room.id, roomCode: room.roomCode, createdAt: room.createdAt,
      set: room.set, state: room.toSnapshot(), events: room.events,
    }));
    room.dispose();

    vi.advanceTimersByTime(2_000); // 서버가 내려가 있던 시간
    const restored = Room.fromSnapshot(saved);
    expect(restored).toMatchObject({ phase: PHASES.QUESTION_OPEN, step: room.step, r: 0, q: 0 });
    expect(restored.players.get(ids[0])).toMatchObject({ score: 100, online: false });
    expect(restored.current.answers.has(ids[0])).toBe(true);
    ids.forEach((id) => restored.setOnline(id, true));
    expect(restored.submitAnswer(ids[0], 'a').ok).toBe(false); // 이미 제출
    expect(restored.submitAnswer(ids[1], 'b').delta).toBe(-50);
    vi.advanceTimersByTime(5_000); // 원래 마감 시각
    expect(restored.phase).toBe(PHASES.QUESTION_CLOSED);
  });
});

describe('정답 참고 이미지', () => {
  it('세트에 넣은 이미지·설명은 정답 공개 때만 모든 화면에 간다', () => {
    const set = makeSet({ rounds: [{ gameMode: 'short_answer', questions: [
      { content: '대한민국의 수도는?', correctAnswer: '서울', answerImage: 'seoul.jpg', answerNote: '1394년부터 수도' },
      { content: 'Q2', correctAnswer: 'x', answerImage: 'https://example.com/a.png' },
    ] }] });
    expect(set.rounds[0].questions[0].answerImage).toBe('/media/seoul.jpg');
    expect(set.rounds[0].questions[1].answerImage).toBe('https://example.com/a.png');
    const { room, ids } = makeRoom({ set });
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    for (const role of [ROLES.DISPLAY, ROLES.HOST, ROLES.ADMIN]) {
      expect(viewFor(room, role).question.answerImage).toBeUndefined();
    }
    expect(viewFor(room, ROLES.PLAYER, ids[0]).question.answerImage).toBeUndefined();
    ids.forEach((id) => room.submitAnswer(id, '서울'));
    expect(viewFor(room, ROLES.DISPLAY).question.answerImage).toBeUndefined(); // 마감했어도 공개 전
    cmd(room, C.REVEAL);
    expect(viewFor(room, ROLES.DISPLAY).question).toMatchObject({ answerImage: '/media/seoul.jpg', answerNote: '1394년부터 수도' });
    expect(viewFor(room, ROLES.PLAYER, ids[0]).question.answerImage).toBe('/media/seoul.jpg');
  });
});
