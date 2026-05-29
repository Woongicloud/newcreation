import { motion, AnimatePresence } from 'framer-motion';
import GuideContent from './GuideContent.jsx';

// 게임 진행 중 언제든 게임 방법을 재확인하는 모달 오버레이
export default function GameGuideModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="guide-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', damping: 22 }}
            className="relative max-w-lg mx-auto my-6 bg-gradient-to-br from-sky-50 to-purple-50 rounded-3xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-slate-800">📖 게임 방법</h1>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="w-9 h-9 rounded-full bg-white/80 text-slate-600 text-lg font-bold shadow active:scale-95 transition-transform"
              >
                ✕
              </button>
            </div>
            <GuideContent animate={false} />
            <button
              onClick={onClose}
              className="block w-full mt-6 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-center font-bold"
            >
              닫기
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
