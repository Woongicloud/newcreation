import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 반응속도 — 신호(signaled)가 오면 누른다. 기기에서 잰 시간을 서버에 보낸다.
// 신호 전에 누르면 실격.
export default function ReactionGame({ signaled, answered, closed, result, onReact }) {
  const signalAt = useRef(null);
  useEffect(() => {
    if (signaled && signalAt.current === null) signalAt.current = performance.now();
  }, [signaled]);

  function handleTap() {
    if (answered || closed) return;
    onReact(signaled && signalAt.current !== null ? Math.round(performance.now() - signalAt.current) : null);
  }

  const phase = answered || closed ? 'done' : signaled ? 'signal' : 'ready';

  return (
    <AnimatePresence mode="wait">
      {phase === 'ready' && (
        <motion.button
          key="ready"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={handleTap}
          className="w-full min-h-[220px] rounded-3xl bg-slate-300 flex flex-col items-center justify-center gap-3"
        >
          <span className="text-6xl">🤚</span>
          <span className="text-slate-800 text-2xl font-bold">준비하세요!</span>
          <span className="text-slate-500 text-sm">신호가 뜨기 전에 누르면 실격</span>
        </motion.button>
      )}

      {phase === 'signal' && (
        <motion.button
          key="signal"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.08 }}
          onPointerDown={handleTap}
          className="w-full min-h-[220px] rounded-3xl bg-yellow-400 flex flex-col items-center justify-center gap-3 shadow-2xl"
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
          className="flex flex-col items-center justify-center gap-3 py-8 bg-white/80 rounded-3xl"
        >
          {result?.falseStart ? (
            <>
              <div className="text-5xl">🙅</div>
              <p className="text-slate-800 text-2xl font-bold">너무 빨랐어요!</p>
              <p className="text-slate-500 text-sm">신호 전에 눌러 이번 문제는 0점</p>
            </>
          ) : result?.rank ? (
            <>
              <div className="text-5xl">{['🥇', '🥈', '🥉'][result.rank - 1] || '✅'}</div>
              <p className="text-slate-800 text-2xl font-bold">{result.rank}번째!</p>
              <p className="text-slate-500 text-sm">{result.ms}ms</p>
            </>
          ) : answered ? (
            <>
              <div className="text-5xl">✅</div>
              <p className="text-slate-800 text-2xl font-bold">눌렀습니다!</p>
              <p className="text-slate-500 text-sm">정답 공개 때 결과가 나옵니다</p>
            </>
          ) : (
            <>
              <div className="text-5xl">⌛</div>
              <p className="text-slate-800 text-2xl font-bold">시간 종료</p>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
