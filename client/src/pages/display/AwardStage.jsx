import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StandingsBoard from './StandingsBoard.jsx';

// 최종 시상 — 서버가 공개한 부분(award.revealed)만 받아 연출한다.

const who = (e, team) => (team ? [e.group, e.name].filter(Boolean).join(' ') : e.name);
const sub = (e, team) => (team ? `${e.members}명` : [e.group, e.unit].filter(Boolean).join(' '));

function RankRow({ e, team, big }) {
  const medal = ['🥇', '🥈', '🥉'][e.rank - 1];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 16 }}
      className="flex items-center gap-[2vw] rounded-[1.2vw] px-[3vw] border"
      style={{
        background: e.rank === 1 ? 'var(--d-accent)' : 'var(--d-panel)',
        color: e.rank === 1 ? 'var(--d-on-accent)' : 'var(--d-fg)',
        borderColor: 'var(--d-border)',
        fontSize: big ? '3.4vw' : '2.6vw',
        padding: big ? '1.6vw 3vw' : '1vw 3vw',
      }}
    >
      <span className="font-black w-[6vw] text-center">{medal || e.rank}</span>
      <span className="flex-1 font-black truncate">{who(e, team)}</span>
      <span className="opacity-70 truncate" style={{ fontSize: '0.65em' }}>{sub(e, team)}</span>
      <span className="font-black font-mono tabular-nums">{e.score.toLocaleString()}</span>
    </motion.div>
  );
}

function Countup({ revealed }) {
  return (
    <div className="flex flex-col gap-[2vw] w-full">
      {revealed.sections.map((sec, i) => (
        <div key={sec.label || i} className="flex flex-col gap-[0.9vw]">
          {sec.label && <p className="font-bold" style={{ fontSize: '2vw', color: 'var(--d-accent2)' }}>{sec.label}</p>}
          <AnimatePresence>
            {sec.entries.map((e) => <RankRow key={`${e.rank}-${e.name}-${e.group || ''}`} e={e} team={revealed.team} big={e.rank === 1} />)}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// 단상: 3등 → 2등 → 1등 순으로 올라온다. 4위 이하는 아래에 작게.
function Podium({ revealed }) {
  const entries = revealed.sections[0]?.entries || [];
  const by = (rank) => entries.find((e) => e.rank === rank);
  const slots = [{ rank: 2, h: '16vw' }, { rank: 1, h: '22vw' }, { rank: 3, h: '11vw' }];
  const rest = entries.filter((e) => e.rank > 3);
  return (
    <div className="flex flex-col items-center gap-[2vw] w-full">
      <div className="flex items-end justify-center gap-[2vw]">
        {slots.map(({ rank, h }) => {
          const e = by(rank);
          return (
            <div key={rank} className="flex flex-col items-center w-[20vw]">
              <AnimatePresence>
                {e && (
                  <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 12 }} className="text-center mb-[1vw]">
                    <p style={{ fontSize: '4vw' }}>{['🥇', '🥈', '🥉'][rank - 1]}</p>
                    <p className="font-black truncate max-w-[20vw]" style={{ fontSize: rank === 1 ? '3.4vw' : '2.6vw' }}>{who(e, revealed.team)}</p>
                    <p style={{ fontSize: '1.4vw', color: 'var(--d-muted)' }}>{sub(e, revealed.team)}</p>
                    <p className="font-black font-mono" style={{ fontSize: '2vw', color: 'var(--d-accent)' }}>{e.score.toLocaleString()}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="w-full rounded-t-[1vw] flex items-start justify-center pt-[1vw] font-black border"
                style={{ height: h, background: rank === 1 ? 'var(--d-accent)' : 'var(--d-panel)', color: rank === 1 ? 'var(--d-on-accent)' : 'var(--d-fg)', borderColor: 'var(--d-border)', fontSize: '3vw' }}>
                {rank}
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap justify-center gap-[1vw]">
          {rest.map((e) => (
            <span key={e.rank} className="rounded-full px-[1.5vw] py-[0.5vw] border" style={{ fontSize: '1.6vw', background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}>
              {e.rank}. {who(e, revealed.team)} · {e.score.toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 막대 경주: 모든 팀의 막대가 동시에 차오른다
function BarRace({ revealed }) {
  const entries = revealed.sections.flatMap((s) => s.entries);
  const max = Math.max(1, ...entries.map((e) => Math.abs(e.score)));
  return (
    <div className="flex flex-col gap-[1.4vw] w-full">
      {entries.map((e, i) => (
        <div key={`${e.name}-${e.group || ''}`} className="flex items-center gap-[1.5vw]" style={{ fontSize: '2.2vw' }}>
          <span className="w-[16vw] text-right font-bold truncate">{who(e, revealed.team)}</span>
          <div className="flex-1 h-[3.4vw] rounded-full overflow-hidden border" style={{ background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, (Math.abs(e.score) / max) * 100)}%` }}
              transition={{ duration: 3 + (entries.length - i) * 0.25, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: e.rank === 1 ? 'var(--d-accent)' : 'var(--d-accent2)' }}
            />
          </div>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.2 }} className="w-[12vw] font-black font-mono tabular-nums">
            {e.rank}위 · {e.score.toLocaleString()}
          </motion.span>
        </div>
      ))}
    </div>
  );
}

function Card({ revealed }) {
  const w = revealed.winner;
  return (
    <AnimatePresence mode="wait">
      {w ? (
        <motion.div key="winner" initial={{ scale: 0.4, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10 }}
          className="rounded-[2vw] px-[7vw] py-[4vw] text-center shadow-2xl" style={{ background: 'var(--d-accent)', color: 'var(--d-on-accent)' }}>
          <p className="font-black leading-tight" style={{ fontSize: '7vw' }}>{w.name}</p>
          <p className="font-bold opacity-80" style={{ fontSize: '2.4vw' }}>{[w.group, w.unit].filter(Boolean).join(' ')}</p>
          {revealed.detail && <p className="font-bold mt-[1vw]" style={{ fontSize: '2.2vw' }}>{revealed.detail}</p>}
        </motion.div>
      ) : (
        <motion.p key="wait" animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ fontSize: '9vw' }}>🎁</motion.p>
      )}
    </AnimatePresence>
  );
}

// 슬롯: 새 당첨자가 공개되면 이름 후보를 빠르게 돌리다가 멈춘다
function Slot({ revealed, pool = [], step, steps }) {
  const winners = revealed.winners;
  const [spinning, setSpinning] = useState(false);
  const [face, setFace] = useState('???');
  const shown = useRef(winners.length);

  useEffect(() => {
    if (winners.length <= shown.current) { shown.current = winners.length; return undefined; }
    shown.current = winners.length;
    const names = pool.length ? pool : ['?'];
    setSpinning(true);
    const spin = setInterval(() => setFace(names[Math.floor(Math.random() * names.length)]), 70);
    const stop = setTimeout(() => { clearInterval(spin); setSpinning(false); }, 2200);
    return () => { clearInterval(spin); clearTimeout(stop); };
  }, [winners.length]);

  const settled = spinning ? winners.slice(0, -1) : winners;
  const latest = winners[winners.length - 1];

  return (
    <div className="flex flex-col items-center gap-[2.5vw] w-full">
      <div className="rounded-[2vw] px-[6vw] py-[3vw] border-4 min-w-[46vw] text-center" style={{ background: 'var(--d-panel)', borderColor: 'var(--d-accent)' }}>
        <p className="font-black truncate" style={{ fontSize: '6.5vw', color: spinning ? 'var(--d-muted)' : 'var(--d-accent)' }}>
          {spinning ? face : latest ? latest.name : '🎰'}
        </p>
        {!spinning && latest && (
          <p className="font-bold" style={{ fontSize: '2vw', color: 'var(--d-muted)' }}>{[latest.group, latest.unit].filter(Boolean).join(' ')}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-[1.2vw]">
        {settled.map((w, i) => (
          <motion.span key={`${w.name}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full px-[2vw] py-[0.8vw] font-bold"
            style={{ fontSize: '2vw', background: 'var(--d-accent)', color: 'var(--d-on-accent)' }}>
            🎉 {w.name}
          </motion.span>
        ))}
      </div>
      <p style={{ fontSize: '1.6vw', color: 'var(--d-muted)' }}>{step} / {steps}명</p>
    </div>
  );
}

export default function AwardStage({ award, standingsSpeed }) {
  const { revealed, reveal } = award;
  let body;
  if (revealed.kind === 'single') body = <Card revealed={revealed} />;
  else if (revealed.kind === 'draw') body = <Slot revealed={revealed} pool={award.pool} step={award.step} steps={award.steps} />;
  else if (reveal === 'scroll' && award.step > 0) {
    const entries = revealed.sections.flatMap((s) => s.entries).map((e) => (revealed.team ? { ...e, unit: null, name: who(e, true), group: null } : e));
    return <StandingsBoard title={`🏆 ${award.title}`} entries={entries} speed={standingsSpeed} />;
  } else if (reveal === 'podium') body = <Podium revealed={revealed} />;
  else if (reveal === 'bar_race') body = <BarRace revealed={revealed} />;
  else body = <Countup revealed={revealed} />;

  const empty = award.steps === 0;
  return (
    <div className="flex flex-col items-center w-full h-full px-[7vw] py-[3vw] gap-[2.5vw]">
      <motion.p key={award.index} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} className="font-black text-center"
        style={{ fontSize: '4.4vw', color: 'var(--d-accent)' }}>
        🏆 {award.title}
      </motion.p>
      <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
        {empty ? <p style={{ fontSize: '2.4vw', color: 'var(--d-muted)' }}>해당자가 없습니다</p> : body}
      </div>
    </div>
  );
}
