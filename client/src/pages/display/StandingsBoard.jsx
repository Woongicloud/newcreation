import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

const ROW_SECONDS = 1.6; // 한 줄이 지나가는 시간 (배속 1 기준)

// 개인 집계 — `등수 · 학년 · 브릿지 · 이름 · 점수`.
// 목록이 화면보다 길면 맨 아래(하위)에서 시작해 1위까지 올라가며 자동 스크롤하고 반복한다.
export default function StandingsBoard({ title, entries, speed = 1, unitFont = 2.4 }) {
  const viewport = useRef(null);
  const list = useRef(null);
  const controls = useAnimationControls();
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (!viewport.current || !list.current) return;
      setOverflow(Math.max(0, list.current.scrollHeight - viewport.current.clientHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [entries]);

  useEffect(() => {
    let cancelled = false;
    if (overflow <= 0) { controls.set({ y: 0 }); return undefined; }
    const duration = (entries.length * ROW_SECONDS) / speed;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!cancelled) {
        controls.set({ y: -overflow });
        await wait(1500 / speed);
        if (cancelled) break;
        await controls.start({ y: 0, transition: { duration, ease: 'linear' } });
        await wait(4000 / speed);
      }
    })();
    return () => { cancelled = true; controls.stop(); };
  }, [overflow, entries, speed]);

  const medal = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <div className="flex flex-col w-full h-full px-[6vw] py-[3vw] gap-[1.5vw]">
      <p className="text-center font-black" style={{ fontSize: '3.6vw', color: 'var(--d-accent)' }}>{title}</p>
      <div ref={viewport} className="flex-1 overflow-hidden relative">
        <motion.div ref={list} animate={controls} data-standings-list className="flex flex-col gap-[0.8vw]">
          {entries.map((e) => (
            <div
              key={`${e.rank}-${e.name}`}
              className="flex items-center gap-[2vw] rounded-[1vw] px-[2.5vw] py-[1vw] border"
              style={{ background: 'var(--d-panel)', borderColor: 'var(--d-border)', fontSize: `${unitFont}vw` }}
            >
              <span className="font-black tabular-nums w-[5vw] text-center" style={{ color: medal[e.rank - 1] || 'var(--d-accent2)', fontSize: '1.2em' }}>
                {e.rank}
              </span>
              <span className="w-[9vw] truncate" style={{ color: 'var(--d-muted)' }}>{e.group || ''}</span>
              <span className="w-[14vw] truncate" style={{ color: 'var(--d-muted)' }}>{e.unit || ''}</span>
              <span className="flex-1 font-bold truncate">{e.name}</span>
              <span className="font-black font-mono tabular-nums" style={{ color: 'var(--d-accent)' }}>{e.score.toLocaleString()}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-center" style={{ color: 'var(--d-muted)', fontSize: '2vw' }}>아직 집계할 점수가 없습니다</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
