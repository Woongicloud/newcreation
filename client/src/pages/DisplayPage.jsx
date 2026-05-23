import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import socket from '../lib/socket.js';
import { SOCKET_EVENTS, GAME_MODES } from '@shared/constants.js';
import ChatOverlay from '../components/chat/ChatOverlay.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

const CHOICE_COLORS = ['bg-red-600', 'bg-blue-600', 'bg-yellow-500', 'bg-green-600'];
const CHOICE_LABELS = ['①', '②', '③', '④'];

function AnswerReveal({ correctAnswer, choices }) {
  if (!correctAnswer) return null;
  if (choices?.length) {
    const idx = choices.indexOf(correctAnswer);
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-black mt-4
                    ${idx >= 0 ? CHOICE_COLORS[idx] : 'bg-green-600'}`}
        style={{ fontSize: '2.5vw' }}
      >
        {idx >= 0 && <span>{CHOICE_LABELS[idx]}</span>}
        <span>{correctAnswer}</span>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-block bg-green-600 text-white font-black px-6 py-3 rounded-2xl mt-4"
      style={{ fontSize: '2.5vw' }}
    >
      ✅ {correctAnswer}
    </motion.div>
  );
}

export default function DisplayPage() {
  const [phase, setPhase] = useState('idle'); // idle | question | reaction_wait | reaction_signal | result | leaderboard
  const [question, setQuestion] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isFinal, setIsFinal] = useState(false);
  const [reactionResults, setReactionResults] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinedRoomCode, setJoinedRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');

  function doJoin(code) {
    if (!socket.connected) socket.connect();
    const attempt = () => {
      socket.emit('display:join', { roomCode: code });
      socket.once(SOCKET_EVENTS.GAME_PLAYER_JOINED, () => {
        setJoinedRoomCode(code);
        sessionStorage.setItem('displayRoomCode', code);
        setJoined(true);
      });
      socket.once(SOCKET_EVENTS.ERROR, ({ message }) => {
        sessionStorage.removeItem('displayRoomCode');
        setJoinError(message);
      });
    };
    if (socket.connected) attempt(); else socket.once('connect', attempt);
  }

  // 저장된 방코드로 자동 재접속
  useEffect(() => {
    const saved = sessionStorage.getItem('displayRoomCode');
    if (saved) doJoin(saved);
  }, []);

  function handleJoin(e) {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    doJoin(code);
  }

  useEffect(() => {
    if (!joined) return;

    socket.on(SOCKET_EVENTS.GAME_PLAYER_JOINED, ({ players }) => {
      setTotalPlayers(players.length);
    });

    socket.on(SOCKET_EVENTS.GAME_QUESTION_START, ({ question: q, timeLimit, totalQuestions }) => {
      setQuestion({ ...q, timeLimit, totalQuestions });
      setTimeRemaining(timeLimit);
      setCorrectAnswer(null);
      setSubmittedCount(0);
      setPhase(q.gameMode === GAME_MODES.REACTION ? 'reaction_wait' : 'question');
    });

    socket.on(SOCKET_EVENTS.GAME_TIMER_TICK, ({ remaining }) => {
      setTimeRemaining(remaining);
    });

    socket.on(SOCKET_EVENTS.GAME_SHOW_RESULT, ({ submittedCount }) => {
      if (submittedCount !== undefined) setSubmittedCount(submittedCount);
    });

    socket.on(SOCKET_EVENTS.GAME_QUESTION_END, ({ correctAnswer: ans, scores }) => {
      setCorrectAnswer(ans);
      setPhase('result');
      if (scores) setTotalPlayers(scores.length);
    });

    socket.on(SOCKET_EVENTS.GAME_REACTION_START, () => {
      setPhase('reaction_signal');
    });

    socket.on(SOCKET_EVENTS.GAME_REACTION_END, ({ results }) => {
      setReactionResults(results.slice(0, 5));
      setPhase('reaction_result');
    });

    socket.on(SOCKET_EVENTS.GAME_ROUND_END, ({ leaderboard: lb, isFinal: fin }) => {
      setLeaderboard(lb);
      setIsFinal(!!fin);
      setPhase('leaderboard');
    });

    return () => {
      socket.off(SOCKET_EVENTS.GAME_PLAYER_JOINED);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START);
      socket.off(SOCKET_EVENTS.GAME_TIMER_TICK);
      socket.off(SOCKET_EVENTS.GAME_SHOW_RESULT);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_END);
      socket.off(SOCKET_EVENTS.GAME_REACTION_START);
      socket.off(SOCKET_EVENTS.GAME_REACTION_END);
      socket.off(SOCKET_EVENTS.GAME_ROUND_END);
    };
  }, [joined]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const submitPct = totalPlayers > 0 ? Math.round((submittedCount / totalPlayers) * 100) : 0;
  const timePct = question ? timeRemaining / question.timeLimit : 0;
  const timerColor = timePct > 0.5 ? '#22c55e' : timePct > 0.25 ? '#eab308' : '#ef4444';
  const CIRCUMFERENCE = 2 * Math.PI * 45;

  // ── 방 코드 입력 화면 ────────────────────────────────────
  if (!joined) {
    return (
      <div className="w-screen h-screen bg-gray-950 flex items-center justify-center">
        <form onSubmit={handleJoin} className="space-y-4 text-center">
          <p className="text-white font-bold text-2xl mb-2">📺 Display 연결</p>
          <input
            type="text"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="방 코드 입력"
            maxLength={6}
            className="px-6 py-4 rounded-xl bg-white/10 border border-white/20 text-white text-3xl font-mono tracking-widest text-center focus:outline-none focus:border-purple-400 w-64"
          />
          {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
          <button
            type="submit"
            className="block w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-lg"
          >
            연결하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-gray-950 overflow-hidden select-none">
      {/* 흐르는 채팅 오버레이 */}
      <ChatOverlay />

      {/* 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-50 bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg text-xs transition-colors"
      >
        {isFullscreen ? '⊡ 창모드' : '⊞ 전체화면'}
      </button>

      <AnimatePresence mode="wait">
        {/* ── 대기 화면 (QR + 방코드) ───────────────────── */}
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full h-full items-center justify-center gap-[6vw]"
          >
            {/* QR 코드 */}
            <div className="flex flex-col items-center gap-[1.5vw]">
              <div className="bg-white p-[1.5vw] rounded-2xl">
                <QRCodeSVG
                  value={`${window.location.origin}/?roomCode=${joinedRoomCode}`}
                  size={Math.round(window.innerWidth * 0.2)}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <p className="text-gray-400" style={{ fontSize: '1.5vw' }}>QR 코드로 참가</p>
            </div>

            {/* 방 코드 + 안내 */}
            <div className="flex flex-col items-center gap-[1vw]">
              <p className="text-purple-300 font-semibold" style={{ fontSize: '2vw' }}>방 코드</p>
              <p
                className="text-white font-black font-mono tracking-[0.3em] bg-white/10 px-[3vw] py-[1.5vw] rounded-2xl border border-white/20"
                style={{ fontSize: '8vw' }}
              >
                {joinedRoomCode}
              </p>
              <p className="text-gray-400 mt-[1vw]" style={{ fontSize: '1.8vw' }}>
                스마트폰으로 접속하세요
              </p>
              <p className="text-gray-500" style={{ fontSize: '1.4vw' }}>
                참가자 {totalPlayers}명 접속 중
              </p>
            </div>
          </motion.div>
        )}

        {/* ── 문제 화면 ─────────────────────────────────── */}
        {(phase === 'question' || phase === 'result') && question && (
          <motion.div
            key="question"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full h-full"
          >
            {/* 왼쪽: 문제 내용 (65%) */}
            <div className="flex-[65] flex flex-col justify-center px-[3vw] py-[2vw] gap-[1.5vw]">
              {/* 라운드 배지 */}
              <div className="flex items-center gap-3">
                <span
                  className="bg-purple-700 text-white font-bold px-4 py-1 rounded-full"
                  style={{ fontSize: '1.4vw' }}
                >
                  R{question.roundNumber} · {question.theme}
                </span>
                <span className="text-gray-400" style={{ fontSize: '1.4vw' }}>
                  Q{question.questionNumber}
                  {question.totalQuestions ? ` / ${question.totalQuestions}` : ''}
                </span>
              </div>

              {/* 이미지 (image_quiz) */}
              {question.imageUrl && (
                <img
                  src={question.imageUrl}
                  alt=""
                  className="max-h-[25vh] object-contain rounded-xl self-start"
                />
              )}

              {/* 초성 힌트 */}
              {question.consonantHint && (
                <p className="text-yellow-300 font-black tracking-[0.4em]" style={{ fontSize: '4vw' }}>
                  {question.consonantHint}
                </p>
              )}

              {/* 문제 텍스트 */}
              <p className="text-white font-bold leading-snug" style={{ fontSize: '3vw' }}>
                {question.content}
              </p>

              {/* 객관식 선택지 */}
              {question.choices?.length > 0 && (
                <div className="grid grid-cols-2 gap-[1vw] mt-[0.5vw]">
                  {question.choices.map((c, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white font-bold
                        ${phase === 'result' && c === correctAnswer ? 'ring-4 ring-white scale-105' : ''}
                        ${CHOICE_COLORS[i]}`}
                      style={{ fontSize: '1.8vw', opacity: phase === 'result' && c !== correctAnswer ? 0.45 : 1 }}
                    >
                      <span style={{ fontSize: '2.2vw' }}>{CHOICE_LABELS[i]}</span>
                      {c}
                    </div>
                  ))}
                </div>
              )}

              {/* 정답 공개 */}
              {phase === 'result' && correctAnswer && !question.choices?.length && (
                <AnswerReveal correctAnswer={correctAnswer} choices={question.choices} />
              )}
            </div>

            {/* 오른쪽: 타이머 + 응답 현황 (35%) */}
            <div className="flex-[35] flex flex-col items-center justify-center gap-[2vw] border-l border-white/10 bg-black/20">
              {/* 원형 타이머 */}
              <div className="relative flex items-center justify-center" style={{ width: '12vw', height: '12vw' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" className="-rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="8" />
                  <motion.circle
                    cx="50" cy="50" r="45"
                    fill="none"
                    stroke={timerColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE - CIRCUMFERENCE * timePct}
                    transition={{ duration: 0.8 }}
                  />
                </svg>
                <span
                  className="absolute font-black tabular-nums"
                  style={{ fontSize: '4vw', color: timerColor }}
                >
                  {timeRemaining}
                </span>
              </div>

              {/* 응답 현황 */}
              <div className="w-[60%] space-y-2">
                <div className="flex justify-between text-white" style={{ fontSize: '1.4vw' }}>
                  <span>응답</span>
                  <span className="font-bold">{submittedCount} / {totalPlayers}</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-green-500 rounded-full"
                    animate={{ width: `${submitPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-center text-gray-400" style={{ fontSize: '1.2vw' }}>{submitPct}%</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 반응게임 대기 ──────────────────────────────── */}
        {phase === 'reaction_wait' && (
          <motion.div
            key="reaction_wait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center w-full h-full gap-6 bg-gray-900"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ fontSize: '8vw' }}
            >
              🤚
            </motion.div>
            <p className="text-white font-black" style={{ fontSize: '4vw' }}>준비하세요!</p>
            <p className="text-gray-400" style={{ fontSize: '2vw' }}>신호가 뜨면 바로 누르세요</p>
          </motion.div>
        )}

        {/* ── 반응게임 신호 ─────────────────────────────── */}
        {phase === 'reaction_signal' && (
          <motion.div
            key="reaction_signal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.1 }}
            className="flex flex-col items-center justify-center w-full h-full gap-4 bg-yellow-400"
          >
            <p style={{ fontSize: '10vw' }}>👆</p>
            <p className="text-gray-900 font-black" style={{ fontSize: '5vw' }}>지금 누르세요!</p>
          </motion.div>
        )}

        {/* ── 반응게임 결과 ─────────────────────────────── */}
        {phase === 'reaction_result' && (
          <motion.div
            key="reaction_result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center w-full h-full gap-4"
          >
            <p className="text-white font-black" style={{ fontSize: '3.5vw' }}>⚡ 반응속도 결과</p>
            <div className="space-y-3 w-full max-w-[50vw]">
              {reactionResults.map((r, idx) => (
                <motion.div
                  key={r.playerId}
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-4 bg-white/10 rounded-2xl px-6 py-3"
                >
                  <span style={{ fontSize: '2.5vw' }}>{['🥇','🥈','🥉','4️⃣','5️⃣'][idx]}</span>
                  <span className="text-white font-bold flex-1" style={{ fontSize: '2vw' }}>{r.name}</span>
                  <span className="text-yellow-400 font-mono font-bold" style={{ fontSize: '1.8vw' }}>
                    {r.reactionTimeMs}ms
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── 순위표 ────────────────────────────────────── */}
        {phase === 'leaderboard' && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center w-full h-full"
          >
            <Scoreboard leaderboard={leaderboard} isFinal={isFinal} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
