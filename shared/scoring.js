// v2 점수 규칙 — 시간과 무관한 고정 점수 + 라운드별 손실 한도.
// 순수 함수만 둔다 (서버·클라이언트·테스트에서 같이 쓴다).

import { GAME_MODES } from './constants.js';

export const SCORING_DEFAULTS = {
  points: 5,           // 문제당 기본 점수 (작은 단위: 5점, 3점 …)
  scaleTo: 5,          // 큰 단위로 쓴 세트를 환산할 기준 점수
  penalty: 0,
  lossCapRatio: 0.5,
  passAccuracy: 0.9,
  timeLimit: 20,
};

export function normalizeAnswer(answer) {
  if (answer === null || answer === undefined) return '';
  return String(answer).normalize('NFC').replace(/\s/g, '').toLowerCase();
}

// 장문 비교용: 공백은 1칸으로 축약, 소문자
function normalizeText(text) {
  if (!text) return '';
  return String(text).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// 원문 대비 입력 일치도 (0~1)
export function textSimilarity(input, target) {
  const a = normalizeText(input);
  const b = normalizeText(target);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

// 라운드 손실 한도 = 라운드 전체 문제 감점 합 × 비율
export function roundLossCap(questions, ratio = SCORING_DEFAULTS.lossCapRatio) {
  const total = questions.reduce((sum, q) => sum + (q.penalty || 0), 0);
  return Math.floor(total * ratio);
}

// 이번 감점 중 실제로 반영할 양. 감점 누계가 한도에 닿으면 0.
export function applyLossCap(lossSoFar, penalty, cap) {
  return Math.max(0, Math.min(penalty, cap - lossSoFar));
}

// 답안 판정. 반응속도·이모지 찾기는 별도 처리하므로 여기 오지 않는다.
export function judgeAnswer(gameMode, question, answer) {
  if (gameMode === GAME_MODES.LONG_TYPING) {
    const accuracy = textSimilarity(answer, question.correctAnswer);
    return { isCorrect: accuracy >= (question.passAccuracy ?? SCORING_DEFAULTS.passAccuracy), accuracy };
  }
  return { isCorrect: normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer) };
}

// 한도 적용 전 점수. 장문 타이핑은 기준 미달이어도 감점하지 않는다.
export function rawDelta(gameMode, question, isCorrect) {
  if (isCorrect) return question.points;
  if (gameMode === GAME_MODES.LONG_TYPING) return 0;
  return -question.penalty;
}

// 반응속도: 순위별 고정 점수, 순위 밖 유효 반응자는 기본 점수
export function reactionPoints(question, rankIndex) {
  const table = question.rankPoints;
  if (Array.isArray(table) && rankIndex < table.length) return table[rankIndex];
  return question.points;
}

// 큰 단위(100점, 1000점 …)로 쓴 세트를 작은 단위로 환산할 비율.
// 세트에서 가장 많이 쓰인 문제 점수(기준 점수)를 scaleTo 로 맞춘다. 기준 점수가 작으면(≤ 10) 환산하지 않는다.
export function scaleFactor(pointValues, scaleTo = SCORING_DEFAULTS.scaleTo) {
  const counts = new Map();
  for (const v of pointValues) if (v > 0) counts.set(v, (counts.get(v) || 0) + 1);
  if (counts.size === 0) return { factor: 1, base: null };
  // 가장 많이 쓰인 값, 같으면 작은 값
  const [base] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (base <= 10) return { factor: 1, base };
  return { factor: scaleTo / base, base };
}

// 환산한 점수. 0이 아닌 값은 최소 1점으로 남긴다 (작은 감점이 사라지지 않게).
export function scalePoints(value, factor) {
  if (!value || factor === 1) return value;
  return Math.max(1, Math.round(value * factor));
}
