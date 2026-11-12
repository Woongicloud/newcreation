import { motion } from 'framer-motion';
import { signed } from '../lib/labels.js';

// 제출 직후 본인 채점 결과
export default function ResultModal({ result }) {
  if (!result || result.falseStart) return null;
  const { isCorrect, delta = 0, accuracy } = result;
  const isTyping = accuracy !== undefined && accuracy !== null;
  const tone = isCorrect ? 'bg-green-600/90' : isTyping ? 'bg-blue-600/90' : 'bg-red-700/90';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15 }}
      className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
    >
      <div className={`rounded-3xl px-10 py-8 text-center shadow-2xl ${tone}`}>
        <p className="text-5xl mb-3">{isCorrect ? '🎉' : isTyping ? '📝' : '😢'}</p>
        <p className="text-white text-2xl font-bold mb-2">{isCorrect ? '정답!' : isTyping ? '기준 미달' : '오답!'}</p>
        {isTyping && <p className="text-white/90 text-lg font-semibold mb-1">정확도 {Math.round(accuracy * 100)}%</p>}
        <p className="text-white/90 text-xl font-bold">{signed(delta)}점</p>
      </div>
    </motion.div>
  );
}
