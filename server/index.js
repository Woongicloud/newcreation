import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SOCKET_EVENTS } from '../shared/constants.js';
import {
  createSession,
  registerPlayer,
  getSession,
  getPlayerList,
  loadQuestions,
  startGame,
  submitAnswer,
  submitReaction,
  nextQuestion,
  nextRound,
  endGame,
  handleDisconnect,
  rejoinSession,
} from './gameEngine.js';
import { handleChat } from './chatHandler.js';

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  (process.env.CLIENT_URL || '').replace(/\/$/, ''),
  'http://localhost:5173',
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function verifyAdmin(password) {
  return password === process.env.ADMIN_PASSWORD;
}

function emitError(socket, message) {
  socket.emit(SOCKET_EVENTS.ERROR, { message });
}

io.on('connection', (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);

  // ── 참가자 등록 ──────────────────────────────────────────
  socket.on(SOCKET_EVENTS.PLAYER_REGISTER, async ({ name, className, roomCode }) => {
    try {
      const session = getSession(roomCode);
      if (!session) return emitError(socket, '존재하지 않는 방 코드입니다.');

      const player = await registerPlayer(roomCode, socket.id, { name, className });
      socket.join(roomCode);
      socket.data = { roomCode, playerId: player.id };

      socket.emit('player:registered', { player, roomCode });

      const players = getPlayerList(roomCode);
      io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_JOINED, { players });

      console.log(`[Game] ${name}(${className}) joined room ${roomCode}`);
    } catch (err) {
      console.error('[player:register]', err.message);
      emitError(socket, err.message);
    }
  });

  // ── 재접속 ───────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.PLAYER_REJOIN, ({ roomCode, playerId }) => {
    const state = rejoinSession(roomCode, socket.id, playerId, io);
    if (state) {
      socket.join(roomCode);
      socket.data = { roomCode, playerId };
      socket.emit(SOCKET_EVENTS.GAME_STATE_SYNC, state);
      const players = getPlayerList(roomCode);
      io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_JOINED, { players });
    }
  });

  // ── Display 입장 ─────────────────────────────────────────
  socket.on('display:join', ({ roomCode }) => {
    const session = getSession(roomCode);
    if (!session) return emitError(socket, '존재하지 않는 방 코드입니다.');
    socket.join(roomCode);
    socket.data = { roomCode, isDisplay: true };
    // 현재 접속 인원 즉시 전송
    socket.emit(SOCKET_EVENTS.GAME_PLAYER_JOINED, {
      players: getPlayerList(roomCode),
    });
    console.log(`[Display] joined room: ${roomCode}`);
  });

  // ── 정답 제출 ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.PLAYER_SUBMIT, async (payload) => {
    const { roomCode } = socket.data || {};
    if (!roomCode) return;
    await submitAnswer(roomCode, socket.id, payload, io);
  });

  // ── 반응게임 탭 ──────────────────────────────────────────
  socket.on(SOCKET_EVENTS.PLAYER_REACTION, (payload) => {
    const { roomCode } = socket.data || {};
    if (!roomCode) return;
    submitReaction(roomCode, socket.id, payload, io);
  });

  // ── 채팅 ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CHAT_SEND, ({ message, sender }) => {
    const { roomCode } = socket.data || {};
    if (!roomCode || !message?.trim()) return;
    handleChat(roomCode, message.trim(), sender?.trim() || '', io);
  });

  // ── Admin: 방 생성 ────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ADMIN_CREATE_ROOM, async ({ password }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    try {
      const result = await createSession(io);
      socket.join(result.roomCode);
      socket.data = { roomCode: result.roomCode, isAdmin: true };
      socket.emit('admin:room_created', result);
      console.log(`[Admin] Room created: ${result.roomCode}`);
    } catch (err) {
      console.error('[admin:create_room]', err.message);
      emitError(socket, err.message);
    }
  });

  // ── Admin: 문제 업로드 ────────────────────────────────────
  socket.on(SOCKET_EVENTS.ADMIN_UPLOAD_QUESTIONS, async ({ password, roomCode, rounds }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    try {
      await loadQuestions(roomCode, rounds);
      socket.emit('admin:questions_loaded', { count: rounds.length });
      console.log(`[Admin] Questions loaded for ${roomCode}: ${rounds.length} rounds`);
    } catch (err) {
      console.error('[admin:upload_questions]', err.message);
      emitError(socket, err.message);
    }
  });

  // ── Admin: 게임 시작 ──────────────────────────────────────
  socket.on(SOCKET_EVENTS.ADMIN_START_GAME, ({ password, roomCode }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    try {
      startGame(roomCode, io);
      console.log(`[Admin] Game started: ${roomCode}`);
    } catch (err) {
      console.error('[admin:start_game]', err.message);
      emitError(socket, err.message);
    }
  });

  // ── Admin: 다음 문제 ──────────────────────────────────────
  socket.on(SOCKET_EVENTS.ADMIN_NEXT_QUESTION, ({ password, roomCode }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    nextQuestion(roomCode, io);
  });

  // ── Admin: 다음 라운드 ────────────────────────────────────
  socket.on('admin:next_round', ({ password, roomCode }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    nextRound(roomCode, io);
  });

  // ── Admin: 강제 종료 ──────────────────────────────────────
  socket.on(SOCKET_EVENTS.ADMIN_END_GAME, ({ password, roomCode }) => {
    if (!verifyAdmin(password)) return emitError(socket, '관리자 인증 실패');
    endGame(roomCode, io);
  });

  // ── 연결 해제 ────────────────────────────────────────────
  socket.on('disconnect', () => {
    handleDisconnect(socket.id);
    console.log(`[Socket] disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
