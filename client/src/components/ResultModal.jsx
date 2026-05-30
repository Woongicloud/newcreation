import { motion, AnimatePresence } from 'framer-motion';

export default function ResultModal({ result }) {
  if (!result) return null;
  const { isCorrect, scoreDelta, accuracy } = result;
  const isTyping = accuracy != null; // 장문 타이핑은 부분 점수 → 정확도로 표기

  return (
    <AnimatePresence>
      <motion.div
        key="result"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ type: 'spring', damping: 15 }}
        className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
      >
        <div className={`rounded-3xl px-10 py-8 text-center shadow-2xl ${
          isTyping ? 'bg-blue-600/90' : isCorrect ? 'bg-green-600/90' : 'bg-red-700/90'
        }`}>
          <p className="text-5xl mb-3">{isTyping ? '📝' : isCorrect ? '🎉' : '😢'}</p>
          <p className="text-white text-2xl font-bold mb-2">
            {isTyping ? '제출 완료!' : isCorrect ? '정답!' : '오답!'}
          </p>
          {isTyping && (
            <p className="text-blue-100 text-lg font-semibold mb-1">
              정확도 {Math.round(accuracy * 100)}%
            </p>
          )}
          <p className={`text-xl font-bold ${
            isTyping ? 'text-blue-100' : isCorrect ? 'text-green-200' : 'text-red-200'
          }`}>
            {scoreDelta > 0 ? `+${scoreDelta.toLocaleString()}` : scoreDelta.toLocaleString()}점
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
