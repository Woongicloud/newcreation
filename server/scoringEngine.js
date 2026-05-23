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
