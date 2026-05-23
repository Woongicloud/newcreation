import { SOCKET_EVENTS, GAME_STATUS } from '../shared/constants.js';
import { calculateScore } from './scoringEngine.js';
import supabase from './supabase.js';

// O, I, 0, 1 제외로 혼동 방지
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  return Array.from({ length: 6 }, () =>
    ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
  ).join('');
}

// 메모리 세션 저장소
const sessions = {};

function getSession(roomCode) {
  return sessions[roomCode] || null;
}

async function createSession(io) {
  let roomCode;
  let attempts = 0;
  do {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 20) throw new Error('방 코드 생성 실패');
  } while (sessions[roomCode]);

  const { data, error } = await supabase
    .from('sessions')
    .insert({ room_code: roomCode, status: GAME_STATUS.WAITING })
    .select()
    .single();

  if (error) throw error;

  sessions[roomCode] = {
    sessionId: data.id,
    roomCode,
    status: GAME_STATUS.WAITING,
    rounds: [],
    currentRound: 0,
    currentQuestionIndex: 0,
    players: new Map(),       // socketId → { id, name, className, score }
    timer: null,
    questionStartTime: null,
    submittedAnswers: new Set(),
    reactionResults: [],
  };

  return { roomCode, sessionId: data.id };
}

async function registerPlayer(roomCode, socketId, { name, className }) {
  const session = sessions[roomCode];
  if (!session) throw new Error('존재하지 않는 방입니다.');
  if (session.status !== GAME_STATUS.WAITING) throw new Error('이미 시작된 게임입니다.');

  const { data, error } = await supabase
    .from('players')
    .insert({ session_id: session.sessionId, name, class_name: className, socket_id: socketId })
    .select()
    .single();

  if (error) throw error;

  const playerData = { id: data.id, name, className, score: 0, socketId };
  session.players.set(socketId, playerData);

  await supabase.from('players').update({ socket_id: socketId }).eq('id', data.id);

  return playerData;
}

function getPlayerList(roomCode) {
  const session = sessions[roomCode];
  if (!session) return [];
  return Array.from(session.players.values());
}

async function loadQuestions(roomCode, roundsData) {
  const session = sessions[roomCode];
  if (!session) throw new Error('존재하지 않는 방입니다.');

  const formattedRounds = [];

  for (const round of roundsData) {
    const { data: roundRow, error: rErr } = await supabase
      .from('rounds')
      .insert({
        session_id: session.sessionId,
        round_number: round.roundNumber,
        theme: round.theme,
        game_mode: round.gameMode,
      })
      .select()
      .single();

    if (rErr) throw rErr;

    const questions = [];
    for (let i = 0; i < round.questions.length; i++) {
      const q = round.questions[i];
      const { data: qRow, error: qErr } = await supabase
        .from('questions')
        .insert({
          round_id: roundRow.id,
          question_number: i + 1,
          content: q.content,
          image_url: q.imageUrl || null,
          consonant_hint: q.consonantHint || null,
          correct_answer: q.correctAnswer,
          choices: q.choices || null,
          time_limit: q.timeLimit || 20,
          max_score: q.maxScore || 1000,
          penalty: q.penalty || 200,
        })
        .select()
        .single();

      if (qErr) throw qErr;
      questions.push({
        ...q,
        id: qRow.id,
        questionNumber: i + 1,
        maxScore: qRow.max_score,
        penalty: qRow.penalty,
        timeLimit: qRow.time_limit,
      });
    }

    formattedRounds.push({ ...round, id: roundRow.id, questions });
  }

  session.rounds = formattedRounds;
  return formattedRounds;
}

function startGame(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) throw new Error('존재하지 않는 방입니다.');
  if (!session.rounds.length) throw new Error('문제가 없습니다. 먼저 문제를 업로드하세요.');

  session.status = GAME_STATUS.PLAYING;
  session.currentRound = 0;
  session.currentQuestionIndex = 0;

  supabase.from('sessions').update({ status: GAME_STATUS.PLAYING }).eq('id', session.sessionId);

  broadcastQuestion(roomCode, io);
}

function broadcastQuestion(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  const round = session.rounds[session.currentRound];
  if (!round) return endGame(roomCode, io);

  const question = round.questions[session.currentQuestionIndex];
  if (!question) return endRound(roomCode, io);

  session.submittedAnswers = new Set();
  session.reactionResults = [];
  session.questionStartTime = Date.now();
  session.questionEnded = false;

  const safeQuestion = {
    id: question.id,
    content: question.content,
    imageUrl: question.imageUrl,
    consonantHint: question.consonantHint,
    choices: question.choices,
    timeLimit: question.timeLimit,
    maxScore: question.maxScore,
    gameMode: round.gameMode,
    questionNumber: question.questionNumber,
    roundNumber: round.roundNumber,
    theme: round.theme,
  };

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_QUESTION_START, {
    question: safeQuestion,
    timeLimit: question.timeLimit,
    questionNumber: question.questionNumber,
    totalQuestions: round.questions.length,
  });

  // 반응게임: 랜덤 딜레이 후 신호
  if (round.gameMode === 'reaction') {
    const delay = 1000 + Math.random() * 3000;
    session.reactionSignalTime = Date.now() + delay;
    setTimeout(() => {
      if (session.status === GAME_STATUS.PLAYING) {
        session.reactionSignalTime = Date.now();
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_REACTION_START, { signal: true });
      }
    }, delay);
  }

  let remaining = question.timeLimit;
  session.timer = setInterval(() => {
    remaining--;
    io.to(roomCode).emit(SOCKET_EVENTS.GAME_TIMER_TICK, { remaining });
    if (remaining <= 0) endQuestion(roomCode, io);
  }, 1000);
}

async function submitAnswer(roomCode, socketId, { questionId, answer, responseTimeMs }, io) {
  const session = sessions[roomCode];
  if (!session || session.status !== GAME_STATUS.PLAYING) return;
  if (session.submittedAnswers.has(socketId)) return;

  session.submittedAnswers.add(socketId);

  const player = session.players.get(socketId);
  if (!player) return;

  const round = session.rounds[session.currentRound];
  const question = round?.questions[session.currentQuestionIndex];
  if (!question || question.id !== questionId) return;

  const { normalizeAnswer } = await import('./scoringEngine.js');
  const isCorrect = normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
  const scoreDelta = calculateScore(
    isCorrect,
    responseTimeMs,
    question.timeLimit * 1000,
    question.maxScore,
    question.penalty
  );

  player.score += scoreDelta;

  await supabase.from('answers').insert({
    question_id: questionId,
    player_id: player.id,
    answer,
    is_correct: isCorrect,
    response_time_ms: responseTimeMs,
    score_delta: scoreDelta,
  });

  await supabase.from('players').update({ score: player.score }).eq('id', player.id);

  io.to(socketId).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
    playerId: player.id,
    isCorrect,
    scoreDelta,
    newScore: player.score,
  });

  // Display에 제출 카운트 알림 (정답 미포함)
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
    submittedCount: session.submittedAnswers.size,
    totalPlayers: session.players.size,
  });

  // 모두 제출하면 즉시 종료
  if (session.submittedAnswers.size >= session.players.size) {
    endQuestion(roomCode, io);
  }
}

async function submitReaction(roomCode, socketId, { reactionTimeMs }, io) {
  const session = sessions[roomCode];
  if (!session) return;
  if (session.submittedAnswers.has(socketId)) return;

  session.submittedAnswers.add(socketId);
  const player = session.players.get(socketId);
  if (!player) return;

  session.reactionResults.push({ socketId, playerId: player.id, name: player.name, reactionTimeMs });

  if (session.submittedAnswers.size >= session.players.size) {
    endQuestion(roomCode, io);
  }
}

function endQuestion(roomCode, io) {
  const session = sessions[roomCode];
  if (!session || session.questionEnded) return;
  session.questionEnded = true;

  clearInterval(session.timer);
  session.timer = null;

  const round = session.rounds[session.currentRound];
  const question = round?.questions[session.currentQuestionIndex];
  if (!question) return;

  let reactionFinalResults = [];
  if (round.gameMode === 'reaction') {
    // 반응 속도 순서대로 점수 차등 지급
    session.reactionResults.sort((a, b) => a.reactionTimeMs - b.reactionTimeMs);
    const maxPoints = question.maxScore || 1000;
    session.reactionResults.forEach((r, idx) => {
      const player = session.players.get(r.socketId);
      if (!player) return;
      const points = Math.max(100, Math.round(maxPoints * (1 - idx * 0.1)));
      player.score += points;
      reactionFinalResults.push({ ...r, rank: idx + 1, points, newScore: player.score });
      supabase.from('players').update({ score: player.score }).eq('id', player.id);
    });
    io.to(roomCode).emit(SOCKET_EVENTS.GAME_REACTION_END, { results: reactionFinalResults });
  }

  const scores = Array.from(session.players.values()).map((p) => ({
    playerId: p.id,
    name: p.name,
    className: p.className,
    newScore: p.score,
  }));

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_QUESTION_END, {
    correctAnswer: question.correctAnswer,
    scores,
    submittedCount: session.submittedAnswers.size,
  });
}

function nextQuestion(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  clearInterval(session.timer);
  session.timer = null;

  const round = session.rounds[session.currentRound];
  if (!round) return;

  session.currentQuestionIndex++;

  if (session.currentQuestionIndex >= round.questions.length) {
    endRound(roomCode, io);
  } else {
    broadcastQuestion(roomCode, io);
  }
}

function endRound(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  const leaderboard = Array.from(session.players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p, idx) => ({ rank: idx + 1, name: p.name, className: p.className, score: p.score }));

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_END, { leaderboard });

  session.currentRound++;
  session.currentQuestionIndex = 0;
}

function nextRound(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  if (session.currentRound >= session.rounds.length) {
    endGame(roomCode, io);
  } else {
    broadcastQuestion(roomCode, io);
  }
}

function endGame(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  clearInterval(session.timer);
  session.status = GAME_STATUS.FINISHED;
  supabase.from('sessions').update({ status: GAME_STATUS.FINISHED }).eq('id', session.sessionId);

  const finalLeaderboard = Array.from(session.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({ rank: idx + 1, name: p.name, className: p.className, score: p.score }));

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_END, { leaderboard: finalLeaderboard, isFinal: true });
}

function handleDisconnect(socketId) {
  for (const [roomCode, session] of Object.entries(sessions)) {
    if (session.players.has(socketId)) {
      session.players.get(socketId).isOnline = false;
      supabase.from('players').update({ is_online: false }).eq('socket_id', socketId);
    }
  }
}

function rejoinSession(roomCode, socketId, playerId, io) {
  const session = sessions[roomCode];
  if (!session) return null;

  for (const [oldSocketId, player] of session.players.entries()) {
    if (player.id === playerId) {
      session.players.delete(oldSocketId);
      player.socketId = socketId;
      player.isOnline = true;
      session.players.set(socketId, player);

      supabase.from('players').update({ socket_id: socketId, is_online: true }).eq('id', playerId);

      const round = session.rounds[session.currentRound];
      const question = round?.questions[session.currentQuestionIndex];
      return {
        status: session.status,
        currentQuestion: question ? {
          ...question,
          gameMode: round.gameMode,
          roundNumber: round.roundNumber,
          theme: round.theme,
        } : null,
        players: Array.from(session.players.values()),
        timeRemaining: session.timer ? null : 0,
      };
    }
  }
  return null;
}

export {
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
};
