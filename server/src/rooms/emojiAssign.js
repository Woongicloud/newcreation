// 이모지 사람 찾기 — 참가자별 이모지 세트 + 코드 배정

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 풀에서 size개 무작위 추출 (중복 없이)
function sample(pool, size) {
  return shuffle(pool).slice(0, size);
}

function randomCode(usedCodes) {
  let code;
  let attempts = 0;
  do {
    code = String(Math.floor(10000 + Math.random() * 90000)); // 5자리
    attempts++;
  } while (usedCodes.has(code) && attempts < 50);
  usedCodes.add(code);
  return code;
}

/**
 * playerIds 를 2~3명 그룹으로 나누고, 그룹마다 서로 다른 이모지 세트와
 * 사람마다 고유한 5자리 코드를 배정한다.
 *
 * @returns {{ assignments: Map<string,{code,groupId,emojiSet}>, codeToPlayerId: Map<string,string> }}
 */
export function buildEmojiAssignments(playerIds, { emojiPool, setSize = 3, groupSize = 2 } = {}) {
  const pool = Array.isArray(emojiPool) && emojiPool.length >= setSize
    ? emojiPool
    : ['🐶', '🐱', '🦁', '🐰', '🐻', '🚗', '🏠', '🌳', '⚽', '🎸', '🍎', '🌙', '⭐', '🐢', '🦊'];
  const size = Math.max(2, Math.min(setSize, pool.length));
  const gSize = Math.max(2, groupSize);

  const ids = shuffle(playerIds);

  // 그룹 청크 — 마지막 그룹이 1명이면 직전 그룹에 병합 (모든 그룹 ≥2 보장)
  const groups = [];
  for (let i = 0; i < ids.length; i += gSize) groups.push(ids.slice(i, i + gSize));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    const last = groups.pop();
    groups[groups.length - 1].push(...last);
  }

  const assignments = new Map();
  const codeToPlayerId = new Map();
  const usedCodes = new Set();
  const usedSetKeys = new Set();

  groups.forEach((group, groupId) => {
    // 그룹마다 서로 다른 이모지 세트
    let emojiSet;
    let attempts = 0;
    do {
      emojiSet = sample(pool, size);
      attempts++;
    } while (usedSetKeys.has([...emojiSet].sort().join('|')) && attempts < 50);
    usedSetKeys.add([...emojiSet].sort().join('|'));

    group.forEach((pid) => {
      const code = randomCode(usedCodes);
      assignments.set(pid, { code, groupId, emojiSet });
      codeToPlayerId.set(code, pid);
    });
  });

  return { assignments, codeToPlayerId };
}
