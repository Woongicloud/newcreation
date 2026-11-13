import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PHASES, COMMANDS as C, ROLES } from '../../shared/protocol.js';
import { teamScores, rankPlayers, unitKey } from '../src/rooms/standings.js';
import { computeAwards, drawWinners, revealedPart } from '../src/rooms/awards.js';
import { viewFor } from '../src/rooms/views.js';
import { makeRoom, makeSet, mc, cmd } from './helpers.js';

const player = (name, group, unit, score, extra = {}) => ({
  id: name, name, group, unit, score, totalResponseMs: 1000, submitCount: 1, chatCount: 0, joinedAt: 0, ...extra,
});

describe('팀 점수 — 보정 평균', () => {
  // 플랜 3.5 의 예: 전체 평균 800, A 2명(평균 1,400), B 8명(평균 1,150)
  const players = [
    ...[1400, 1400].map((s, i) => player(`a${i}`, '중1', 'A', s)),
    ...Array.from({ length: 8 }, (_, i) => player(`b${i}`, '중1', 'B', 1150)),
    ...Array.from({ length: 10 }, (_, i) => player(`c${i}`, '중2', 'C', 400)),
  ];

  it('가상의 평균 참가자 3명을 더해 평균을 낸다', () => {
    expect(players.reduce((s, p) => s + p.score, 0) / players.length).toBe(800);
    const result = teamScores(players, unitKey, { method: 'adjusted', weight: 3 });
    expect(result.map((t) => [t.key, t.score, t.members])).toEqual([
      ['중1/B', 1054.5, 8],  // (9,200 + 2,400) ÷ 11 — 소수 첫째 자리까지
      ['중1/A', 1040, 2],    // (2,800 + 2,400) ÷ 5
      ['중2/C', 492.3, 10],  // (4,000 + 2,400) ÷ 13
    ]);
    expect(result.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it('단순 평균이면 소수 팀이 이긴다 — 보정이 순위를 바꾸는 경우', () => {
    expect(teamScores(players, unitKey, { method: 'average' })[0]).toMatchObject({ key: '중1/A', score: 1400 });
    expect(teamScores(players, unitKey, { method: 'sum' })[0]).toMatchObject({ key: '중1/B', score: 9200 });
    expect(teamScores(players, unitKey, { method: 'adjusted', weight: 0 })[0].key).toBe('중1/A');
  });

  it('한 번도 제출하지 않은 참가자는 계산에서 뺀다', () => {
    const withIdle = [...players, player('idle', '중1', 'A', 0, { submitCount: 0 })];
    expect(teamScores(withIdle, unitKey)).toEqual(teamScores(players, unitKey));
    expect(teamScores([player('idle', '중1', 'A', 0, { submitCount: 0 })], unitKey)).toEqual([]);
  });
});

describe('시상 계산', () => {
  const players = [
    player('가', '중1', 'A', 500, { chatCount: 2, totalResponseMs: 9000, submitCount: 3 }),
    player('나', '중1', 'B', 400, { chatCount: 9 }),
    player('다', '중2', 'A', 300, { totalResponseMs: 600, submitCount: 2 }),
    player('라', '중2', 'A', 200),
  ];
  const awardsOf = (items) => computeAwards(makeSet({ awards: { items } }), players, [
    { playerId: '라', r: 1, applied: 90 }, { playerId: '가', r: 1, applied: 40 }, { playerId: '가', r: 0, applied: 400 },
  ]);

  it('이번 행사 세트: 브릿지 순위 · 추첨 3명 · 개인 5위 · 중간값', () => {
    const items = computeAwards(makeSet(), players, []);
    expect(items.map((i) => [i.type, i.title, i.steps])).toEqual([
      ['unit_ranking', '브릿지 순위', 3],
      ['random', '행운상', 3],
      ['individual_ranking', '개인 순위', 4], // 참가자가 4명뿐
      ['special', '뉴평 중간값', 1],
    ]);
    expect(items[0].result.sections[0].entries.map((e) => `${e.group} ${e.name}`)).toEqual(['중1 A', '중1 B', '중2 A']);
    // 짝수 인원이면 위쪽 순위 (4명 → 2등)
    expect(items[3].result).toMatchObject({ winner: { name: '나', rank: 2 }, detail: '4명 중 2등' });
  });

  it('특별상 기준', () => {
    const [rank, fastest, chattiest, roundBest, missing] = awardsOf([
      { type: 'special', metric: 'rank', rank: 3 },
      { type: 'special', metric: 'fastest' },
      { type: 'special', metric: 'chattiest' },
      { type: 'special', metric: 'round_best', round: 2 },
      { type: 'special', metric: 'rank', rank: 31 },
    ]);
    expect(rank.result.winner.name).toBe('다');
    expect(fastest.result).toMatchObject({ winner: { name: '다' }, detail: '평균 0.30초' });
    expect(chattiest.result).toMatchObject({ winner: { name: '나' }, detail: '채팅 9회' });
    expect(roundBest.result.winner.name).toBe('라');
    expect(missing).toMatchObject({ steps: 0, result: { winner: null } }); // 31등이 없으면 공개할 것이 없다
  });

  it('순위는 하위부터 한 줄씩 공개된다', () => {
    const [item] = awardsOf([{ type: 'individual_ranking', top: 3 }]);
    const names = (step) => revealedPart(item, step).sections[0].entries.map((e) => e.name);
    expect([0, 1, 2, 3].map(names)).toEqual([[], ['다'], ['나', '다'], ['가', '나', '다']]);
    const [byGroup] = awardsOf([{ type: 'individual_ranking', scope: 'group', top: 1 }]);
    expect(byGroup.steps).toBe(2);
    expect(revealedPart(byGroup, 1).sections).toEqual([{ label: '중1', entries: [expect.objectContaining({ name: '가', rank: 1 })] }]);
  });

  it('추첨은 중복 없이 뽑는다', () => {
    const winners = drawWinners(players, 3, () => 0);
    expect(winners.map((w) => w.name)).toEqual(['가', '나', '다']);
    expect(drawWinners(players, 10)).toHaveLength(4);
  });

  it('동점이면 누적 응답 시간이 짧은 쪽이 위', () => {
    const tied = [player('느림', '중1', 'A', 100, { totalResponseMs: 5000 }), player('빠름', '중1', 'A', 100, { totalResponseMs: 2000 })];
    expect(rankPlayers(tied).map((e) => e.name)).toEqual(['빠름', '느림']);
  });
});

describe('시상 진행', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('next 로 항목을 열고 한 단계씩 공개한 뒤 메인 화면으로 돌린다', () => {
    const set = makeSet({ rounds: [{ gameMode: 'multiple_choice', questions: [mc()] }] });
    const { room, ids } = makeRoom({ set });
    room._rng = () => 0;
    cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(cmd(room, C.AWARD_NEXT).ok).toBe(false); // 게임이 끝나기 전
    ids.forEach((id, i) => { vi.advanceTimersByTime(100); room.submitAnswer(id, i === 2 ? 'b' : 'a'); });
    cmd(room, C.NEXT); cmd(room, C.NEXT); cmd(room, C.NEXT);
    expect(room.phase).toBe(PHASES.FINAL);
    expect(viewFor(room, ROLES.HOST).next).toMatchObject({ action: 'award_next', title: '브릿지 순위' });

    cmd(room, C.NEXT);
    expect(room.phase).toBe(PHASES.AWARDS);
    let display = viewFor(room, ROLES.DISPLAY);
    expect(display.award).toMatchObject({ index: 0, total: 4, title: '브릿지 순위', step: 0, steps: 3 });
    expect(display.award.revealed.sections[0].entries).toEqual([]);
    expect(display.award.result).toBeUndefined();        // Display 는 공개 전 결과를 받지 않는다
    expect(viewFor(room, ROLES.HOST).award.result.sections[0].entries).toHaveLength(3); // 진행자는 미리 본다

    cmd(room, C.NEXT); cmd(room, C.NEXT); cmd(room, C.NEXT);
    display = viewFor(room, ROLES.DISPLAY);
    expect(display.award.revealed.sections[0].entries.map((e) => e.rank)).toEqual([1, 2, 3]);

    cmd(room, C.NEXT); // 다 공개했으면 다음 항목 — 추첨
    expect(viewFor(room, ROLES.DISPLAY).award).toMatchObject({ title: '행운상', reveal: 'slot', steps: 3, step: 0 });
    expect(viewFor(room, ROLES.DISPLAY).award.revealed.winners).toEqual([]);
    cmd(room, C.NEXT);
    expect(viewFor(room, ROLES.DISPLAY).award.revealed.winners).toHaveLength(1);

    cmd(room, C.AWARD_NEXT); // 남은 단계를 건너뛰고 다음 항목으로
    cmd(room, C.AWARD_NEXT);
    expect(viewFor(room, ROLES.DISPLAY).award.title).toBe('뉴평 중간값');
    cmd(room, C.NEXT);
    expect(viewFor(room, ROLES.DISPLAY).award.revealed.winner.name).toBe('나');
    expect(cmd(room, C.NEXT).ok).toBe(false); // 더 진행할 항목 없음
    expect(viewFor(room, ROLES.HOST).next.action).toBeNull();

    expect(cmd(room, C.SHOW_MAIN).ok).toBe(true);
    expect(viewFor(room, ROLES.DISPLAY)).toMatchObject({ showMain: true, phase: PHASES.AWARDS });
  });
});

describe('시상 세트 편집', () => {
  it('시상 시작 전에는 바꿀 수 있고, 종료 뒤에 바꾸면 결과를 다시 계산한다', async () => {
    const { validateAwards } = await import('../../shared/quizSchema.js');
    const set = makeSet({ rounds: [{ gameMode: 'multiple_choice', questions: [mc()] }] });
    const { room, ids } = makeRoom({ set });
    const ctx = { teams: set.teams, roundCount: 1 };
    expect(validateAwards([{ type: 'nope' }], ctx).ok).toBe(false);
    expect(validateAwards('x', ctx).ok).toBe(false);

    cmd(room, C.NEXT); cmd(room, C.NEXT);
    ids.forEach((id) => room.submitAnswer(id, 'a'));
    cmd(room, C.END_GAME);
    expect(room.awards.items).toHaveLength(4);
    const quick = validateAwards([{ type: 'individual_ranking', title: '개인', reveal: 'podium', top: 3 }], ctx);
    expect(room.setAwards(quick.awards).ok).toBe(true);
    expect(room.awards.items.map((i) => [i.title, i.reveal, i.steps])).toEqual([['개인', 'podium', 3]]);
    cmd(room, C.NEXT);
    expect(room.setAwards(quick.awards).ok).toBe(false); // 시상 시작 후
  });
});
