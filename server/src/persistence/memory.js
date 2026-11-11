// 메모리 저장소 — 테스트용, 그리고 Supabase 설정 없이 로컬에서 띄울 때 쓴다.
export function createMemoryPersistence() {
  const sessions = new Map(); // id → { id, roomCode, createdAt, status, set, state, events, players }
  const chats = [];
  return {
    kind: 'memory',
    sessions,
    chats,
    async createRoom({ id, roomCode, createdAt }) {
      sessions.set(id, { id, roomCode, createdAt, status: 'lobby', set: null, state: null, events: [], players: new Map() });
    },
    async saveSet(id, set) { const s = sessions.get(id); if (s) s.set = structuredClone(set); },
    async saveState(id, status, state) {
      const s = sessions.get(id);
      if (s) { s.status = status; s.state = structuredClone(state); }
    },
    async saveAwards() {},
    async upsertPlayers(id, players) {
      const s = sessions.get(id);
      if (s) for (const p of players) s.players.set(p.id, { ...p });
    },
    async deletePlayer(id, playerId) { sessions.get(id)?.players.delete(playerId); },
    async insertEvents(id, events) { sessions.get(id)?.events.push(...structuredClone(events)); },
    async rewriteRound(id, r, events) {
      const s = sessions.get(id);
      if (s) s.events = [...s.events.filter((e) => e.r !== r), ...structuredClone(events)];
    },
    async insertChat(id, playerId, message) { chats.push({ id, playerId, message }); },
    async closeRoom(id) { const s = sessions.get(id); if (s) s.status = 'closed'; },
    async loadActive() {
      return [...sessions.values()]
        .filter((s) => s.status !== 'closed')
        .map((s) => ({ id: s.id, roomCode: s.roomCode, createdAt: s.createdAt, set: s.set, state: s.state, events: structuredClone(s.events) }));
    },
    media: null,
  };
}
