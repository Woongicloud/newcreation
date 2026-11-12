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

// 오른쪽 위 작은 초시계. 남은 시간에 따라 바늘 테두리가 줄어든다.
function Stopwatch() {
  const t = useCountdown();
  if (!t) return null;
  const R = 38;
  const C = 2 * Math.PI * R;
  const color = t.paused ? 'var(--d-muted)' : t.fraction > 0.5 ? 'var(--d-accent)' : t.fraction > 0.25 ? '#FFD66B' : '#FF8A8A';
  return (
    <div className="relative shrink-0" style={{ width: '4.6vw', height: '5.2vw' }} title="남은 시간">
      <svg viewBox="0 0 100 113" className="w-full h-full">
        <rect x="42" y="0" width="16" height="9" rx="3" fill={color} />
        <rect x="47" y="7" width="6" height="8" fill={color} />
        <rect x="80" y="18" width="12" height="7" rx="3" fill={color} transform="rotate(45 86 21)" />
        <circle cx="50" cy="63" r={R + 7} fill="var(--d-panel)" />
        <circle cx="50" cy="63" r={R} fill="none" stroke="rgba(127,127,127,0.25)" strokeWidth="7" />
        <circle cx="50" cy="63" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - t.fraction)} transform="rotate(-90 50 63)"
          style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <span className="absolute inset-x-0 font-black tabular-nums text-center" style={{ top: '38%', fontSize: '1.6vw', lineHeight: 1, color }}>
        {t.paused ? '⏸' : t.seconds}
      </span>
    </div>
  );
}

// 정답 공개 때 떠오르는 큰 카드
function RevealCard({ question, stats }) {
  const mode = question.gameMode;
  let label = '정답';
  let body = question.correctAnswer;
  if (mode === GAME_MODES.LONG_TYPING) { label = '결과'; body = `기준 통과 ${stats?.correct ?? 0}명`; }
  if (mode === GAME_MODES.EMOJI_FIND) { label = '결과'; body = `짝을 찾은 사람 ${stats?.correct ?? 0}명`; }
  if (body === null || body === undefined) return null;
  const choiceIdx = question.choices ? question.choices.indexOf(question.correctAnswer) : -1;
  const showCount = mode !== GAME_MODES.LONG_TYPING && mode !== GAME_MODES.EMOJI_FIND;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
        transition={{ opacity: { duration: 0.3 }, scale: { type: 'spring', damping: 11 }, y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 } }}
        className="rounded-[2vw] px-[6vw] py-[2vw] text-center max-w-[80vw]"
        style={{ background: 'var(--d-accent)', color: 'var(--d-on-accent)', boxShadow: '0 2vw 5vw rgba(0,0,0,0.45)' }}
      >
        <p className="font-bold opacity-80" style={{ fontSize: '1.8vw' }}>{label}</p>
        <p className="font-black leading-tight break-keep" style={{ fontSize: body.length > 14 ? '4.2vw' : '6vw' }}>
          {choiceIdx >= 0 && <span className="mr-[1.2vw]">{CHOICE_LABELS[choiceIdx]}</span>}
          {body}
        </p>
        {showCount && stats && (
          <p className="font-bold mt-[0.6vw] opacity-80" style={{ fontSize: '1.7vw' }}>
            정답 {stats.correct}명 / {stats.answered}명 제출
          </p>
        )}
      </motion.div>
    </div>
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
          <span className="font-bold" style={{ fontSize: '1.4vw', color: 'var(--d-accent)' }}>
            +{question.points}{question.penalty ? ` / -${question.penalty}` : ''}
          </span>
          <div className="ml-auto flex items-center gap-[1vw]">
            <div className="flex flex-col items-end gap-[0.3vw]" style={{ fontSize: '1.2vw' }}>
              <span className="font-bold tabular-nums">제출 {state.submittedCount}/{state.onlineCount}</span>
              <div className="h-[0.45vw] w-[7vw] rounded-full overflow-hidden" style={{ background: 'var(--d-panel)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'var(--d-accent)' }} />
              </div>
            </div>
            {open ? <Stopwatch /> : (
              <span className="px-[1vw] py-[0.3vw] rounded-full font-black" style={{ fontSize: '1.3vw', background: 'var(--d-panel)', color: 'var(--d-accent)' }}>
                {revealed ? '정답 공개' : '마감'}
              </span>
            )}
          </div>
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

        {/* 무대: 문제와 보기 사이의 남은 공간. 이미지가 여기 그려지고, 정답 공개 카드도 여기 뜬다 */}
        <div className="flex-1 min-h-[10vw] relative flex flex-col items-center justify-center gap-[1vw]">
        {question.imageUrls?.length > 0 && (
          <div className={`absolute inset-0 grid grid-rows-1 gap-[1vw] ${question.imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* 남은 높이 안에서만 그린다 — 이미지가 보기 버튼을 덮지 않도록 */}
            {question.imageUrls.map((src) => (
              <div key={src} className="relative min-h-0 rounded-[1vw] overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)' }}>
                <img src={src} alt="" className="absolute inset-0 w-full h-full object-contain" />
              </div>
            ))}
          </div>
        )}

        {question.audioUrl && <p className="text-center" style={{ fontSize: '6vw' }}>{open ? '🔊' : '🔈'}</p>}

        {mode === GAME_MODES.EMOJI_FIND && (
          <p className="text-center" style={{ fontSize: '2.2vw', color: 'var(--d-muted)' }}>
            폰에 뜬 이모지 세트가 같은 사람을 찾아, 그 사람의 코드를 입력하세요
          </p>
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
          {revealed && mode !== GAME_MODES.REACTION && <RevealCard question={question} stats={stats} />}
        </div>

        {question.choices && (
          <div className="grid grid-cols-2 gap-[1.4vw] shrink-0">
            {question.choices.map((choice, i) => {
              const isAnswer = revealed && choice === question.correctAnswer;
              return (
                <div key={i} className="relative flex items-center gap-[1.4vw] rounded-[1.2vw] px-[2.2vw] py-[1.5vw] font-black text-slate-900 transition-all leading-tight"
                  style={{
                    fontSize: question.choices.some((c) => c.length > 12) ? '2.4vw' : '3vw',
                    backgroundColor: CHOICE_HEX[i % CHOICE_HEX.length],
                    opacity: revealed && !isAnswer ? 0.35 : 1,
                    outline: isAnswer ? '0.5vw solid var(--d-accent)' : 'none',
                    transform: isAnswer ? 'scale(1.03)' : 'none',
                  }}>
                  <span style={{ fontSize: '1.15em' }}>{CHOICE_LABELS[i] || i + 1}</span>
                  <span className="flex-1">{choice}</span>
                  {revealed && stats?.choiceCounts && <span className="font-mono" style={{ fontSize: '0.75em' }}>{stats.choiceCounts[i]}명</span>}
                </div>
              );
            })}
          </div>
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
            className="absolute bottom-3 right-3 z-50 px-3 py-1 rounded-lg text-xs border opacity-30 hover:opacity-100 transition-opacity"
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
