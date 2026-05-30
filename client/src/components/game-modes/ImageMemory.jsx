import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import MultipleChoice from './MultipleChoice.jsx';

// 이미지 기억력 테스트 — 암기 단계엔 "기억하세요" 안내(이미지는 프로젝터 전용),
// 암기 종료 후엔 기존 객관식 버튼으로 답변.
export default function ImageMemory({ question, onSubmit, hasSubmitted, correctAnswer, memorizePhase }) {
  const [count, setCount] = useState(question.memorizeDuration || 0);

  useEffect(() => {
    if (!memorizePhase) return;
    setCount(question.memorizeDuration || 0);
    const t = setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [memorizePhase, question.id, question.memorizeDuration]);

  if (memorizePhase) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center gap-4 py-10 text-center"
      >
        <div className="text-6xl animate-pulse">🧠</div>
        <p className="text-slate-800 text-2xl font-bold">화면의 이미지를 기억하세요!</p>
        <p className="text-slate-500 text-sm">잠시 후 문제가 나옵니다</p>
        {count > 0 && (
          <div className="mt-2 w-20 h-20 rounded-full bg-purple-100 border-2 border-purple-300 flex items-center justify-center">
            <span className="text-3xl font-black text-purple-700 tabular-nums">{count}</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <MultipleChoice
      question={question}
      onSubmit={onSubmit}
      hasSubmitted={hasSubmitted}
      correctAnswer={correctAnswer}
    />
  );
}
