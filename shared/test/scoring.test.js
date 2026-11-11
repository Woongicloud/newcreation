import { describe, it, expect } from 'vitest';
import {
  roundLossCap, applyLossCap, judgeAnswer, rawDelta, reactionPoints, normalizeAnswer, textSimilarity,
} from '../scoring.js';
import { GAME_MODES } from '../constants.js';

describe('손실 한도', () => {
  const round = Array.from({ length: 8 }, () => ({ penalty: 50 }));

  it('라운드 전체 감점 합의 50%', () => {
    expect(roundLossCap(round)).toBe(200);
    expect(roundLossCap(round, 0.25)).toBe(100);
    expect(roundLossCap([{ penalty: 0 }, {}])).toBe(0);
  });

  it('감점 누계가 한도에 닿으면 더 깎이지 않는다', () => {
    const cap = roundLossCap(round);
    let loss = 0;
    const applied = [];
    for (let i = 0; i < 8; i++) {
      const a = applyLossCap(loss, 50, cap);
      loss += a;
      applied.push(a);
    }
    expect(applied).toEqual([50, 50, 50, 50, 0, 0, 0, 0]);
    expect(loss).toBe(200);
  });

  it('한도를 넘는 감점은 남은 만큼만 반영', () => {
    expect(applyLossCap(180, 50, 200)).toBe(20);
  });
});

describe('판정과 점수', () => {
  const q = { correctAnswer: 'Amazing Grace', points: 100, penalty: 30 };

  it('공백·대소문자를 무시하고 비교', () => {
    expect(judgeAnswer(GAME_MODES.SHORT_ANSWER, q, ' amazing  grace').isCorrect).toBe(true);
    expect(judgeAnswer(GAME_MODES.SHORT_ANSWER, q, 'grace').isCorrect).toBe(false);
    expect(normalizeAnswer(null)).toBe('');
  });

  it('맞으면 지정 점수, 틀리면 지정 감점 — 시간과 무관', () => {
    expect(rawDelta(GAME_MODES.SHORT_ANSWER, q, true)).toBe(100);
    expect(rawDelta(GAME_MODES.SHORT_ANSWER, q, false)).toBe(-30);
  });

  it('장문 타이핑은 정확도 기준, 미달이어도 감점 없음', () => {
    const typing = { correctAnswer: '태초에 하나님이 천지를 창조하시니라', points: 200, penalty: 50, passAccuracy: 0.9 };
    const exact = judgeAnswer(GAME_MODES.LONG_TYPING, typing, '태초에 하나님이 천지를 창조하시니라');
    expect(exact).toEqual({ isCorrect: true, accuracy: 1 });
    const poor = judgeAnswer(GAME_MODES.LONG_TYPING, typing, '태초에');
    expect(poor.isCorrect).toBe(false);
    expect(rawDelta(GAME_MODES.LONG_TYPING, typing, false)).toBe(0);
    expect(textSimilarity('', '')).toBe(1);
  });

  it('반응속도는 순위별 점수, 순위 밖은 기본 점수', () => {
    const r = { points: 50, rankPoints: [300, 200, 100] };
    expect([0, 1, 2, 3, 9].map((i) => reactionPoints(r, i))).toEqual([300, 200, 100, 50, 50]);
    expect(reactionPoints({ points: 70 }, 0)).toBe(70);
  });
});
