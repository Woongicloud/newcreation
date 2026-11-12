// 방 목록 관리 + 방의 변경을 저장소에 반영.
import { Room } from './room.js';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O, I, 0, 1 제외
const SAVE_DELAY_MS = 250;
const FINISHED_TTL_MS = 3 * 60 * 60 * 1000;
const IDLE_TTL_MS = 24 * 60 * 60 * 1000;

function generateRoomCode(rng = Math.random) {
  return Array.from({ length: 6 }, () => ROOM_CHARS[Math.floor(rng() * ROOM_CHARS.length)]).join('');
}

export class RoomRegistry {
  constructor(persistence) {
    this.persistence = persistence;
    this.rooms = new Map(); // roomCode → Room
    this._saveTimers = new Map();
    this._queues = new Map(); // 방마다 저장 순서를 지키기 위한 직렬 큐
    this._listeners = new Set();
    this.databaseError = null; // 마지막 저장소 오류 (/api/health 에 노출)
    this._sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);
    this._sweeper.unref?.();
  }

  // 방이 생기거나 복구될 때마다 호출 (소켓 계층이 이벤트를 연결한다)
  onRoom(listener) {
    this._listeners.add(listener);
    for (const room of this.rooms.values()) listener(room);
  }

  get(roomCode) {
    return typeof roomCode === 'string' ? this.rooms.get(roomCode.trim().toUpperCase()) || null : null;
  }

  async create() {
    let roomCode;
    let attempts = 0;
    do {
      roomCode = generateRoomCode();
      if (++attempts > 50) throw new Error('방 코드 생성 실패');
    } while (this.rooms.has(roomCode));
    const room = new Room({ roomCode });
    try {
      await this.persistence.createRoom({ id: room.id, roomCode, createdAt: room.createdAt });
      this.databaseError = null;
    } catch (e) {
      this.databaseError = e.message;
      throw e;
    }
    this._attach(room);
    return room;
  }

  async restore() {
    const saved = await this.persistence.loadActive();
    for (const row of saved) {
      if (this.rooms.has(row.roomCode)) continue;
      this._attach(Room.fromSnapshot(row));
    }
    return saved.length;
  }

  async close(roomCode) {
    const room = this.get(roomCode);
    if (!room) return false;
    clearTimeout(this._saveTimers.get(room.id));
    this._saveTimers.delete(room.id);
    this.rooms.delete(room.roomCode);
    room.emit('closed');
    room.dispose();
    await this._enqueue(room.id, () => this.persistence.closeRoom(room.id));
    this._queues.delete(room.id);
    return true;
  }

  list() {
    return [...this.rooms.values()].map((room) => ({
      roomCode: room.roomCode,
      sessionName: room.set?.sessionName || null,
      phase: room.phase,
      createdAt: room.createdAt,
      playerCount: room.players.size,
      onlineCount: room.onlineCount(),
    })).sort((a, b) => b.createdAt - a.createdAt);
  }

  // 끝난 지 오래된 방과 방치된 방 정리
  sweep(now = Date.now()) {
    for (const room of this.rooms.values()) {
      const finishedLongAgo = room.finishedAt && now - room.finishedAt > FINISHED_TTL_MS;
      const abandoned = now - room.createdAt > IDLE_TTL_MS && room.onlineCount() === 0;
      if (finishedLongAgo || abandoned) this.close(room.roomCode).catch((e) => console.error(e.message));
    }
  }

  _enqueue(id, task) {
    const prev = this._queues.get(id) || Promise.resolve();
    const next = prev.then(task)
      .then(() => { this.databaseError = null; })
      .catch((e) => { this.databaseError = e.message; console.error(e.message); });
    this._queues.set(id, next);
    return next;
  }

  _scheduleSave(room) {
    if (this._saveTimers.has(room.id)) return;
    this._saveTimers.set(room.id, setTimeout(() => {
      this._saveTimers.delete(room.id);
      const snapshot = room.toSnapshot();
      this._enqueue(room.id, () => this.persistence.saveState(room.id, room.phase, snapshot));
    }, SAVE_DELAY_MS));
  }

  _attach(room) {
    const db = this.persistence;
    this.rooms.set(room.roomCode, room);
    let savedSet = room.set;
    let awardsSaved = false;
    room.on('state', () => {
      if (room.set && room.set !== savedSet) {
        savedSet = room.set;
        this._enqueue(room.id, () => db.saveSet(room.id, savedSet));
      }
      if (room.isFinished && !awardsSaved) {
        awardsSaved = true;
        const result = room.awards.items;
        this._enqueue(room.id, () => db.saveAwards(room.id, result));
      }
      this._scheduleSave(room);
    });
    room.on('roster', () => this._scheduleSave(room));
    room.on('progress', () => this._scheduleSave(room));
    room.on('players', (players) => {
      const rows = players.map((p) => ({ ...p }));
      this._enqueue(room.id, () => db.upsertPlayers(room.id, rows));
    });
    room.on('player_removed', (playerId) => this._enqueue(room.id, () => db.deletePlayer(room.id, playerId)));
    room.on('score_events', (events) => {
      const rows = events.map((e) => ({ ...e }));
      this._enqueue(room.id, () => db.insertEvents(room.id, rows));
    });
    room.on('round_rewrite', (r, events) => {
      const rows = events.map((e) => ({ ...e }));
      this._enqueue(room.id, () => db.rewriteRound(room.id, r, rows));
    });
    for (const listener of this._listeners) listener(room);
  }

  // 대기 중인 저장을 모두 끝낸다 (종료·테스트용)
  async flush() {
    for (const [id, timer] of this._saveTimers) {
      clearTimeout(timer);
      this._saveTimers.delete(id);
      const room = [...this.rooms.values()].find((r) => r.id === id);
      if (room) {
        const snapshot = room.toSnapshot();
        this._enqueue(id, () => this.persistence.saveState(id, room.phase, snapshot));
      }
    }
    await Promise.all(this._queues.values());
  }

  dispose() {
    clearInterval(this._sweeper);
    for (const timer of this._saveTimers.values()) clearTimeout(timer);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
