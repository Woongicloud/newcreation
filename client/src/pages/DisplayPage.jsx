import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import socket from '../lib/socket.js';
import { SOCKET_EVENTS, GAME_MODES } from '@shared/constants.js';
import ChatOverlay from '../components/chat/ChatOverlay.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import { CHOICE_HEX, CHOICE_LABELS, CORRECT_HEX } from '../lib/choiceColors.js';

// 키컬러 (사용자 지정 파스텔)
const KEY_BLUE = '#ADD8E6';
const KEY_GREEN = '#ADFF2F';
// 딥톤 베이스 (네이비 → 틸) — 파스텔 키컬러가 선명하게 대비됨
const DEEP_GRADIENT = 'linear-gradient(135deg,#0b1220 0%,#0c1f2b 55%,#0b2622 100%)';
// 화면 외곽 파스텔 그라데이션 프레임
const FRAME_GRADIENT = `linear-gradient(135deg, ${KEY_BLUE}, #7fd8c8 50%, ${KEY_GREEN})`;

function AnswerReveal({ correctAnswer, choices }) {
  if (!correctAnswer) return null;
  if (choices?.length) {
    const idx = choices.indexOf(correctAnswer);
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-slate-900 font-black mt-4 shadow-lg"
        style={{ fontSize: '2.5vw', backgroundColor: idx >= 0 ? CHOICE_HEX[idx] : CORRECT_HEX }}
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
      className="inline-block text-slate-900 font-black px-6 py-3 rounded-2xl mt-4 shadow-lg"
      style={{ fontSize: '2.5vw', backgroundColor: KEY_GREEN }}
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
  const [memorizeCount, setMemorizeCount] = useState(0);
  const [award, setAward] = useState(null); // 시상 송출 { type, title, name, className, detail }
  const audioRef = useRef(null);

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
      const isMemorize = q.gameMode === GAME_MODES.IMAGE_MEMORY && (q.memorizeDuration ?? 0) > 0;
      setPhase(
        q.gameMode === GAME_MODES.REACTION ? 'reaction_wait' : isMemorize ? 'memorize' : 'question'
      );
      // 오디오 퀴즈: Display에서 자동 재생
      if (q.audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = q.audioUrl;
          audioRef.current.play().catch(() => {});
        }
      } else if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    });

    socket.on(SOCKET_EVENTS.GAME_MEMORY_END, () => {
      setPhase('question');
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

    // 시상 송출 — 진행자가 시상 항목을 Display 로 띄움
    socket.on(SOCKET_EVENTS.GAME_SHOW_AWARD, (data) => {
      if (!data || data.type === 'clear') {
        setAward(null);
        setPhase((p) => (p === 'award' ? 'leaderboard' : p));
        return;
      }
      setAward(data);
      setPhase('award');
    });

    return () => {
      socket.off(SOCKET_EVENTS.GAME_PLAYER_JOINED);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START);
      socket.off(SOCKET_EVENTS.GAME_MEMORY_END);
      socket.off(SOCKET_EVENTS.GAME_TIMER_TICK);
      socket.off(SOCKET_EVENTS.GAME_SHOW_RESULT);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_END);
      socket.off(SOCKET_EVENTS.GAME_REACTION_START);
      socket.off(SOCKET_EVENTS.GAME_REACTION_END);
      socket.off(SOCKET_EVENTS.GAME_ROUND_END);
      socket.off(SOCKET_EVENTS.GAME_SHOW_AWARD);
    };
  }, [joined]);

  // 기억력 모드 암기 단계 로컬 카운트다운 (Display 전용 — 답안 타이머와 분리)
  useEffect(() => {
    if (phase !== 'memorize') return;
    setMemorizeCount(question?.memorizeDuration || 0);
    const t = setInterval(() => setMemorizeCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [phase, question?.id]);

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
  const timerColor = timePct > 0.5 ? KEY_GREEN : timePct > 0.25 ? '#FFD66B' : '#FF8A8A';
  const CIRCUMFERENCE = 2 * Math.PI * 45;

  // ── 방 코드 입력 화면 ────────────────────────────────────
  if (!joined) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: DEEP_GRADIENT }}>
        <form onSubmit={handleJoin} className="space-y-4 text-center">
          <p className="font-bold text-2xl mb-2" style={{ color: KEY_BLUE }}>📺 Display 연결</p>
          <input
            type="text"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="방 코드 입력"
            maxLength={6}
            className="px-6 py-4 rounded-xl bg-white/5 text-white text-3xl font-mono tracking-widest text-center focus:outline-none w-64 border-2"
            style={{ borderColor: `${KEY_BLUE}66` }}
          />
          {joinError && <p className="text-red-300 text-sm">{joinError}</p>}
          <button
            type="submit"
            className="block w-full py-3 rounded-xl text-slate-900 font-bold text-lg shadow-lg"
            style={{ background: FRAME_GRADIENT }}
          >
            연결하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen p-[0.45vw] select-none" style={{ background: FRAME_GRADIENT }}>
    <div className="relative w-full h-full overflow-hidden rounded-[1.2vw]" style={{ background: DEEP_GRADIENT }}>
      {/* 오디오 퀴즈용 숨김 플레이어 */}
      <audio ref={audioRef} className="hidden" />

      {/* 흐르는 채팅 오버레이 */}
      <ChatOverlay />

      {/* 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-50 bg-white/5 hover:bg-white/15 px-3 py-1 rounded-lg text-xs transition-colors border"
        style={{ color: KEY_BLUE, borderColor: `${KEY_BLUE}44` }}
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
              <div className="p-[1.2vw] rounded-2xl" style={{ background: FRAME_GRADIENT }}>
                <div className="bg-white p-[1vw] rounded-xl">
                  <QRCodeSVG
                    value={`${(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')}/?roomCode=${joinedRoomCode}`}
                    size={Math.round(window.innerWidth * 0.2)}
                    bgColor="#ffffff"
                    fgColor="#0b1220"
                    level="M"
                  />
                </div>
              </div>
              <p className="text-slate-300" style={{ fontSize: '1.5vw' }}>QR 코드로 참가</p>
            </div>

            {/* 방 코드 + 안내 */}
            <div className="flex flex-col items-center gap-[1vw]">
              <p className="font-semibold" style={{ fontSize: '2vw', color: KEY_BLUE }}>방 코드</p>
              <p
                className="text-white font-black font-mono tracking-[0.3em] bg-white/5 px-[3vw] py-[1.5vw] rounded-2xl border-2"
                style={{ fontSize: '8vw', borderColor: KEY_BLUE, boxShadow: '0 0 3vw rgba(173,216,230,0.30)' }}
              >
                {joinedRoomCode}
              </p>
              <p className="text-slate-300 mt-[1vw]" style={{ fontSize: '1.8vw' }}>
                스마트폰으로 접속하세요
              </p>
              <p className="font-semibold" style={{ fontSize: '1.4vw', color: KEY_GREEN }}>
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
            {/* 왼쪽: 문제 내용 (70%) */}
            <div className="flex-[70] flex flex-col justify-center px-[3vw] py-[2vw] gap-[1.5vw]">
              {/* 라운드 배지 */}
              <div className="flex items-center gap-3">
                <span
                  className="text-slate-900 font-bold px-4 py-1 rounded-full shadow"
                  style={{ fontSize: '1.4vw', background: FRAME_GRADIENT }}
                >
                  R{question.roundNumber} · {question.theme}
                </span>
                <span style={{ fontSize: '1.4vw', color: KEY_BLUE }}>
                  Q{question.questionNumber}
                  {question.totalQuestions ? ` / ${question.totalQuestions}` : ''}
                </span>
              </div>

              {/* 이미지 (image_quiz / image_multiple_choice) — 기억력 모드는 암기 단계에서만 노출 */}
              {question.imageUrl && question.gameMode !== GAME_MODES.IMAGE_MEMORY && (
                <img
                  src={question.imageUrl}
                  alt=""
                  className="max-h-[25vh] object-contain rounded-xl self-start border-2"
                  style={{ borderColor: `${KEY_BLUE}66` }}
                />
              )}

              {/* 초성 힌트 */}
              {question.consonantHint && (
                <p className="font-black tracking-[0.4em]" style={{ fontSize: '4vw', color: KEY_GREEN }}>
                  {question.consonantHint}
                </p>
              )}

              {/* 문제 텍스트 (장문 타이핑은 안내문이므로 작게) */}
              <p
                className="text-white font-bold leading-snug"
                style={{ fontSize: question.gameMode === GAME_MODES.LONG_TYPING ? '2vw' : '3.3vw' }}
              >
                {question.content}
              </p>

              {/* 장문 타이핑: 따라 칠 원문 (프로젝터에만 표시) */}
              {question.gameMode === GAME_MODES.LONG_TYPING && question.targetText && (
                <div
                  className="bg-white/5 border-l-4 rounded-r-xl px-[2vw] py-[1.5vw] max-h-[60vh] overflow-hidden"
                  style={{ borderColor: KEY_GREEN }}
                >
                  <p className="text-white font-bold leading-relaxed whitespace-pre-wrap" style={{ fontSize: '2.4vw' }}>
                    {question.targetText}
                  </p>
                </div>
              )}

              {/* 이모지 사람 찾기: 안내 (개인 세트/코드는 각자 휴대폰에) */}
              {question.gameMode === GAME_MODES.EMOJI_FIND && (
                <div className="flex flex-col gap-[0.8vw] mt-[0.5vw]">
                  <p className="font-bold" style={{ fontSize: '2vw', color: KEY_GREEN }}>
                    📱 휴대폰에서 내 이모지 세트와 코드를 확인하세요
                  </p>
                  <p className="text-slate-300" style={{ fontSize: '1.6vw' }}>
                    같은 세트를 가진 사람을 찾아 그 사람의 코드를 입력!
                  </p>
                </div>
              )}

              {/* 객관식 선택지 (파스텔 + 어두운 글자) */}
              {question.choices?.length > 0 && (
                <div className="grid grid-cols-2 gap-[1vw] mt-[0.5vw]">
                  {question.choices.map((c, i) => {
                    const isCorrect = phase === 'result' && c === correctAnswer;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-slate-900 font-bold shadow-md
                          ${isCorrect ? 'ring-4 ring-offset-2 scale-105' : ''}`}
                        style={{
                          fontSize: '1.8vw',
                          backgroundColor: CHOICE_HEX[i],
                          opacity: phase === 'result' && !isCorrect ? 0.4 : 1,
                          ...(isCorrect ? { '--tw-ring-color': KEY_GREEN, '--tw-ring-offset-color': '#0b1f2b' } : {}),
                        }}
                      >
                        <span style={{ fontSize: '2.2vw' }}>{CHOICE_LABELS[i]}</span>
                        {c}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 정답 공개 — sentinel/장문 모드는 제외 (이모지/반응/장문은 텍스트 정답 미표시) */}
              {phase === 'result' && correctAnswer && !question.choices?.length &&
                ![GAME_MODES.EMOJI_FIND, GAME_MODES.LONG_TYPING, GAME_MODES.REACTION].includes(question.gameMode) && (
                <AnswerReveal correctAnswer={correctAnswer} choices={question.choices} />
              )}
            </div>

            {/* 오른쪽: 타이머 + 응답 현황 (30%) */}
            <div className="flex-[30] flex flex-col items-center justify-center gap-[2vw] border-l-2 bg-black/20" style={{ borderColor: `${KEY_BLUE}22` }}>
              {/* 원형 타이머 */}
              <div className="relative flex items-center justify-center" style={{ width: '12vw', height: '12vw' }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" className="-rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(173,216,230,0.15)" strokeWidth="8" />
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
                  style={{ fontSize: '3.2vw', color: timerColor }}
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
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${KEY_BLUE}, ${KEY_GREEN})` }}
                    animate={{ width: `${submitPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-center text-slate-300" style={{ fontSize: '1.2vw' }}>{submitPct}%</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 기억력 모드 암기 단계 ──────────────────────── */}
        {phase === 'memorize' && question && (
          <motion.div
            key="memorize"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center w-full h-full gap-[2vw] px-[4vw]"
          >
            <p className="text-white font-black" style={{ fontSize: '3vw' }}>🧠 이미지를 기억하세요!</p>
            {question.imageUrl && (
              <img
                src={question.imageUrl}
                alt=""
                className="max-h-[60vh] max-w-[80vw] object-contain rounded-2xl border-2"
                style={{ borderColor: `${KEY_BLUE}66` }}
              />
            )}
            <div className="flex items-center gap-3">
              <span className="text-slate-300" style={{ fontSize: '1.6vw' }}>남은 시간</span>
              <span className="font-black tabular-nums" style={{ fontSize: '3vw', color: KEY_GREEN }}>
                {memorizeCount}
              </span>
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
            className="flex flex-col items-center justify-center w-full h-full gap-6"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ fontSize: '8vw' }}
            >
              🤚
            </motion.div>
            <p className="text-white font-black" style={{ fontSize: '4vw' }}>준비하세요!</p>
            <p className="text-slate-300" style={{ fontSize: '2vw' }}>신호가 뜨면 바로 누르세요</p>
          </motion.div>
        )}

        {/* ── 반응게임 신호 ─────────────────────────────── */}
        {phase === 'reaction_signal' && (
          <motion.div
            key="reaction_signal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.1 }}
            className="flex flex-col items-center justify-center w-full h-full gap-4"
            style={{ backgroundColor: KEY_GREEN }}
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
                  className="flex items-center gap-4 bg-white/5 rounded-2xl px-6 py-3 border"
                  style={{ borderColor: `${KEY_BLUE}22` }}
                >
                  <span style={{ fontSize: '2.5vw' }}>{['🥇','🥈','🥉','4️⃣','5️⃣'][idx]}</span>
                  <span className="text-white font-bold flex-1" style={{ fontSize: '2vw' }}>{r.name}</span>
                  <span className="font-mono font-bold" style={{ fontSize: '1.8vw', color: KEY_GREEN }}>
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

        {/* ── 시상 송출 (진행자가 항목을 Display 로 띄움) ──── */}
        {phase === 'award' && award && (
          <motion.div
            key="award"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center w-full h-full gap-[2vw] px-[4vw]"
          >
            <motion.p
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="font-black"
              style={{ fontSize: '4vw', color: KEY_GREEN }}
            >
              {award.title || '🏆 시상'}
            </motion.p>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 12, delay: 0.15 }}
              className="rounded-[2vw] px-[6vw] py-[3vw] text-center shadow-2xl"
              style={{ background: FRAME_GRADIENT }}
            >
              <p className="text-slate-900 font-black leading-tight" style={{ fontSize: '7vw' }}>
                {award.name}
              </p>
              {award.className && (
                <p className="text-slate-800 font-bold" style={{ fontSize: '2.4vw' }}>
                  {award.className}
                </p>
              )}
            </motion.div>
            {award.detail && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white font-bold"
                style={{ fontSize: '2.4vw' }}
              >
                {award.detail}
              </motion.p>
            )}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{ fontSize: '4vw' }}
            >
              🎉🎊🎉
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
