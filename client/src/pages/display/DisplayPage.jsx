import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { GAME_MODES, PHASES, ROLES } from '@shared/protocol.js';
import { joinRoom, useRoom } from '../../lib/connection.js';
import { appUrl } from '../../lib/session.js';
import { themeOf } from '../../lib/themes.js';
import { MODE_LABEL } from '../../lib/labels.js';
import { useCountdown } from '../../hooks/useCountdown.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { CHOICE_HEX, CHOICE_LABELS } from '../../lib/choiceColors.js';
import ChatOverlay from '../../components/chat/ChatOverlay.jsx';
import StandingsBoard from './StandingsBoard.jsx';
import AwardStage from './AwardStage.jsx';

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const Screen = ({ id, className = '', children }) => (
  <motion.div key={id} {...fade} className={`absolute inset-0 flex ${className}`}>{children}</motion.div>
);

// 관리자가 고른 배경 (없으면 테마 기본 배경)
function Background({ background }) {
  if (!background?.value) return null;
  const { type, value } = background;
  if (type === 'video') {
    return <video key={value} src={value} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />;
  }
  const style = type === 'image'
    ? { backgroundImage: `url("${value}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: value };
  return <div className="absolute inset-0" style={style} />;
}

function TimerRing() {
  const t = useCountdown();
  if (!t) return null;
  const R = 45;
  const C = 2 * Math.PI * R;
  const color = t.paused ? 'var(--d-muted)' : t.fraction > 0.5 ? 'var(--d-accent)' : t.fraction > 0.25 ? '#FFD66B' : '#FF8A8A';
  return (
    <div className="relative flex items-center justify-center" style={{ width: '11vw', height: '11vw' }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--d-panel)" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - t.fraction)} style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <span className="absolute font-black tabular-nums" style={{ fontSize: '3.4vw', color }}>{t.paused ? '⏸' : t.seconds}</span>
    </div>
  );
}

function Lobby({ state }) {
  const names = state.lobby || [];
  return (
    <Screen id="lobby" className="items-center justify-center gap-[5vw] px-[4vw]">
      <div className="flex flex-col items-center gap-[1.5vw]">
        <div className="p-[1.2vw] rounded-2xl" style={{ background: 'var(--d-frame)' }}>
          <div className="bg-white p-[1vw] rounded-xl">
            <QRCodeSVG value={`${appUrl()}/?roomCode=${state.roomCode}`} size={Math.round(window.innerWidth * 0.2)} bgColor="#ffffff" fgColor="#0b1220" level="M" />
          </div>
        </div>
        <p style={{ fontSize: '1.5vw', color: 'var(--d-muted)' }}>QR 코드로 참가</p>
      </div>
      <div className="flex flex-col items-center gap-[1vw] max-w-[50vw]">
        <p className="font-black text-center" style={{ fontSize: '3vw' }}>{state.sessionName || '레크레이션'}</p>
        <p className="font-semibold" style={{ fontSize: '1.8vw', color: 'var(--d-accent2)' }}>방 코드</p>
        <p className="font-black font-mono tracking-[0.3em] px-[3vw] py-[1.2vw] rounded-2xl border-2"
          style={{ fontSize: '7vw', background: 'var(--d-panel)', borderColor: 'var(--d-accent2)' }}>
          {state.roomCode}
        </p>
        <p className="font-semibold" style={{ fontSize: '1.6vw', color: 'var(--d-accent)' }}>
          {state.hasSet ? `참가자 ${state.onlineCount}명 접속 중` : '준비 중입니다. 잠시만 기다려주세요'}
        </p>
        <div className="flex flex-wrap justify-center gap-[0.6vw] max-h-[14vw] overflow-hidden">
          {names.slice(-40).map((p, i) => (
            <motion.span key={`${p.name}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full px-[1.2vw] py-[0.3vw] border"
              style={{ fontSize: '1.3vw', background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}>
              {p.name}
            </motion.span>
          ))}
        </div>
      </div>
    </Screen>
  );
}

function Main({ state }) {
  return (
    <Screen id="main" className="flex-col items-center justify-center gap-[2vw]">
      <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-black text-center px-[6vw]"
        style={{ fontSize: '7vw', textShadow: '0 0.4vw 2vw rgba(0,0,0,0.35)' }}>
        {state.sessionName || '레크레이션'}
      </motion.p>
    </Screen>
  );
}

function QuestionScreen({ state }) {
  const { question, phase, position, stats, reaction } = state;
  const audioRef = useRef(null);
  const mode = question.gameMode;
  const open = phase === PHASES.QUESTION_OPEN;
  const revealed = phase === PHASES.QUESTION_REVEAL;
  const online = Math.max(1, state.onlineCount);
  const pct = Math.min(100, Math.round((state.submittedCount / online) * 100));

  // 오디오 퀴즈: 문제가 열려 있는 동안 재생
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !question.audioUrl) return undefined;
    if (open) el.play().catch(() => {});
    else el.pause();
    return () => el.pause();
  }, [question.id, open]);

  // 반응속도는 신호 화면이 전부다
  if (mode === GAME_MODES.REACTION && !revealed) {
    const signaled = reaction?.signaled && open;
    return (
      <Screen id={`react-${question.id}-${signaled}`} className="flex-col items-center justify-center gap-[2vw]"
        >
        <div className="absolute inset-0" style={{ background: signaled ? '#facc15' : 'transparent' }} />
        <p className="relative" style={{ fontSize: '10vw' }}>{signaled ? '👆' : open ? '🤚' : '⌛'}</p>
        <p className="relative font-black" style={{ fontSize: '5vw', color: signaled ? '#111827' : 'var(--d-fg)' }}>
          {signaled ? '지금 누르세요!' : open ? '준비하세요!' : '마감!'}
        </p>
        {!signaled && <p className="relative" style={{ fontSize: '2vw', color: 'var(--d-muted)' }}>{open ? '신호가 뜨기 전에 누르면 실격' : '결과를 기다려주세요'}</p>}
      </Screen>
    );
  }

  return (
    <Screen id={`q-${question.id}`} className="">
      {question.audioUrl && <audio ref={audioRef} src={question.audioUrl} className="hidden" />}
      <div className="flex-1 flex flex-col px-[4vw] py-[3vw] gap-[1.6vw] min-w-0">
        <div className="flex items-center gap-[1.2vw]">
          <span className="px-[1.4vw] py-[0.4vw] rounded-full font-bold" style={{ fontSize: '1.4vw', background: 'var(--d-frame)', color: '#0b1220' }}>
            R{position.round + 1} · {position.theme}
          </span>
          <span style={{ fontSize: '1.4vw', color: 'var(--d-accent2)' }}>
            Q{position.question + 1} / {position.questionCount} · {MODE_LABEL[mode]}
          </span>
          <span className="ml-auto font-bold" style={{ fontSize: '1.4vw', color: 'var(--d-accent)' }}>
            +{question.points}{question.penalty ? ` / -${question.penalty}` : ''}
          </span>
        </div>

        {mode === GAME_MODES.CONSONANT && question.consonantHint && (
          <p className="font-black tracking-[0.4em] text-center" style={{ fontSize: '5vw', color: 'var(--d-accent)' }}>{question.consonantHint}</p>
        )}

        <p className="font-black leading-snug whitespace-pre-wrap" style={{ fontSize: mode === GAME_MODES.LONG_TYPING ? '2vw' : '3.3vw' }}>
          {question.content}
        </p>

        {mode === GAME_MODES.LONG_TYPING && (
          <div className="rounded-[1vw] px-[2vw] py-[1.5vw] border overflow-hidden" style={{ background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}>
            <p className="font-bold leading-relaxed whitespace-pre-wrap" style={{ fontSize: '2.4vw' }}>{question.targetText}</p>
          </div>
        )}

        {question.imageUrls?.length > 0 && (
          <div className={`flex-1 min-h-0 grid gap-[1vw] ${question.imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {question.imageUrls.map((src) => (
              <img key={src} src={src} alt="" className="w-full h-full object-contain rounded-[1vw]" style={{ background: 'rgba(0,0,0,0.25)' }} />
            ))}
          </div>
        )}

        {question.audioUrl && <p className="text-center" style={{ fontSize: '6vw' }}>{open ? '🔊' : '🔈'}</p>}

        {mode === GAME_MODES.EMOJI_FIND && (
          <p className="text-center" style={{ fontSize: '2.2vw', color: 'var(--d-muted)' }}>
            폰에 뜬 이모지 세트가 같은 사람을 찾아, 그 사람의 코드를 입력하세요
          </p>
        )}

        {question.choices && (
          <div className="grid grid-cols-2 gap-[1.2vw] mt-auto">
            {question.choices.map((choice, i) => {
              const isAnswer = revealed && choice === question.correctAnswer;
              return (
                <div key={i} className="relative flex items-center gap-[1.2vw] rounded-[1vw] px-[1.8vw] py-[1.1vw] font-bold text-slate-900 transition-all"
                  style={{
                    fontSize: '1.9vw',
                    backgroundColor: CHOICE_HEX[i % CHOICE_HEX.length],
                    opacity: revealed && !isAnswer ? 0.35 : 1,
                    outline: isAnswer ? '0.5vw solid var(--d-accent)' : 'none',
                    transform: isAnswer ? 'scale(1.03)' : 'none',
                  }}>
                  <span style={{ fontSize: '2.2vw' }}>{CHOICE_LABELS[i] || i + 1}</span>
                  <span className="flex-1">{choice}</span>
                  {revealed && stats?.choiceCounts && <span className="font-mono">{stats.choiceCounts[i]}명</span>}
                </div>
              );
            })}
          </div>
        )}

        {revealed && !question.choices && question.correctAnswer && mode !== GAME_MODES.LONG_TYPING && (
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-auto self-center rounded-[1.5vw] px-[5vw] py-[1.6vw] font-black"
            style={{ fontSize: '4vw', background: 'var(--d-accent)', color: 'var(--d-on-accent)' }}>
            정답: {question.correctAnswer}
          </motion.div>
        )}

        {revealed && stats?.reaction && (
          <div className="flex flex-col gap-[0.8vw] w-full max-w-[60vw] self-center">
            {stats.reaction.slice(0, 5).map((r) => (
              <div key={r.rank} className="flex items-center gap-[2vw] rounded-[1vw] px-[2vw] py-[0.8vw] border" style={{ fontSize: '2.2vw', background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}>
                <span>{['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}</span>
                <span className="flex-1 font-bold">{r.name}</span>
                <span className="font-mono" style={{ color: 'var(--d-accent)' }}>{r.ms}ms</span>
                <span className="font-mono font-bold">+{r.points}</span>
              </div>
            ))}
            {stats.falseStarts > 0 && <p className="text-center" style={{ fontSize: '1.6vw', color: 'var(--d-muted)' }}>성급하게 누른 사람 {stats.falseStarts}명</p>}
          </div>
        )}
      </div>

      {/* 우측: 타이머와 제출 현황 */}
      <div className="w-[20vw] shrink-0 flex flex-col items-center justify-center gap-[2vw] border-l px-[1.5vw]" style={{ borderColor: 'var(--d-border)' }}>
        {open ? <TimerRing /> : (
          <p className="font-black text-center" style={{ fontSize: '2.4vw', color: 'var(--d-accent)' }}>{revealed ? '정답 공개' : '마감!'}</p>
        )}
        <div className="w-full space-y-[0.6vw]">
          <div className="flex justify-between" style={{ fontSize: '1.4vw' }}>
            <span>제출</span>
            <span className="font-bold">{state.submittedCount} / {state.onlineCount}</span>
          </div>
          <div className="h-[1vw] rounded-full overflow-hidden" style={{ background: 'var(--d-panel)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'var(--d-accent)' }} />
          </div>
        </div>
        {revealed && stats && mode !== GAME_MODES.REACTION && (
          <p className="text-center font-bold" style={{ fontSize: '1.8vw' }}>
            정답 <span style={{ color: 'var(--d-accent)' }}>{stats.correct}</span>명
            <span style={{ color: 'var(--d-muted)' }}> / {stats.answered}명 제출</span>
          </p>
        )}
      </div>
    </Screen>
  );
}

function Center({ id, emoji, title, subtitle }) {
  return (
    <Screen id={id} className="flex-col items-center justify-center gap-[1.5vw] px-[6vw] text-center">
      {emoji && <p style={{ fontSize: '8vw' }}>{emoji}</p>}
      <motion.p initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-black" style={{ fontSize: '5vw' }}>{title}</motion.p>
      {subtitle && <p style={{ fontSize: '2.2vw', color: 'var(--d-muted)' }}>{subtitle}</p>}
    </Screen>
  );
}

function Stage({ state }) {
  const { phase, position } = state;
  if (state.showMain) return <Main state={state} />;
  if (state.standings) {
    return (
      <Screen id="standings">
        <StandingsBoard
          title={state.standings.scope === 'round' ? '📊 이번 라운드 순위' : '📊 중간 순위'}
          entries={state.standings.entries}
          speed={state.settings.standingsSpeed}
        />
      </Screen>
    );
  }
  if (phase === PHASES.LOBBY) return <Lobby state={state} />;
  if (state.question) return <QuestionScreen state={state} />;
  if (phase === PHASES.ROUND_INTRO) {
    return <Center id={`intro-${position.round}`} emoji="🎬" title={position.theme}
      subtitle={`라운드 ${position.round + 1} / ${position.roundCount} · ${MODE_LABEL[position.gameMode]} · 문제 ${position.questionCount}개`} />;
  }
  if (phase === PHASES.ROUND_END) {
    return <Center id={`end-${position.round}`} emoji="✅" title={`라운드 ${position.round + 1} 종료`} subtitle={position.theme} />;
  }
  if (phase === PHASES.AWARDS && state.award) {
    return <Screen id={`award-${state.award.index}`}><AwardStage award={state.award} standingsSpeed={state.settings.standingsSpeed} /></Screen>;
  }
  return <Center id="final" emoji="🏁" title="게임 종료!" subtitle="곧 시상이 시작됩니다" />;
}

// 화면이 바뀔 때만 전환 애니메이션이 돌도록 화면 단위 키를 만든다
function stageKey(state) {
  if (state.showMain) return 'main';
  if (state.standings) return 'standings';
  if (state.question) return `q-${state.question.id}-${state.question.gameMode === GAME_MODES.REACTION ? `${state.phase}-${!!state.reaction?.signaled}` : ''}`;
  if (state.award) return `award-${state.award.index}`;
  return `${state.phase}-${state.position?.round ?? ''}`;
}

export default function DisplayPage() {
  const [params, setParams] = useSearchParams();
  const state = useRoom((s) => s.state);
  const closed = useRoom((s) => s.closed);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const preview = params.get('preview') === '1'; // 관리자 설정 화면의 축소 미리보기
  useWakeLock();

  async function join(code) {
    setError('');
    const res = await joinRoom({ roomCode: code, role: ROLES.DISPLAY });
    if (!res.ok) return setError(res.message || '연결하지 못했습니다.');
    if (params.get('room') !== code) setParams({ room: code }, { replace: true });
  }

  useEffect(() => {
    const code = (params.get('room') || '').toUpperCase();
    if (code) join(code);
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const theme = themeOf(state?.settings?.theme);

  if (!state) {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-white" style={{ ...theme.vars, background: 'var(--d-bg)', color: 'var(--d-fg)' }}>
        <form onSubmit={(e) => { e.preventDefault(); join(input.trim().toUpperCase()); }} className="space-y-4 text-center">
          <p className="font-bold text-2xl">📺 Display 연결</p>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="방 코드 입력" maxLength={6}
            className="px-6 py-4 rounded-xl bg-white/10 text-3xl font-mono tracking-widest text-center focus:outline-none w-64 border-2"
            style={{ borderColor: 'var(--d-border)', color: 'var(--d-fg)' }} />
          {(error || closed) && <p className="text-red-400 text-sm">{error || '방이 종료되었습니다.'}</p>}
          <button type="submit" className="block w-full py-3 rounded-xl font-bold text-lg shadow-lg" style={{ background: 'var(--d-frame)', color: '#0b1220' }}>
            연결하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen p-[0.45vw] select-none" style={{ ...theme.vars, background: 'var(--d-frame)', color: 'var(--d-fg)' }}>
      <div className="relative w-full h-full overflow-hidden rounded-[1.2vw]" style={{ background: 'var(--d-bg)' }}>
        <Background background={state.settings.background} />
        <ChatOverlay />
        {!preview && (
          <button
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
            className="absolute top-3 right-3 z-50 px-3 py-1 rounded-lg text-xs border opacity-40 hover:opacity-100 transition-opacity"
            style={{ background: 'var(--d-panel)', borderColor: 'var(--d-border)' }}
          >
            {fullscreen ? '⊡ 창모드' : '⊞ 전체화면'}
          </button>
        )}
        <AnimatePresence mode="wait">
          <Stage key={stageKey(state)} state={state} />
        </AnimatePresence>
      </div>
    </div>
  );
}
