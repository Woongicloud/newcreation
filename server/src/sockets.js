// Socket.io 계층 — 인증·역할 확인 후 Room 에 전달하고, Room 의 변경을 역할별로 내보낸다.
import { EVENTS, ROLES, ERRORS, COMMANDS } from '../../shared/protocol.js';
import { validateQuizSet } from '../../shared/quizSchema.js';
import { signToken, verifyToken } from './auth.js';
import { buildContext, viewFor } from './rooms/views.js';

const CHAT_MAX_LENGTH = 60;
const CHAT_MIN_INTERVAL_MS = 700;
const COMMAND_TYPES = new Set(Object.values(COMMANDS));

const channel = {
  role: (code, role) => `${code}:${role}`,
  player: (code, playerId) => `${code}:p:${playerId}`,
};

const fail = (error, message) => ({ ok: false, error, message });

export function attachSockets(io, registry) {
  // 접속 중인 소켓 수로 참가자 온라인 여부를 센다 (탭 여러 개·재접속 대비)
  const connections = new Map(); // `${code}:${playerId}` → count

  function broadcastState(room, { includePlayers = true } = {}) {
    const ctx = buildContext(room);
    const code = room.roomCode;
    for (const role of [ROLES.DISPLAY, ROLES.HOST, ROLES.ADMIN]) {
      io.to(channel.role(code, role)).emit(EVENTS.ROOM_STATE, viewFor(room, role, null, ctx));
    }
    if (!includePlayers) return;
    for (const playerId of room.players.keys()) {
      io.to(channel.player(code, playerId)).emit(EVENTS.ROOM_STATE, viewFor(room, ROLES.PLAYER, playerId, ctx));
    }
  }

  registry.onRoom((room) => {
    const code = room.roomCode;
    room.on('state', () => broadcastState(room));
    room.on('roster', () => broadcastState(room, { includePlayers: false }));
    room.on('progress', () => {
      const payload = { step: room.step, submittedCount: room.submittedCount(), onlineCount: room.onlineCount() };
      for (const role of [ROLES.DISPLAY, ROLES.HOST, ROLES.ADMIN]) {
        io.to(channel.role(code, role)).emit(EVENTS.ROOM_PROGRESS, payload);
      }
    });
    room.on('private', (playerId, event, payload) => io.to(channel.player(code, playerId)).emit(event, payload));
    room.on('closed', () => {
      io.to(code).emit(EVENTS.ROOM_CLOSED, { roomCode: code });
      io.in(code).socketsLeave(code);
    });
  });

  io.use((socket, next) => {
    // 관리자는 연결할 때 토큰을 싣는다 (방에 들어가기 전에도 방 생성·목록 조회를 해야 하므로)
    const payload = verifyToken(socket.handshake.auth?.token);
    socket.data.isAdmin = payload?.role === ROLES.ADMIN;
    next();
  });

  io.on('connection', (socket) => {
    // 모든 요청은 ack 콜백으로 { ok, ... } 를 돌려준다
    const on = (event, handler) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          reply(await handler(payload && typeof payload === 'object' ? payload : {}));
        } catch (e) {
          console.error(`[socket] ${event}:`, e.message);
          reply(fail('internal', '서버 오류가 발생했습니다.'));
        }
      });
    };

    function leaveCurrent() {
      const { roomCode, role, playerId } = socket.data;
      if (!roomCode) return;
      socket.leave(roomCode);
      socket.leave(channel.role(roomCode, role));
      if (role === ROLES.PLAYER) {
        socket.leave(channel.player(roomCode, playerId));
        const key = `${roomCode}:${playerId}`;
        const left = (connections.get(key) || 1) - 1;
        if (left <= 0) {
          connections.delete(key);
          registry.get(roomCode)?.setOnline(playerId, false);
        } else {
          connections.set(key, left);
        }
      }
      socket.data.roomCode = null;
      socket.data.role = null;
      socket.data.playerId = null;
    }

    function enter(room, role, playerId = null) {
      leaveCurrent();
      const code = room.roomCode;
      socket.data.roomCode = code;
      socket.data.role = role;
      socket.data.playerId = playerId;
      socket.join(code);
      socket.join(channel.role(code, role));
      if (role === ROLES.PLAYER) {
        socket.join(channel.player(code, playerId));
        const key = `${code}:${playerId}`;
        connections.set(key, (connections.get(key) || 0) + 1);
        room.setOnline(playerId, true);
      }
      return viewFor(room, role, playerId);
    }

    const currentRoom = () => registry.get(socket.data.roomCode);
    const adminRoom = (roomCode) => (socket.data.isAdmin ? registry.get(roomCode ?? socket.data.roomCode) : null);

    // ── 입장 ───────────────────────────────────────────────
    on(EVENTS.ROOM_JOIN, ({ roomCode, token, role }) => {
      const room = registry.get(roomCode);
      if (!room) return fail(ERRORS.NOT_FOUND, '존재하지 않는 방 코드입니다.');

      if (token) {
        const payload = verifyToken(token);
        if (!payload) return fail(ERRORS.FORBIDDEN, '인증이 만료되었습니다. 다시 접속해주세요.');
        if (payload.role === ROLES.ADMIN) {
          socket.data.isAdmin = true;
          return { ok: true, role: ROLES.ADMIN, state: enter(room, ROLES.ADMIN) };
        }
        if (payload.room !== room.roomCode) return fail(ERRORS.FORBIDDEN, '이 방의 권한이 아닙니다.');
        if (payload.role === ROLES.HOST) return { ok: true, role: ROLES.HOST, state: enter(room, ROLES.HOST) };
        if (payload.role === ROLES.PLAYER) {
          if (!room.players.has(payload.pid)) return fail(ERRORS.NOT_FOUND, '참가 정보를 찾을 수 없습니다. 다시 등록해주세요.');
          return { ok: true, role: ROLES.PLAYER, state: enter(room, ROLES.PLAYER, payload.pid) };
        }
        return fail(ERRORS.FORBIDDEN, '알 수 없는 권한입니다.');
      }
      if (socket.data.isAdmin && role === ROLES.ADMIN) {
        return { ok: true, role: ROLES.ADMIN, state: enter(room, ROLES.ADMIN) };
      }
      // 토큰 없이는 Display 로만 들어올 수 있다 (정답은 공개 단계에서만 전달됨)
      if (role === ROLES.DISPLAY) return { ok: true, role: ROLES.DISPLAY, state: enter(room, ROLES.DISPLAY) };
      return fail(ERRORS.FORBIDDEN, '권한이 필요합니다.');
    });

    on(EVENTS.PLAYER_REGISTER, ({ roomCode, name, group, unit }) => {
      const room = registry.get(roomCode);
      if (!room) return fail(ERRORS.NOT_FOUND, '존재하지 않는 방 코드입니다.');
      const result = room.register({ name, group, unit });
      if (!result.ok) return result;
      const { player } = result;
      const token = signToken({ role: ROLES.PLAYER, room: room.roomCode, pid: player.id });
      return { ok: true, token, playerId: player.id, state: enter(room, ROLES.PLAYER, player.id) };
    });

    // ── 참가자 ─────────────────────────────────────────────
    on(EVENTS.PLAYER_ANSWER, ({ answer }) => {
      const room = currentRoom();
      if (!room || socket.data.role !== ROLES.PLAYER) return fail(ERRORS.FORBIDDEN, '참가자만 제출할 수 있습니다.');
      return room.submitAnswer(socket.data.playerId, answer);
    });

    on(EVENTS.PLAYER_REACT, ({ clientMs }) => {
      const room = currentRoom();
      if (!room || socket.data.role !== ROLES.PLAYER) return fail(ERRORS.FORBIDDEN, '참가자만 누를 수 있습니다.');
      return room.submitReaction(socket.data.playerId, clientMs);
    });

    let lastChatAt = 0;
    on(EVENTS.CHAT_SEND, ({ message }) => {
      const room = currentRoom();
      if (!room || socket.data.role !== ROLES.PLAYER) return fail(ERRORS.FORBIDDEN, '참가자만 보낼 수 있습니다.');
      const text = typeof message === 'string' ? message.trim().replace(/\s+/g, ' ').slice(0, CHAT_MAX_LENGTH) : '';
      if (!text) return fail(ERRORS.BAD_REQUEST, '메시지가 비어 있습니다.');
      if (!room.settings.chatEnabled) return fail(ERRORS.INVALID, '지금은 채팅이 꺼져 있습니다.');
      const now = Date.now();
      if (now - lastChatAt < CHAT_MIN_INTERVAL_MS) return fail(ERRORS.INVALID, '조금 천천히 보내주세요.');
      lastChatAt = now;
      const player = room.players.get(socket.data.playerId);
      if (!player) return fail(ERRORS.NOT_FOUND, '참가자를 찾을 수 없습니다.');
      room.addChat(player.id);
      // 글자 크기·속도는 Display 가 표시 설정으로 정한다. 서버는 세로 위치만 흩뿌린다.
      io.to(room.roomCode).emit(EVENTS.CHAT_MESSAGE, {
        id: `${now}-${socket.id.slice(0, 4)}`,
        message: text,
        sender: player.name,
        y: Math.round(5 + Math.random() * 80),
      });
      registry.persistence.insertChat(room.id, player.id, text).catch((e) => console.error(e.message));
      return { ok: true };
    });

    // ── 진행 (진행자·관리자 공용) ──────────────────────────
    on(EVENTS.HOST_COMMAND, ({ type, ...args }) => {
      const room = currentRoom();
      const { role } = socket.data;
      if (!room || (role !== ROLES.HOST && role !== ROLES.ADMIN)) return fail(ERRORS.FORBIDDEN, '진행 권한이 없습니다.');
      if (!COMMAND_TYPES.has(type)) return fail(ERRORS.BAD_REQUEST, '알 수 없는 명령입니다.');
      return room.command(type, args);
    });

    // ── 관리자 전용 ────────────────────────────────────────
    const adminOnly = (handler) => (payload) => {
      if (!socket.data.isAdmin) return fail(ERRORS.FORBIDDEN, '관리자 권한이 필요합니다.');
      return handler(payload);
    };
    const withRoom = (handler) => adminOnly((payload) => {
      const room = adminRoom(payload.roomCode);
      if (!room) return fail(ERRORS.NOT_FOUND, '존재하지 않는 방입니다.');
      return handler(room, payload);
    });

    on(EVENTS.ADMIN_CREATE_ROOM, adminOnly(async () => {
      const room = await registry.create();
      return { ok: true, roomCode: room.roomCode, state: enter(room, ROLES.ADMIN) };
    }));

    on(EVENTS.ADMIN_LOAD_SET, withRoom((room, { set }) => {
      const result = validateQuizSet(set);
      if (!result.ok) return { ok: false, error: ERRORS.BAD_REQUEST, message: '세트에 오류가 있습니다.', errors: result.errors, warnings: result.warnings };
      const loaded = room.loadSet(result.set);
      if (!loaded.ok) return loaded;
      return {
        ok: true,
        warnings: result.warnings,
        summary: {
          sessionName: result.set.sessionName,
          rounds: result.set.rounds.length,
          questions: result.set.rounds.reduce((n, r) => n + r.questions.length, 0),
          groups: result.set.teams?.groups.length ?? 0,
          awards: result.set.awards.map((a) => a.title),
        },
      };
    }));

    on(EVENTS.ADMIN_SETTINGS, withRoom((room, { patch }) => room.updateSettings(patch)));
    on(EVENTS.ADMIN_UPDATE_PLAYER, withRoom((room, { playerId, name, group, unit }) => room.updatePlayer(playerId, { name, group, unit })));
    on(EVENTS.ADMIN_REMOVE_PLAYER, withRoom((room, { playerId }) => {
      const result = room.removePlayer(playerId);
      if (result.ok) io.in(channel.player(room.roomCode, playerId)).disconnectSockets(true);
      return result;
    }));
    on(EVENTS.ADMIN_HOST_TOKEN, withRoom((room) => ({
      ok: true,
      roomCode: room.roomCode,
      token: signToken({ role: ROLES.HOST, room: room.roomCode }),
    })));
    on(EVENTS.ADMIN_LIST_ROOMS, adminOnly(() => ({ ok: true, rooms: registry.list() })));
    on(EVENTS.ADMIN_CLOSE_ROOM, withRoom(async (room) => {
      await registry.close(room.roomCode);
      return { ok: true };
    }));

    socket.on('disconnect', leaveCurrent);
  });
}
