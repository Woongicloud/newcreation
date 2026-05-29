import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../../lib/socket.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

export default function ReactionGame({ hasSubmitted, onReact }) {
  const [phase, setPhase] = useState('waiting'); // waiting | ready | signal | done
  const [rank, setRank] = useState(null);
  const signalTimeRef = useRef(null);

  useEffect(() => {
    // 준비 페이즈로 전환
    const t = setTimeout(() => setPhase('ready'), 500);

    const onSignal = () => {
      signalTimeRef.current = Date.now();
      setPhase('signal');
    };

    const onEnd = ({ results }) => {
      const myResult = results.find((r) => r.socketId === socket.id);
      if (myResult) setRank(myResult.rank);
      setPhase('done');
    };

    socket.on(SOCKET_EVENTS.GAME_REACTION_START, onSignal);
    socket.on(SOCKET_EVENTS.GAME_REACTION_END, onEnd);

    return () => {
      clearTimeout(t);
      socket.off(SOCKET_EVENTS.GAME_REACTION_START, onSignal);
      socket.off(SOCKET_EVENTS.GAME_REACTION_END, onEnd);
    };
  }, []);

  function handleTap() {
    if (phase !== 'signal' || hasSubmitted) return;
    const reactionTimeMs = Date.now() - (signalTimeRef.current || Date.now());
    onReact(reactionTimeMs);
    setPhase('done');
  }

  return (
    <AnimatePresence mode="wait">
      {phase === 'waiting' && (
        <motion.div
          key="waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center gap-4 py-8"
        >
          <div className="text-5xl animate-pulse">⏳</div>
          <p className="text-slate-600 text-xl font-semibold">잠시 후 시작됩니다...</p>
        </motion.div>
      )}

      {phase === 'ready' && (
        <motion.div
          key="ready"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center gap-4 py-8"
        >
          <div className="w-32 h-32 rounded-full bg-slate-300 flex items-center justify-center">
            <span className="text-5xl">🤚</span>
          </div>
          <p className="text-slate-800 text-2xl font-bold">준비하세요!</p>
          <p className="text-slate-500 text-sm">신호가 뜨면 바로 누르세요</p>
        </motion.div>
      )}

      {phase === 'signal' && (
        <motion.button
          key="signal"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.1 }}
          onClick={handleTap}
          className="w-full min-h-[220px] rounded-3xl bg-yellow-400 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform shadow-2xl"
        >
          <span className="text-6xl">👆</span>
          <span className="text-gray-900 text-3xl font-black">지금 누르세요!</span>
        </motion.button>
      )}

      {phase === 'done' && (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-4 py-8"
        >
          <div className="text-5xl">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '✅'}</div>
          <p className="text-slate-800 text-2xl font-bold">
            {rank ? `${rank}번째로 눌렀습니다!` : '제출 완료!'}
          </p>
          <p className="text-slate-500 text-sm">결과를 기다리는 중...</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
