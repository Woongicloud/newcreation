import { motion, AnimatePresence } from 'framer-motion';

export default function ResultModal({ result }) {
  if (!result) return null;
  const { isCorrect, scoreDelta } = result;

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
          isCorrect ? 'bg-green-600/90' : 'bg-red-700/90'
        }`}>
          <p className="text-5xl mb-3">{isCorrect ? '🎉' : '😢'}</p>
          <p className="text-white text-2xl font-bold mb-2">
            {isCorrect ? '정답!' : '오답!'}
          </p>
          <p className={`text-xl font-bold ${isCorrect ? 'text-green-200' : 'text-red-200'}`}>
            {scoreDelta > 0 ? `+${scoreDelta.toLocaleString()}` : scoreDelta.toLocaleString()}점
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
