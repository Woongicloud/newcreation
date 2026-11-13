// 개인 순위와 팀 점수 계산 (순수 함수).

// 점수 내림차순 → 누적 응답 시간 오름차순 → 먼저 입장한 순
export function rankPlayers(players, scoreOf = (p) => p.score) {
  return [...players]
    .sort((a, b) =>
      scoreOf(b) - scoreOf(a)
      || a.totalResponseMs - b.totalResponseMs
      || a.joinedAt - b.joinedAt)
    .map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      name: p.name,
      group: p.group,
      unit: p.unit,
      score: scoreOf(p),
    }));
}

// 한 번이라도 답을 제출한 참가자만 팀 점수에 넣는다 (등록만 하고 나간 사람 제외)
export const isParticipant = (p) => p.submitCount > 0;

/**
 * 팀 점수.
 *  - adjusted: (팀원 점수 합 + weight × 전체 평균) ÷ (인원 + weight)
 *  - average : 단순 평균
 *  - sum     : 합계
 * @param keyOf  참가자 → 팀 키 (null 이면 제외)
 * @returns [{ rank, key, score, members, average }]
 */
export function teamScores(players, keyOf, { method = 'adjusted', weight = 3 } = {}) {
  const active = players.filter(isParticipant);
  if (active.length === 0) return [];
  const globalAvg = active.reduce((s, p) => s + p.score, 0) / active.length;

  const teams = new Map();
  for (const p of active) {
    const key = keyOf(p);
    if (key === null || key === undefined || key === '') continue;
    const t = teams.get(key) || { key, sum: 0, members: 0 };
    t.sum += p.score;
    t.members += 1;
    teams.set(key, t);
  }

  return [...teams.values()]
    .map((t) => {
      const average = t.sum / t.members;
      let exact;
      if (method === 'sum') exact = t.sum;
      else if (method === 'average') exact = average;
      else exact = (t.sum + weight * globalAvg) / (t.members + weight);
      // 문제당 점수가 작아(5점 등) 정수로 반올림하면 팀끼리 같아 보이므로 소수 첫째 자리까지
      const round1 = (v) => Math.round(v * 10) / 10;
      return { key: t.key, exact, score: round1(exact), members: t.members, average: round1(average) };
    })
    .sort((a, b) => b.exact - a.exact || b.average - a.average || String(a.key).localeCompare(String(b.key)))
    .map(({ exact, ...t }, i) => ({ rank: i + 1, ...t }));
}

export const unitKey = (p) => (p.group && p.unit ? `${p.group}/${p.unit}` : null);
export const groupKey = (p) => p.group || null;
