import { motion, AnimatePresence } from 'framer-motion';

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = [
  'from-yellow-500/30 to-yellow-600/10 border-yellow-500/40',
  'from-gray-400/30 to-gray-500/10 border-gray-400/40',
  'from-amber-600/30 to-amber-700/10 border-amber-600/40',
];

export default function Scoreboard({ leaderboard, isFinal }) {
  const top5 = leaderboard.slice(0, 5);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-white font-black mb-6"
        style={{ fontSize: '3vw' }}
      >
        {isFinal ? '🏆 최종 순위' : '📊 라운드 결과'}
      </motion.h2>

      <AnimatePresence>
        {top5.map((player, idx) => (
          <motion.div
            key={player.name}
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.15, type: 'spring', damping: 20 }}
            className={`
              flex items-center gap-4 mb-3 px-5 py-3 rounded-2xl border bg-gradient-to-r
              ${RANK_COLORS[idx] ?? 'from-white/10 to-white/5 border-white/10'}
            `}
          >
            <span style={{ fontSize: '2.5vw' }}>
              {MEDALS[idx] ?? `${player.rank}`}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate" style={{ fontSize: '2vw' }}>
                {player.name}
              </p>
              <p className="text-gray-400 text-sm">{player.className}</p>
            </div>
            <p className="font-black font-mono" style={{ fontSize: '2.2vw', color: '#ADFF2F' }}>
              {player.score.toLocaleString()}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
