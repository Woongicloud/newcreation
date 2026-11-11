import { useEffect, useState } from 'react';
import { useRoom } from '../lib/connection.js';

// 서버가 준 마감 시각으로 남은 시간을 계산한다 (매초 tick 이벤트 없음).
// 반환: { seconds, ms, fraction, paused } — 타이머가 없으면 null
export function useCountdown() {
  const timer = useRoom((s) => s.state?.timer);
  const total = useRoom((s) => s.state?.question?.timeLimit);
  const offset = useRoom((s) => s.clockOffset);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timer || timer.paused) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [timer?.deadlineAt, timer?.paused]);

  if (!timer) return null;
  const ms = timer.paused ? timer.remainingMs : Math.max(0, timer.deadlineAt - (Date.now() + offset));
  const totalMs = (total || 1) * 1000;
  return { ms, seconds: Math.ceil(ms / 1000), fraction: Math.min(1, ms / totalMs), paused: timer.paused };
}
