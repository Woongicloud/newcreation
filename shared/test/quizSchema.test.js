import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateQuizSet } from '../quizSchema.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
const mc = (extra = {}) => ({ content: 'Q', choices: ['a', 'b'], correctAnswer: 'a', ...extra });
const base = (rounds, extra = {}) => ({ rounds, ...extra });

describe('validateQuizSet', () => {
  it('v2 샘플 세트를 통과시키고 점수를 문제마다 채운다', () => {
    const { ok, errors, set } = validateQuizSet(load('sample_quiz_set_v2.json'));
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
    const [r1, r2, r3] = set.rounds;
    expect(r1.questions.map((q) => q.points)).toEqual([5, 5, 5, 15]); // 세트 기본값 + 문제 지정
    expect(r1.questions.every((q) => q.penalty === 3)).toBe(true);
    expect(r2.questions.map((q) => q.points)).toEqual([8, 8]); // 라운드 지정
    expect(r3.questions[0].rankPoints).toEqual([15, 10, 5]);
    expect(set.teams.groups).toHaveLength(3);
    expect(set.awards.map((a) => a.type)).toEqual(['unit_ranking', 'random', 'individual_ranking', 'special']);
    expect(set.standingsTop).toBe(10);
  });

  it('기존 포맷 세트도 읽는다 (maxScore → points)', () => {
    for (const name of ['sample_quiz_set.json', 'test-questions.json']) {
      const { ok, errors, warnings, set } = validateQuizSet(load(name));
      expect(errors, name).toEqual([]);
      expect(ok).toBe(true);
      expect(set.rounds.length).toBeGreaterThan(0);
      // 팀 설정이 없으면 팀 순위 시상은 빠진다
      expect(set.awards.some((a) => a.type === 'unit_ranking')).toBe(false);
      expect(warnings.some((w) => w.message.includes('팀'))).toBe(true);
    }
    const legacy = validateQuizSet(load('sample_quiz_set.json'));
    // 1000점 단위 세트는 기준 1000점 → 5점으로 환산된다 (감점 200 → 1)
    expect(legacy.set.rounds[0].questions[0]).toMatchObject({ points: 5, penalty: 1 });
    expect(legacy.warnings.some((w) => w.path === 'scoring' && w.message.includes('1000점 → 5점'))).toBe(true);
    expect(legacy.warnings.some((w) => w.message.includes('maxScore'))).toBe(true);
    // 상대 경로 미디어는 /media/ 로
    const img = legacy.set.rounds.find((r) => r.gameMode === 'image_quiz').questions[0];
    expect(img.imageUrls[0].startsWith('/media/') || img.imageUrls[0].startsWith('http')).toBe(true);
  });

  it('awards 를 생략하면 이번 행사 세트를 쓴다', () => {
    const { set } = validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc()] }], {
      teams: { groups: [{ name: '중1', units: ['A'] }] },
    }));
    expect(set.awards.map((a) => [a.type, a.title])).toEqual([
      ['unit_ranking', '브릿지 순위'],
      ['random', '행운상'],
      ['individual_ranking', '개인 순위'],
      ['special', '뉴평 중간값'],
    ]);
    expect(set.awards[1].count).toBe(3);
    expect(set.awards[2].top).toBe(5);
    expect(set.teams).toMatchObject({ teamScore: 'adjusted', teamScoreWeight: 3, labels: { group: '학년', unit: '브릿지' } });
  });

  it('오류 위치를 경로로 알려준다', () => {
    const { ok, errors, set } = validateQuizSet(base([
      { gameMode: 'multiple_choice', questions: [mc({ correctAnswer: 'z' }), mc({ timeLimit: -1 })] },
      { gameMode: 'nope', questions: [mc()] },
      { gameMode: 'consonant', questions: [{ content: 'Q', correctAnswer: 'a' }] },
      { gameMode: 'short_answer', questions: [] },
    ], { teams: { groups: [{ name: '중1', units: ['A', 'A'] }, { name: '중1', units: ['B'] }] } }));
    expect(ok).toBe(false);
    expect(set).toBeNull();
    const paths = errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining([
      'rounds[0].questions[0].correctAnswer',
      'rounds[0].questions[1].timeLimit',
      'rounds[1].gameMode',
      'rounds[2].questions[0].consonantHint',
      'rounds[3].questions',
      'teams.groups[0].units[1]',
      'teams.groups[1].name',
    ]));
  });

  it('객체가 아니거나 라운드가 없으면 거부', () => {
    expect(validateQuizSet(null).ok).toBe(false);
    expect(validateQuizSet([]).ok).toBe(false);
    expect(validateQuizSet({ rounds: [] }).errors[0].path).toBe('rounds');
  });

  it('시상 항목의 잘못된 값을 잡는다', () => {
    const { errors } = validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc()] }], {
      awards: { items: [{ type: 'special', metric: 'rank' }, { type: 'random', reveal: 'boom' }, { type: 'x' }] },
    }));
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining([
      'awards.items[0].rank', 'awards.items[1].reveal', 'awards.items[2].type',
    ]));
  });

  it('큰 단위 세트는 가장 많이 쓰인 점수를 5점으로 맞춰 비율로 환산한다', () => {
    const { set, warnings } = validateQuizSet(base([
      { gameMode: 'multiple_choice', questions: [mc({ points: 100, penalty: 50 }), mc({ points: 100 }), mc({ points: 300 })] },
      { gameMode: 'reaction', rankPoints: [300, 200, 100], points: 50, questions: [{ timeLimit: 5 }] },
    ]));
    const [r1, r2] = set.rounds;
    expect(r1.questions.map((q) => [q.points, q.penalty])).toEqual([[5, 3], [5, 0], [15, 0]]); // 감점 2.5 → 3
    expect(r2.questions[0]).toMatchObject({ points: 3, rankPoints: [15, 10, 5] });
    expect(warnings.find((w) => w.path === 'scoring').message).toContain('100점 → 5점');
  });

  it('이미 작은 단위면 그대로 두고, autoScale:false 면 환산하지 않는다', () => {
    const small = validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc({ points: 5, penalty: 3 }), mc({ points: 3 })] }]));
    expect(small.set.rounds[0].questions.map((q) => q.points)).toEqual([5, 3]);
    expect(small.warnings.some((w) => w.path === 'scoring')).toBe(false);
    // 아무것도 안 적으면 기본 5점
    expect(validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc()] }])).set.rounds[0].questions[0].points).toBe(5);
    const off = validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc({ points: 100 })] }], { scoring: { autoScale: false } }));
    expect(off.set.rounds[0].questions[0].points).toBe(100);
  });

  it('scaleTo 로 기준 점수를 바꿀 수 있다', () => {
    const { set } = validateQuizSet(base([{ gameMode: 'multiple_choice', questions: [mc({ points: 100, penalty: 50 })] }], { scoring: { scaleTo: 10 } }));
    expect(set.rounds[0].questions[0]).toMatchObject({ points: 10, penalty: 5 });
  });
});

describe('answerImage', () => {
  it('잘못된 값은 위치와 함께 알려준다', async () => {
    const { validateQuizSet: v } = await import('../quizSchema.js');
    const { errors } = v({ rounds: [{ gameMode: 'short_answer', questions: [{ content: 'Q', correctAnswer: 'a', answerImage: '', answerNote: 3 }] }] });
    expect(errors.map((e) => e.path)).toEqual(['rounds[0].questions[0].answerImage', 'rounds[0].questions[0].answerNote']);
  });
});

describe('복수 정답', () => {
  const sa = (q) => ({ rounds: [{ gameMode: 'short_answer', questions: [{ content: 'Q', ...q }] }] });

  it('acceptAnswers 를 정리해서 받는다 (빈 칸·중복 제거)', async () => {
    const { validateQuizSet: v } = await import('../quizSchema.js');
    const { set } = v(sa({ correctAnswer: '베드로', acceptAnswers: ['시몬', ' 시몬 ', '', 7] }));
    expect(set.rounds[0].questions[0]).toMatchObject({ correctAnswer: '베드로', acceptAnswers: ['시몬', '7'] });
  });

  it('정답을 배열로 적으면 첫 번째가 대표, 나머지는 인정 답', async () => {
    const { validateQuizSet: v } = await import('../quizSchema.js');
    const { set } = v(sa({ correctAnswer: ['서울', '서울특별시', 'Seoul'] }));
    expect(set.rounds[0].questions[0]).toMatchObject({ correctAnswer: '서울', acceptAnswers: ['서울특별시', 'Seoul'] });
  });

  it('객관식에 넣으면 경고하고 무시, 잘못된 형식은 오류', async () => {
    const { validateQuizSet: v } = await import('../quizSchema.js');
    const mc = v({ rounds: [{ gameMode: 'multiple_choice', questions: [{ content: 'Q', choices: ['a', 'b'], correctAnswer: 'a', acceptAnswers: ['b'] }] }] });
    expect(mc.set.rounds[0].questions[0].acceptAnswers).toBeUndefined();
    expect(mc.warnings.some((w) => w.path.endsWith('acceptAnswers'))).toBe(true);
    expect(v(sa({ correctAnswer: 'a', acceptAnswers: 'b' })).errors[0].path).toBe('rounds[0].questions[0].acceptAnswers');
  });
});
