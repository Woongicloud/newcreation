import { useCountdown } from '../hooks/useCountdown.js';

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// 참가자 폰의 원형 타이머
export default function Timer() {
  const t = useCountdown();
  if (!t) return null;
  const color = t.paused ? '#64748b' : t.fraction > 0.5 ? '#22c55e' : t.fraction > 0.25 ? '#eab308' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={RADIUS} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - t.fraction)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <span className="absolute text-2xl font-bold tabular-nums" style={{ color }}>
        {t.paused ? '⏸' : t.seconds}
      </span>
    </div>
  );
}
