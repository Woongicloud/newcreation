import { motion } from 'framer-motion';
import { signed } from '../lib/labels.js';

// 정답 공개 때 이번 문제에서 얻은 점수를 화면 위로 띄운다.
// 제출 직후에는 결과를 보여주지 않으므로 참가자가 결과를 처음 보는 순간이다.
export default function FloatingScore({ result, answered, gameMode }) {
  const delta = result?.delta ?? 0;
  let label;
  if (!answered) label = '미제출';
  else if (result?.falseStart) label = '너무 빨랐어요';
  else if (gameMode === 'reaction' && result?.rank) label = `${result.rank}번째!`;
  else if (result?.isCorrect) label = '정답!';
  else if (result?.accuracy !== undefined && result?.accuracy !== null) label = `정확도 ${Math.round(result.accuracy * 100)}%`;
  else label = '오답';

  const tone = delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : 'text-slate-500';
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-1/3 z-50 flex flex-col items-center"
      initial={{ opacity: 0, y: 40, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 0], y: [40, 0, -30, -90], scale: [0.6, 1.15, 1, 1] }}
      transition={{ duration: 3.2, times: [0, 0.15, 0.75, 1], ease: 'easeOut' }}
    >
      <p className={`font-black font-mono drop-shadow-[0_3px_0_rgba(255,255,255,0.9)] ${tone}`} style={{ fontSize: '4.5rem', lineHeight: 1 }}>
        {signed(delta)}
      </p>
      <p className="mt-2 px-4 py-1 rounded-full bg-white/90 text-slate-700 font-bold shadow">{label}</p>
    </motion.div>
  );
}
