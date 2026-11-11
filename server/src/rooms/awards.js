// 최종 시상 계산. 세트의 awards 항목마다 결과와 공개 단계 수를 만든다.
// 추첨(random)은 여기서 뽑지 않고 공개 시점에 drawWinners 로 뽑는다.

import { rankPlayers, teamScores, isParticipant, unitKey, groupKey } from './standings.js';

const brief = (e) => ({ rank: e.rank, name: e.name, group: e.group, unit: e.unit, score: e.score });

function rankingSections(entries, scope, top) {
  const cut = (list) => (top ? list.slice(0, top) : list);
  if (scope === 'all') return [{ label: null, entries: cut(entries) }];
  const keyOf = scope === 'group' ? (e) => e.group : (e) => (e.group && e.unit ? `${e.group} ${e.unit}` : null);
  const map = new Map();
  for (const e of entries) {
    const k = keyOf(e);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({ label, entries: cut(list.map((e, i) => ({ ...e, rank: i + 1 }))) }));
}

function stepsFor(item, result) {
  if (item.reveal === 'bar_race' || item.reveal === 'scroll') return 1;
  if (result.kind === 'ranking') {
    return result.sections.length > 1 ? result.sections.length : result.sections[0]?.entries.length || 0;
  }
  if (result.kind === 'draw') return item.count;
  return result.winner ? 1 : 0;
}

export function computeAwards(set, players, events) {
  const list = [...players];
  const ranked = rankPlayers(list);
  const byId = new Map(list.map((p) => [p.id, p]));
  const teamOpts = { method: set.teams?.teamScore, weight: set.teams?.teamScoreWeight };

  return set.awards.map((item) => {
    let result;
    if (item.type === 'individual_ranking') {
      result = { kind: 'ranking', sections: rankingSections(ranked.map(brief), item.scope, item.top) };
    } else if (item.type === 'group_ranking') {
      const teams = teamScores(list, groupKey, teamOpts)
        .map((t) => ({ rank: t.rank, name: t.key, score: t.score, members: t.members }));
      result = { kind: 'ranking', team: true, sections: [{ label: null, entries: item.top ? teams.slice(0, item.top) : teams }] };
    } else if (item.type === 'unit_ranking') {
      const teams = teamScores(list, unitKey, teamOpts).map((t) => {
        const [group, unit] = t.key.split('/');
        return { rank: t.rank, name: unit, group, score: t.score, members: t.members };
      });
      let sections;
      if (item.scope === 'group') {
        const map = new Map();
        for (const t of teams) {
          if (!map.has(t.group)) map.set(t.group, []);
          map.get(t.group).push(t);
        }
        sections = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
          .map(([label, ts]) => ({ label, entries: ts.map((t, i) => ({ ...t, rank: i + 1 })) }));
      } else {
        sections = [{ label: null, entries: item.top ? teams.slice(0, item.top) : teams }];
      }
      result = { kind: 'ranking', team: true, sections };
    } else if (item.type === 'random') {
      result = { kind: 'draw', winners: [] };
    } else {
      result = { kind: 'single', ...specialWinner(item, ranked, byId, events) };
    }
    return { ...item, result, steps: stepsFor(item, result) };
  });
}

function specialWinner(item, ranked, byId, events) {
  const none = { winner: null, detail: null };
  if (ranked.length === 0) return none;
  if (item.metric === 'rank') {
    const e = ranked[item.rank - 1];
    return e ? { winner: brief(e), detail: `${e.rank}등` } : none;
  }
  if (item.metric === 'middle') {
    // 정중앙. 짝수면 위쪽 순위
    const e = ranked[Math.floor((ranked.length - 1) / 2)];
    return { winner: brief(e), detail: `${ranked.length}명 중 ${e.rank}등` };
  }
  if (item.metric === 'fastest') {
    let best = null;
    for (const e of ranked) {
      const p = byId.get(e.playerId);
      if (!isParticipant(p)) continue;
      const avg = p.totalResponseMs / p.submitCount;
      if (!best || avg < best.avg) best = { e, avg };
    }
    return best ? { winner: brief(best.e), detail: `평균 ${(best.avg / 1000).toFixed(2)}초` } : none;
  }
  if (item.metric === 'chattiest') {
    let best = null;
    for (const e of ranked) {
      const count = byId.get(e.playerId).chatCount || 0;
      if (count > 0 && (!best || count > best.count)) best = { e, count };
    }
    return best ? { winner: brief(best.e), detail: `채팅 ${best.count}회` } : none;
  }
  if (item.metric === 'round_best') {
    const r = item.round - 1;
    const totals = new Map();
    for (const ev of events) if (ev.r === r) totals.set(ev.playerId, (totals.get(ev.playerId) || 0) + ev.applied);
    const top = rankPlayers([...byId.values()].filter((p) => totals.has(p.id)), (p) => totals.get(p.id))[0];
    return top ? { winner: brief({ ...top, rank: 1 }), detail: `${item.round}라운드 ${top.score}점` } : none;
  }
  return none;
}

// 추첨: 참여한 사람 중에서 중복 없이 count 명
export function drawWinners(players, count, rng = Math.random) {
  const all = [...players];
  const pool = all.some(isParticipant) ? all.filter(isParticipant) : all;
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const [p] = pool.splice(Math.floor(rng() * pool.length), 1);
    picked.push({ name: p.name, group: p.group, unit: p.unit, score: p.score });
  }
  return picked;
}

// 지금까지 공개된 부분만 잘라낸다 (Display·참가자용)
export function revealedPart(item, step) {
  const { result } = item;
  const all = step >= item.steps;
  if (result.kind === 'ranking') {
    if (item.reveal === 'bar_race' || item.reveal === 'scroll') {
      return { kind: 'ranking', team: !!result.team, sections: step >= 1 ? result.sections : [] };
    }
    if (result.sections.length > 1) {
      return { kind: 'ranking', team: !!result.team, sections: result.sections.slice(0, step) };
    }
    // 하위부터 한 줄씩
    const entries = result.sections[0]?.entries || [];
    return {
      kind: 'ranking',
      team: !!result.team,
      sections: [{ label: null, entries: all ? entries : entries.slice(entries.length - step) }],
    };
  }
  if (result.kind === 'draw') return { kind: 'draw', winners: result.winners.slice(0, step) };
  return { kind: 'single', winner: step >= 1 ? result.winner : null, detail: step >= 1 ? result.detail : null };
}
