export function calculateScore(isCorrect, responseTimeMs, timeLimitMs, maxScore, penalty) {
  if (!isCorrect) {
    const speedRatio = 1 - (responseTimeMs / timeLimitMs);
    return -Math.round(penalty * (0.5 + speedRatio * 0.5));
  }
  const timeBonus = Math.max(0, 1 - (responseTimeMs / timeLimitMs));
  return Math.round(maxScore * (0.3 + timeBonus * 0.7));
}

export function normalizeAnswer(answer) {
  if (!answer) return '';
  return answer
    .normalize('NFC')
    .replace(/\s/g, '')
    .toLowerCase();
}

// 장문 비교용 정규화: 공백은 1칸으로 축약(완전 제거하지 않음) + 소문자
function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// 두 문자열의 레벤슈타인 거리 (롤링 배열)
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
      curr[j] = Math.min(
        prev[j] + 1,      // 삭제
        curr[j - 1] + 1,  // 삽입
        prev[j - 1] + cost // 치환
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// 원문 대비 입력 일치도 (0~1). 장문 타이핑 채점용.
export function textSimilarity(input, target) {
  const a = normalizeText(input);
  const b = normalizeText(target);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

// 장문 타이핑 점수: 정확도 우선 + 속도 보너스. 정확도 0이면 0점(감점 없음).
export function computeTypingScore(accuracy, responseTimeMs, timeLimitMs, maxScore) {
  const acc = Math.max(0, Math.min(1, accuracy));
  if (acc <= 0) return 0;
  const speed = Math.max(0, Math.min(1, 1 - responseTimeMs / timeLimitMs));
  return Math.round(maxScore * acc * (0.7 + 0.3 * speed));
}
