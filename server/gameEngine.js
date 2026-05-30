import { SOCKET_EVENTS, GAME_STATUS, GAME_MODES } from '../shared/constants.js';
import { calculateScore, normalizeAnswer, textSimilarity, computeTypingScore } from './scoringEngine.js';
import { buildEmojiAssignments } from './emojiAssign.js';
import supabase from './supabase.js';

// O, I, 0, 1 제외로 혼동 방지
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  return Array.from({ length: 6 }, () =>
    ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
  ).join('');
}

// 상대 경로 파일명을 /media/ 절대 경로로 변환
function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('/') || url.startsWith('http')) return url;
  return `/media/${url}`;
}

// 메모리 세션 저장소
const sessions = {};

function getSession(roomCode) {
  return sessions[roomCode] || null;
}

// 세션 내 playerId로 플레이어 조회 (socketId가 새로고침으로 바뀌어도 안전)
function findPlayerById(session, playerId) {
  for (const player of session.players.values()) {
    if (player.id === playerId) return player;
  }
  return null;
}

// 온라인 인원 수 (isOnline === false 인 끊긴/유령 유저 제외)
function onlineCount(session) {
  let n = 0;
  for (const player of session.players.values()) {
    if (player.isOnline !== false) n++;
  }
  return n;
}

// socketId 엔트리를 세션에서 제거 (새 방 재등록 시 이전 방 유령 정리)
function removePlayerFromSession(roomCode, socketId) {
  const session = sessions[roomCode];
  if (!session) return false;
  return session.players.delete(socketId);
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
    createdAt: Date.now(),
    rounds: [],
    currentRound: 0,
    currentQuestionIndex: 0,
    players: new Map(),       // socketId → { id, name, className, score, chatCount, totalResponseTimeMs, submitCount }
    timer: null,
    questionStartTime: null,
    submittedAnswers: new Set(), // playerId 기준 (새로고침 재득점 방지)
    reactionResults: [],
    memorizeActive: false,       // 기억력 모드 암기 단계 중 제출 차단
    emoji: null,                 // 이모지 사람 찾기 배정 { assignments, codeToPlayerId, solved }
    awards: null,
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

  const playerData = {
    id: data.id,
    name,
    className,
    score: 0,
    socketId,
    chatCount: 0,
    totalResponseTimeMs: 0,
    submitCount: 0,
  };
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
      const resolvedImageUrl = resolveMediaUrl(q.imageUrl);
      const resolvedAudioUrl = resolveMediaUrl(q.audioUrl);

      const { data: qRow, error: qErr } = await supabase
        .from('questions')
        .insert({
          round_id: roundRow.id,
          question_number: i + 1,
          content: q.content,
          image_url: resolvedImageUrl,
          audio_url: resolvedAudioUrl,
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
        imageUrl: resolvedImageUrl,
        audioUrl: resolvedAudioUrl,
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

// 답안 제한시간 카운트다운 시작 (기억력 모드는 암기 단계 후 호출)
function startAnswerTimer(roomCode, io, question) {
  const session = sessions[roomCode];
  if (!session) return;
  let remaining = question.timeLimit;
  session.timer = setInterval(() => {
    remaining--;
    io.to(roomCode).emit(SOCKET_EVENTS.GAME_TIMER_TICK, { remaining });
    if (remaining <= 0) endQuestion(roomCode, io);
  }, 1000);
}

function broadcastQuestion(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  const round = session.rounds[session.currentRound];
  // 라운드를 모두 소진하면 자동 종료하지 않고 대기 (진행자가 "종료" 버튼으로 종료)
  if (!round) return finishAllRounds(roomCode, io);

  const question = round.questions[session.currentQuestionIndex];
  if (!question) return endRound(roomCode, io);

  session.submittedAnswers = new Set();
  session.reactionResults = [];
  session.questionStartTime = Date.now();
  session.questionEnded = false;
  session.memorizeActive = false;
  session.emoji = null;

  const memorizeDuration = question.memorizeDuration ?? 0;

  const safeQuestion = {
    id: question.id,
    content: question.content,
    imageUrl: question.imageUrl,
    audioUrl: question.audioUrl,
    consonantHint: question.consonantHint,
    choices: question.choices,
    timeLimit: question.timeLimit,
    maxScore: question.maxScore,
    gameMode: round.gameMode,
    questionNumber: question.questionNumber,
    roundNumber: round.roundNumber,
    theme: round.theme,
    memorizeDuration,
    // 장문 타이핑은 원문(정답)을 Display 에 표시해야 하므로 전달
    targetText: round.gameMode === GAME_MODES.LONG_TYPING ? question.correctAnswer : undefined,
  };

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_QUESTION_START, {
    question: safeQuestion,
    timeLimit: question.timeLimit,
    questionNumber: question.questionNumber,
    totalQuestions: round.questions.length,
  });

  // 이모지 사람 찾기: 참가자별 개인 세트 + 코드 배정 후 소켓별 전송
  if (round.gameMode === GAME_MODES.EMOJI_FIND) {
    const onlineIds = Array.from(session.players.values())
      .filter((p) => p.isOnline !== false)
      .map((p) => p.id);
    const { assignments, codeToPlayerId } = buildEmojiAssignments(onlineIds, {
      emojiPool: question.emojiPool,
      setSize: question.setSize,
      groupSize: question.groupSize,
    });
    session.emoji = { assignments, codeToPlayerId, solved: new Set() };
    for (const player of session.players.values()) {
      const a = assignments.get(player.id);
      if (a) {
        io.to(player.socketId).emit(SOCKET_EVENTS.GAME_EMOJI_ASSIGN, {
          emojiSet: a.emojiSet,
          code: a.code,
        });
      }
    }
  }

  // 반응게임: 랜덤 딜레이 후 신호
  if (round.gameMode === GAME_MODES.REACTION) {
    const delay = 1000 + Math.random() * 3000;
    session.reactionSignalTime = Date.now() + delay;
    setTimeout(() => {
      if (session.status === GAME_STATUS.PLAYING) {
        session.reactionSignalTime = Date.now();
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_REACTION_START, { signal: true });
      }
    }, delay);
  }

  // 기억력 모드: 이미지 암기 단계(타이머 보류) → memorizeDuration 후 문제 공개 + 답안 타이머
  if (round.gameMode === GAME_MODES.IMAGE_MEMORY && memorizeDuration > 0) {
    session.memorizeActive = true;
    const startedQuestionId = question.id;
    setTimeout(() => {
      const s = sessions[roomCode];
      if (!s || s.status !== GAME_STATUS.PLAYING || s.questionEnded) return;
      const curRound = s.rounds[s.currentRound];
      const curQ = curRound?.questions[s.currentQuestionIndex];
      if (!curQ || curQ.id !== startedQuestionId) return; // 그 사이 다음 문제로 넘어갔으면 무시
      s.memorizeActive = false;
      s.questionStartTime = Date.now();
      io.to(roomCode).emit(SOCKET_EVENTS.GAME_MEMORY_END, {});
      startAnswerTimer(roomCode, io, question);
    }, memorizeDuration * 1000);
    return;
  }

  startAnswerTimer(roomCode, io, question);
}

async function submitAnswer(roomCode, socketId, { questionId, answer, responseTimeMs }, io) {
  const session = sessions[roomCode];
  if (!session || session.status !== GAME_STATUS.PLAYING) return;

  // 제한시간 종료 후 제출 차단
  if (session.questionEnded) return;

  const player = session.players.get(socketId);
  if (!player) return;

  const round = session.rounds[session.currentRound];
  const question = round?.questions[session.currentQuestionIndex];
  if (!question || question.id !== questionId) return;

  // 기억력 모드 암기 단계 중에는 제출 무시
  if (session.memorizeActive) return;

  // 이모지 사람 찾기: 정답 맞출 때까지 재시도 — 자체 로직으로 분기 (dedup 없이)
  if (round.gameMode === GAME_MODES.EMOJI_FIND) {
    return handleEmojiSubmit(roomCode, socketId, player, answer, responseTimeMs, io);
  }

  // playerId 기준 중복 제출 차단 — 새로고침으로 socketId가 바뀌어도 재득점 불가
  if (session.submittedAnswers.has(player.id)) return;
  session.submittedAnswers.add(player.id);

  let isCorrect;
  let scoreDelta;
  let accuracy;
  if (round.gameMode === GAME_MODES.LONG_TYPING) {
    // 장문 타이핑: 원문 일치도(부분 점수) + 속도 보너스
    accuracy = textSimilarity(answer, question.correctAnswer);
    isCorrect = accuracy >= (question.passThreshold ?? 0.9);
    scoreDelta = computeTypingScore(accuracy, responseTimeMs, question.timeLimit * 1000, question.maxScore);
  } else {
    isCorrect = normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
    scoreDelta = calculateScore(
      isCorrect,
      responseTimeMs,
      question.timeLimit * 1000,
      question.maxScore,
      question.penalty
    );
  }

  player.score += scoreDelta;
  player.totalResponseTimeMs += responseTimeMs;
  player.submitCount += 1;

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
    accuracy,
  });

  // Display에 제출 카운트 알림 (정답 미포함)
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
    submittedCount: session.submittedAnswers.size,
    totalPlayers: onlineCount(session),
  });

  // 온라인 인원이 모두 제출하면 즉시 종료 (끊긴/유령 유저는 제외)
  if (session.submittedAnswers.size >= onlineCount(session)) {
    endQuestion(roomCode, io);
  }
}

// 이모지 사람 찾기 제출 — 오답은 재시도, 정답만 점수 확정 + 잠금
async function handleEmojiSubmit(roomCode, socketId, player, answer, responseTimeMs, io) {
  const session = sessions[roomCode];
  if (!session || !session.emoji) return;

  // 제한시간 종료 후 제출 차단
  if (session.questionEnded) return;

  const round = session.rounds[session.currentRound];
  const question = round?.questions[session.currentQuestionIndex];
  if (!question) return;

  const { assignments, codeToPlayerId, solved } = session.emoji;
  if (solved.has(player.id)) return; // 이미 정답 — 잠금

  const myAssign = assignments.get(player.id);
  const code = String(answer || '').trim();
  const targetId = codeToPlayerId.get(code);
  const targetAssign = targetId ? assignments.get(targetId) : null;

  const isCorrect = !!(
    myAssign &&
    targetAssign &&
    targetId !== player.id &&
    targetAssign.groupId === myAssign.groupId
  );

  if (!isCorrect) {
    // 오답 — 감점·잠금 없이 재시도 허용
    io.to(socketId).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
      playerId: player.id,
      isCorrect: false,
      scoreDelta: 0,
      newScore: player.score,
      retry: true,
    });
    return;
  }

  solved.add(player.id);
  const scoreDelta = calculateScore(true, responseTimeMs, question.timeLimit * 1000, question.maxScore, question.penalty);
  player.score += scoreDelta;
  player.totalResponseTimeMs += responseTimeMs;
  player.submitCount += 1;

  await supabase.from('answers').insert({
    question_id: question.id,
    player_id: player.id,
    answer: code,
    is_correct: true,
    response_time_ms: responseTimeMs,
    score_delta: scoreDelta,
  });
  await supabase.from('players').update({ score: player.score }).eq('id', player.id);

  io.to(socketId).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
    playerId: player.id,
    isCorrect: true,
    scoreDelta,
    newScore: player.score,
    lock: true,
  });

  // Display 진행률 (정답자 수)
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_SHOW_RESULT, {
    submittedCount: solved.size,
    totalPlayers: onlineCount(session),
  });

  if (solved.size >= onlineCount(session)) {
    endQuestion(roomCode, io);
  }
}

async function submitReaction(roomCode, socketId, { reactionTimeMs }, io) {
  const session = sessions[roomCode];
  if (!session) return;

  const player = session.players.get(socketId);
  if (!player) return;

  // playerId 기준 중복 차단
  if (session.submittedAnswers.has(player.id)) return;
  session.submittedAnswers.add(player.id);

  player.totalResponseTimeMs += reactionTimeMs;
  player.submitCount += 1;

  session.reactionResults.push({ socketId, playerId: player.id, name: player.name, reactionTimeMs });

  if (session.submittedAnswers.size >= onlineCount(session)) {
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
      const player = findPlayerById(session, r.playerId);
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

  session.currentRound++;
  session.currentQuestionIndex = 0;

  // 마지막 라운드였으면 자동 종료하지 않고 "모든 라운드 완료"를 알림 (진행자가 종료 버튼으로 종료)
  const allRoundsComplete = session.currentRound >= session.rounds.length;
  if (allRoundsComplete) session.allRoundsDone = true;

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_END, { leaderboard, allRoundsComplete });
}

function nextRound(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;

  if (session.currentRound >= session.rounds.length) {
    // 모든 라운드 완료 — 자동 종료하지 않고 진행자의 "종료" 버튼을 기다린다
    finishAllRounds(roomCode, io);
  } else {
    broadcastQuestion(roomCode, io);
  }
}

// 모든 라운드를 마쳤을 때 (자동 endGame 대신) 최종 순위만 표시하고 종료 버튼 대기
function finishAllRounds(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return;
  clearInterval(session.timer);
  session.timer = null;
  session.allRoundsDone = true;

  const leaderboard = Array.from(session.players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p, idx) => ({ rank: idx + 1, name: p.name, className: p.className, score: p.score }));

  // isFinal 없이 allRoundsComplete 로 알림 → 진행자 패널의 "종료" 버튼을 활성 유지
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_END, { leaderboard, allRoundsComplete: true });
}

function computeAwardsFromSession(session) {
  const allPlayers = Array.from(session.players.values());
  if (allPlayers.length === 0) return null;

  const byScore = [...allPlayers].sort((a, b) => b.score - a.score);

  const first = byScore[0];
  const midIndex = Math.floor(byScore.length / 2);
  const middle = byScore[midIndex];
  const thirtyFirst = byScore[30] || null;

  // 마음만 빨라상: 최소 평균 응답시간 (제출한 적 있는 플레이어만)
  const withSubmits = allPlayers.filter((p) => p.submitCount > 0);
  let fastestResponder = null;
  if (withSubmits.length > 0) {
    fastestResponder = withSubmits.reduce((fastest, p) => {
      const avg = p.totalResponseTimeMs / p.submitCount;
      const fastestAvg = fastest.totalResponseTimeMs / fastest.submitCount;
      return avg < fastestAvg ? p : fastest;
    });
  }

  // 말이 왜케 많아상: 최대 채팅 수
  const chattiest = allPlayers.reduce((top, p) =>
    (p.chatCount || 0) > (top.chatCount || 0) ? p : top
  , allPlayers[0]);

  // 슬롯머신용 전체 플레이어 풀
  const randomPool = byScore.map((p, i) => ({
    rank: i + 1,
    name: p.name,
    className: p.className,
    score: p.score,
    chatCount: p.chatCount || 0,
    avgResponseMs: p.submitCount > 0 ? Math.round(p.totalResponseTimeMs / p.submitCount) : null,
  }));

  // 반별 평균 점수 (인원 수 차이 보정)
  const classMap = {};
  allPlayers.forEach((p) => {
    if (!classMap[p.className]) classMap[p.className] = { total: 0, count: 0 };
    classMap[p.className].total += p.score;
    classMap[p.className].count += 1;
  });
  const classLeaderboard = Object.entries(classMap)
    .map(([className, { total, count }]) => ({
      className,
      avg: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.avg - a.avg);

  return {
    first:    { name: first.name, className: first.className, score: first.score },
    middle:   { name: middle.name, className: middle.className, score: middle.score },
    thirtyFirst: thirtyFirst
      ? { name: thirtyFirst.name, className: thirtyFirst.className, score: thirtyFirst.score }
      : null,
    fastestResponder: fastestResponder
      ? {
          name: fastestResponder.name,
          className: fastestResponder.className,
          avgResponseMs: Math.round(fastestResponder.totalResponseTimeMs / fastestResponder.submitCount),
        }
      : null,
    chattiest: {
      name: chattiest.name,
      className: chattiest.className,
      chatCount: chattiest.chatCount || 0,
    },
    randomPool,
    classLeaderboard,
  };
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

  // 시상 데이터 계산 + 종료 시각 기록 (시상 창에서 종료된 방을 다시 불러올 수 있게 세션 유지)
  session.awards = computeAwardsFromSession(session);
  session.finishedAt = Date.now();

  io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_END, { leaderboard: finalLeaderboard, isFinal: true });
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_SESSION_ENDED, { finalLeaderboard });

  // 종료된 세션은 시상 진행을 위해 메모리에 유지. 메모리 누적 방지를 위해 3시간 후 정리.
  setTimeout(() => {
    if (sessions[roomCode]?.status === GAME_STATUS.FINISHED) {
      delete sessions[roomCode];
      console.log(`[Game] Finished session ${roomCode} cleaned up`);
    }
  }, 3 * 60 * 60 * 1000);
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
  // 종료된 세션에는 재접속 불가
  if (session.status === GAME_STATUS.FINISHED) return null;

  for (const [oldSocketId, player] of session.players.entries()) {
    if (player.id === playerId) {
      session.players.delete(oldSocketId);
      player.socketId = socketId;
      player.isOnline = true;
      session.players.set(socketId, player);

      supabase.from('players').update({ socket_id: socketId, is_online: true }).eq('id', playerId);

      const round = session.rounds[session.currentRound];
      const question = round?.questions[session.currentQuestionIndex];

      // 이모지 사람 찾기 진행 중이면 개인 배정(세트+코드) 복원
      let emojiAssign = null;
      if (round?.gameMode === GAME_MODES.EMOJI_FIND && session.emoji) {
        const a = session.emoji.assignments.get(playerId);
        if (a) {
          emojiAssign = { emojiSet: a.emojiSet, code: a.code };
          io.to(socketId).emit(SOCKET_EVENTS.GAME_EMOJI_ASSIGN, emojiAssign);
        }
      }

      const hasSubmitted = round?.gameMode === GAME_MODES.EMOJI_FIND
        ? !!session.emoji?.solved?.has(playerId)
        : session.submittedAnswers.has(playerId);

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
        memorizeActive: !!session.memorizeActive,
        // 새로고침 시 이모지 세트/코드 복원 (초기 재접속 레이스 방지)
        emojiAssign,
        // 이미 이 문제에 제출했는지 — 새로고침 시 "제출 완료" 상태 복원용
        hasSubmitted,
      };
    }
  }
  return null;
}

function incrementChatCount(roomCode, playerId) {
  const session = sessions[roomCode];
  if (!session) return;
  for (const player of session.players.values()) {
    if (player.id === playerId) {
      player.chatCount = (player.chatCount || 0) + 1;
      break;
    }
  }
}

function getAwards(roomCode) {
  const session = sessions[roomCode];
  if (!session) return null;
  return session.awards;
}

// 활성 방 목록 요약 (관리자 모니터링용)
function listSessions() {
  return Object.values(sessions).map((s) => ({
    roomCode: s.roomCode,
    status: s.status,
    playerCount: s.players.size,
    onlineCount: onlineCount(s),
    currentRound: s.currentRound,
    totalRounds: s.rounds.length,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt || null,
    hasAwards: !!s.awards,
    allRoundsDone: !!s.allRoundsDone,
  }));
}

// 방 강제 종료 — 남은 유저를 내보내고 메모리에서 즉시 제거
function terminateSession(roomCode, io) {
  const session = sessions[roomCode];
  if (!session) return false;

  clearInterval(session.timer);
  session.timer = null;
  session.status = GAME_STATUS.FINISHED;
  supabase.from('sessions').update({ status: GAME_STATUS.FINISHED }).eq('id', session.sessionId);

  // 남은 참가자 강제 퇴장 (클라이언트는 GAME_SESSION_ENDED 수신 시 / 로 이동)
  io.to(roomCode).emit(SOCKET_EVENTS.GAME_SESSION_ENDED, { finalLeaderboard: [] });

  delete sessions[roomCode];
  console.log(`[Game] Session ${roomCode} terminated by admin`);
  return true;
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
  incrementChatCount,
  getAwards,
  removePlayerFromSession,
  listSessions,
  terminateSession,
};
