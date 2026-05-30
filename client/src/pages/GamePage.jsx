import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../lib/socket.js';
import useGameStore from '../store/gameStore.js';
import { SOCKET_EVENTS, GAME_MODES } from '@shared/constants.js';
import Timer from '../components/Timer.jsx';
import ResultModal from '../components/ResultModal.jsx';
import ChatInput from '../components/chat/ChatInput.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import GameGuideModal from '../components/GameGuideModal.jsx';
import MultipleChoice from '../components/game-modes/MultipleChoice.jsx';
import ShortAnswer from '../components/game-modes/ShortAnswer.jsx';
import ConsonantQuiz from '../components/game-modes/ConsonantQuiz.jsx';
import WordGuess from '../components/game-modes/WordGuess.jsx';
import ImageQuiz from '../components/game-modes/ImageQuiz.jsx';
import AudioQuiz from '../components/game-modes/AudioQuiz.jsx';
import ReactionGame from '../components/game-modes/ReactionGame.jsx';
import ImageMultipleChoice from '../components/game-modes/ImageMultipleChoice.jsx';
import ImageMemory from '../components/game-modes/ImageMemory.jsx';
import EmojiFind from '../components/game-modes/EmojiFind.jsx';
import LongTyping from '../components/game-modes/LongTyping.jsx';

const LS_KEYS = ['playerId', 'roomCode', 'playerName', 'playerClass'];

export default function GamePage() {
  const navigate = useNavigate();
  const {
    player,
    currentQuestion, timeRemaining, hasSubmitted, lastResult,
    leaderboard,
    setPlayer, setRoomCode, setPlayers,
    setCurrentQuestion, setTimeRemaining, setHasSubmitted, setLastResult,
    setLeaderboard, updatePlayerScore,
  } = useGameStore();

  const questionStartTime = useRef(null);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [phase, setPhase] = useState('game'); // game | roundEnd
  const [reconnecting, setReconnecting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [memorizePhase, setMemorizePhase] = useState(false); // 기억력 모드 암기 단계
  const [emojiWrongNonce, setEmojiWrongNonce] = useState(0);  // 이모지 오답 흔들림 트리거

  useEffect(() => {
    if (!player) {
      const savedId = localStorage.getItem('playerId');
      const savedRoom = localStorage.getItem('roomCode');
      if (!savedId || !savedRoom) { navigate('/'); return; }

      setReconnecting(true);
      if (!socket.connected) socket.connect();

      const doRejoin = () => socket.emit(SOCKET_EVENTS.PLAYER_REJOIN, { playerId: savedId, roomCode: savedRoom });
      if (socket.connected) doRejoin(); else socket.once('connect', doRejoin);

      const onSync = ({ status, currentQuestion: q, timeRemaining: tr, players: sp, hasSubmitted: hs, memorizeActive: ma }) => {
        const myPlayer = sp?.find(p => p.id === savedId)
          || { id: savedId, name: localStorage.getItem('playerName') || '', className: localStorage.getItem('playerClass') || '', score: 0 };
        setPlayer(myPlayer);
        setRoomCode(savedRoom);
        if (sp) setPlayers(sp);
        setReconnecting(false);
        if (q) {
          setCurrentQuestion({ ...q });
          setTimeRemaining(tr || 0);
          setPhase('game');
          setMemorizePhase(!!ma);
          // 이미 제출한 문제면 "제출 완료" 상태 복원 (새로고침 재득점 방지)
          if (hs) setHasSubmitted(true);
        }
      };
      const onFail = () => { LS_KEYS.forEach((k) => localStorage.removeItem(k)); navigate('/'); };

      socket.once(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
      socket.once('error', onFail);

      return () => {
        socket.off('connect', doRejoin);
        socket.off(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
        socket.off('error', onFail);
      };
    }

    if (!socket.connected) socket.connect();

    if (currentQuestion && !questionStartTime.current) {
      questionStartTime.current = Date.now();
    }

    const onReconnect = () => {
      const playerId = localStorage.getItem('playerId');
      const storedRoomCode = localStorage.getItem('roomCode');
      if (playerId && storedRoomCode) {
        socket.emit(SOCKET_EVENTS.PLAYER_REJOIN, { playerId, roomCode: storedRoomCode });
      }
    };

    const onStateSync = ({ currentQuestion: q, timeRemaining: tr, hasSubmitted: hs, memorizeActive: ma }) => {
      if (q) {
        setCurrentQuestion({ ...q });
        setTimeRemaining(tr || 0);
        setPhase('game');
        setMemorizePhase(!!ma);
        if (hs) setHasSubmitted(true);
      }
    };

    const onQuestionStart = ({ question, timeLimit }) => {
      setCurrentQuestion({ ...question, timeLimit });
      setTimeRemaining(timeLimit);
      setCorrectAnswer(null);
      questionStartTime.current = Date.now();
      setPhase('game');
      setEmojiWrongNonce(0);
      // 기억력 모드: 암기 단계면 답변 잠금(타이머는 암기 종료 후 시작)
      const isMemorize = question.gameMode === GAME_MODES.IMAGE_MEMORY && (question.memorizeDuration ?? 0) > 0;
      setMemorizePhase(isMemorize);
    };

    const onMemoryEnd = () => {
      setMemorizePhase(false);
      // 답변 시작 시점부터 응답시간 측정 (속도 점수 공정화)
      questionStartTime.current = Date.now();
    };

    const onTimerTick = ({ remaining }) => setTimeRemaining(remaining);

    const onShowResult = ({ playerId, isCorrect, scoreDelta, newScore, accuracy, lock, retry }) => {
      if (!player || playerId !== player.id) return;
      if (retry) {
        // 이모지 사람 찾기 오답 — 모달 없이 재시도(흔들림) 안내
        setEmojiWrongNonce((n) => n + 1);
        return;
      }
      setLastResult({ isCorrect, scoreDelta, accuracy });
      updatePlayerScore(playerId, newScore);
      if (lock) setHasSubmitted(true); // 이모지 정답 등 서버 확정 잠금
    };

    const onQuestionEnd = ({ correctAnswer: ans }) => {
      setCorrectAnswer(ans);
    };

    const onRoundEnd = ({ leaderboard: lb }) => {
      setLeaderboard(lb);
      setPhase('roundEnd');
    };

    const onSessionEnded = () => {
      LS_KEYS.forEach((k) => localStorage.removeItem(k));
      navigate('/');
    };

    socket.on('connect', onReconnect);
    socket.on(SOCKET_EVENTS.GAME_STATE_SYNC, onStateSync);
    socket.on(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
    socket.on(SOCKET_EVENTS.GAME_MEMORY_END, onMemoryEnd);
    socket.on(SOCKET_EVENTS.GAME_TIMER_TICK, onTimerTick);
    socket.on(SOCKET_EVENTS.GAME_SHOW_RESULT, onShowResult);
    socket.on(SOCKET_EVENTS.GAME_QUESTION_END, onQuestionEnd);
    socket.on(SOCKET_EVENTS.GAME_ROUND_END, onRoundEnd);
    socket.on(SOCKET_EVENTS.GAME_SESSION_ENDED, onSessionEnded);

    return () => {
      socket.off('connect', onReconnect);
      socket.off(SOCKET_EVENTS.GAME_STATE_SYNC, onStateSync);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
      socket.off(SOCKET_EVENTS.GAME_MEMORY_END, onMemoryEnd);
      socket.off(SOCKET_EVENTS.GAME_TIMER_TICK, onTimerTick);
      socket.off(SOCKET_EVENTS.GAME_SHOW_RESULT, onShowResult);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_END, onQuestionEnd);
      socket.off(SOCKET_EVENTS.GAME_ROUND_END, onRoundEnd);
      socket.off(SOCKET_EVENTS.GAME_SESSION_ENDED, onSessionEnded);
    };
  }, [player?.id]);

  function handleSubmit(answer) {
    if (hasSubmitted || !currentQuestion) return;
    const responseTimeMs = Date.now() - (questionStartTime.current || Date.now());
    socket.emit(SOCKET_EVENTS.PLAYER_SUBMIT, {
      questionId: currentQuestion.id,
      answer,
      responseTimeMs,
    });
    setHasSubmitted();
  }

  function handleReact(reactionTimeMs) {
    if (hasSubmitted || !currentQuestion) return;
    socket.emit(SOCKET_EVENTS.PLAYER_REACTION, { reactionTimeMs });
    setHasSubmitted();
  }

  // 이모지 사람 찾기: 낙관적 잠금 없이 제출 (서버가 정답 확인 시 lock 으로 잠금)
  function handleEmojiSubmit(code) {
    if (hasSubmitted || !currentQuestion) return;
    const responseTimeMs = Date.now() - (questionStartTime.current || Date.now());
    socket.emit(SOCKET_EVENTS.PLAYER_SUBMIT, {
      questionId: currentQuestion.id,
      answer: code,
      responseTimeMs,
    });
  }

  if (reconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pinwheel">
        <div className="text-center bg-white/80 backdrop-blur rounded-2xl px-8 py-6 shadow-lg">
          <div className="text-4xl mb-4 animate-spin">🔄</div>
          <p className="text-slate-700 text-lg font-semibold">재연결 중...</p>
        </div>
      </div>
    );
  }

  const score = player?.score ?? 0;
  const gameMode = currentQuestion?.gameMode;

  // ── 라운드 종료 → 순위표 화면 ────────────────────────────
  if (phase === 'roundEnd') {
    return (
      <div className="min-h-screen flex flex-col bg-pinwheel">
        <div className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur border-b border-slate-200 shrink-0">
          <p className="text-slate-700 text-sm font-semibold">📊 라운드 결과</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="text-xs font-semibold text-purple-700 bg-white/80 border border-purple-200 rounded-full px-3 py-1 active:scale-95 transition-transform"
            >
              ❓ 게임방법
            </button>
            <p className="text-amber-600 font-bold font-mono">{score.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center py-6 px-4">
          {/* Scoreboard 는 Display 와 공용(흰 글씨)이라 어두운 패널로 감싸 가독성 유지 */}
          <div className="w-full max-w-2xl bg-slate-900/90 rounded-3xl py-6 shadow-xl">
            <Scoreboard leaderboard={leaderboard} />
          </div>
        </div>
        <p className="text-center text-slate-500 text-sm pb-4">진행자가 다음 라운드를 시작하면 이동됩니다</p>
        <div className="shrink-0"><ChatInput /></div>
        <GameGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
      </div>
    );
  }

  // ── 게임 화면 ─────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-pinwheel">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white/70 backdrop-blur border-b border-slate-200 shrink-0">
        <div className="min-w-0">
          {currentQuestion ? (
            <>
              <p className="text-slate-500 text-xs truncate">
                R{currentQuestion.roundNumber} · {currentQuestion.theme}
              </p>
              <p className="text-slate-800 text-sm font-semibold">Q{currentQuestion.questionNumber}</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">게임 진행 중...</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGuide(true)}
            className="text-xs font-semibold text-purple-700 bg-white/80 border border-purple-200 rounded-full px-3 py-1.5 active:scale-95 transition-transform touch-target"
          >
            ❓ 게임방법
          </button>
          <div className="text-right">
            <p className="text-slate-500 text-xs">내 점수</p>
            <p className="text-amber-600 text-lg font-bold font-mono">{score.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 게임 영역 — 문제 텍스트는 Display(프로젝터)에서 확인 */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {currentQuestion ? (
          <div className="flex flex-col gap-4 px-4 pt-4 pb-2">
            {/* 타이머 (중앙) — 기억력 암기 단계엔 숨김 */}
            {!memorizePhase && (
              <div className="flex justify-center">
                <Timer remaining={timeRemaining} total={currentQuestion.timeLimit} />
              </div>
            )}

            {/* 게임 모드 컴포넌트 */}
            <div className="relative">
              {gameMode === GAME_MODES.MULTIPLE_CHOICE && (
                <MultipleChoice
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.SHORT_ANSWER && (
                <ShortAnswer
                  key={currentQuestion.id}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.CONSONANT && (
                <ConsonantQuiz
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.WORD_GUESS && (
                <WordGuess
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.IMAGE_QUIZ && (
                <ImageQuiz
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.AUDIO_QUIZ && (
                <AudioQuiz
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.REACTION && (
                <ReactionGame key={currentQuestion.id} hasSubmitted={hasSubmitted} onReact={handleReact} />
              )}
              {gameMode === GAME_MODES.IMAGE_MULTIPLE_CHOICE && (
                <ImageMultipleChoice
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                />
              )}
              {gameMode === GAME_MODES.IMAGE_MEMORY && (
                <ImageMemory
                  key={currentQuestion.id}
                  question={currentQuestion}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  correctAnswer={correctAnswer}
                  memorizePhase={memorizePhase}
                />
              )}
              {gameMode === GAME_MODES.EMOJI_FIND && (
                <EmojiFind
                  key={currentQuestion.id}
                  onSubmitCode={handleEmojiSubmit}
                  hasSubmitted={hasSubmitted}
                  wrongNonce={emojiWrongNonce}
                />
              )}
              {gameMode === GAME_MODES.LONG_TYPING && (
                <LongTyping
                  key={currentQuestion.id}
                  onSubmit={handleSubmit}
                  hasSubmitted={hasSubmitted}
                  lastResult={lastResult}
                />
              )}

              {/* 이모지 사람 찾기는 정답 전까지 모달 숨김(오답 흔들림으로 대체) */}
              {lastResult && gameMode !== GAME_MODES.EMOJI_FIND && <ResultModal result={lastResult} />}
              {lastResult && gameMode === GAME_MODES.EMOJI_FIND && lastResult.isCorrect && <ResultModal result={lastResult} />}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center bg-white/75 backdrop-blur rounded-2xl px-8 py-6 shadow-lg">
              <div className="text-5xl mb-4 animate-pulse">🎮</div>
              <p className="text-slate-700 text-xl font-semibold">다음 문제를 기다리는 중...</p>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0"><ChatInput /></div>
      <GameGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
