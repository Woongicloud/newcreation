import { motion } from 'framer-motion';

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Timer({ remaining, total }) {
  const pct = total > 0 ? remaining / total : 0;
  const dash = CIRCUMFERENCE * pct;
  const color = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <motion.circle
          cx="48" cy="48" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE - dash}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <span
        className="absolute text-2xl font-bold tabular-nums"
        style={{ color }}
      >
        {remaining}
      </span>
    </div>
  );
}
