import { useState } from 'react';
import { PHASES, COMMANDS as C, ERRORS } from '@shared/protocol.js';
import { useRoom, command } from '../../lib/connection.js';
import { useCountdown } from '../../hooks/useCountdown.js';
import { MODE_LABEL, PHASE_LABEL, NEXT_LABEL, memberLabel } from '../../lib/labels.js';

// 진행 패널 — 진행자 폰(/host)과 관리자 PC 진행 탭이 같이 쓴다.
// 주 버튼 하나가 현재 단계의 다음 동작을 한다. 서버가 next.action 으로 알려준다.

function AwardPreview({ award }) {
  const r = award.result;
  if (!r) return null;
  if (r.kind === 'single') {
    return <p className="text-sm">{r.winner ? `${r.winner.name} (${memberLabel(r.winner)}) · ${r.detail}` : '해당자 없음'}</p>;
  }
  if (r.kind === 'draw') {
    return <p className="text-sm">{r.winners.length ? r.winners.map((w) => w.name).join(', ') : '추첨 전'}</p>;
  }
  return (
    <div className="text-sm space-y-1 max-h-40 overflow-y-auto">
      {r.sections.map((sec, i) => (
        <div key={i}>
          {sec.label && <p className="text-slate-400 text-xs mt-1">{sec.label}</p>}
          {sec.entries.map((e) => (
            <p key={`${e.rank}-${e.name}-${e.group || ''}`} className="flex justify-between gap-2">
              <span className="truncate">{e.rank}. {r.team ? [e.group, e.name].filter(Boolean).join(' ') : `${e.name} (${memberLabel(e)})`}</span>
              <span className="font-mono shrink-0">{e.score.toLocaleString()}</span>
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function HostControls({ compact = false }) {
  const state = useRoom((s) => s.state);
  const connected = useRoom((s) => s.connected);
  const countdown = useCountdown();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null); // { label, run }
  const [sheet, setSheet] = useState(false);     // 순서표
  const [more, setMore] = useState(false);

  if (!state) return null;
  const { phase, position, question, next, standings, award, timer } = state;
  const open = phase === PHASES.QUESTION_OPEN;
  const finished = phase === PHASES.FINAL || phase === PHASES.AWARDS;
  const action = next?.action;

  async function send(type, args) {
    if (busy) return;
    setBusy(true);
    const res = await command(type, args);
    setBusy(false);
    // stale 은 다른 기기가 먼저 처리한 것 — 화면이 곧 따라오므로 알리지 않는다
    if (!res.ok && res.error !== ERRORS.STALE) {
      setToast(res.message || '처리하지 못했습니다.');
      setTimeout(() => setToast(''), 2500);
    }
  }
  const ask = (label, run) => setConfirm({ label, run });

  const sub = 'py-3 rounded-xl bg-slate-800 text-slate-100 text-sm font-bold active:scale-95 transition-transform disabled:opacity-30';

  return (
    <div className={`flex flex-col gap-3 text-slate-100 ${compact ? '' : 'min-h-full'}`}>
      {/* 현재 위치 */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="font-bold truncate">
          {position ? `R${position.round + 1} ${position.theme} · ${position.question + 1}/${position.questionCount}` : PHASE_LABEL[phase]}
        </p>
        <p className={`shrink-0 font-bold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          ● {connected ? '연결됨' : '끊김'}
        </p>
      </div>

      {/* 지금 화면 */}
      <div className="rounded-2xl bg-slate-900 border border-slate-700 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{PHASE_LABEL[phase]}{position ? ` · ${MODE_LABEL[position.gameMode]}` : ''}</span>
          <span>접속 {state.onlineCount} / {state.playerCount}명</span>
        </div>
        {question ? (
          <>
            <p className="text-lg font-bold leading-snug">{question.content}</p>
            {question.consonantHint && <p className="text-amber-300 font-bold tracking-widest">{question.consonantHint}</p>}
            {question.correctAnswer !== undefined && (
              <p className="text-emerald-300 font-bold">
                정답: {question.correctAnswer}
                {question.acceptAnswers?.length > 0 && <span className="text-emerald-200/80 font-normal"> (또는 {question.acceptAnswers.join(', ')})</span>}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <p className={`text-2xl font-black tabular-nums ${countdown && countdown.seconds <= 5 && open ? 'text-red-400' : ''}`}>
                {open ? (timer?.paused ? `⏸ ${countdown?.seconds ?? 0}초` : `⏱ ${countdown?.seconds ?? 0}초`) : PHASE_LABEL[phase]}
              </p>
              <p className="text-lg font-bold">제출 {state.submittedCount} / {state.onlineCount}</p>
            </div>
          </>
        ) : award ? (
          <>
            <p className="text-lg font-bold">🏆 {award.title} <span className="text-slate-400 text-sm">({award.index + 1}/{award.total})</span></p>
            <p className="text-slate-400 text-sm">공개 {award.step} / {award.steps}</p>
            <AwardPreview award={award} />
          </>
        ) : (
          <p className="text-lg font-bold">
            {phase === PHASES.LOBBY && (state.hasSet ? `${state.sessionName} — 참가자 입장 중` : '문제 세트를 올려주세요')}
            {phase === PHASES.ROUND_INTRO && `라운드 ${position.round + 1}: ${position.theme}`}
            {phase === PHASES.ROUND_END && `라운드 ${position.round + 1} 종료`}
            {phase === PHASES.FINAL && '게임 종료 — 시상을 시작하세요'}
          </p>
        )}
        {standings && <p className="text-sky-300 text-sm font-bold">📊 집계 송출 중</p>}
        {state.showMain && <p className="text-sky-300 text-sm font-bold">🖥 메인 화면 송출 중</p>}
      </div>

      {/* 주 버튼 */}
      <button
        disabled={!action || busy || !connected}
        onClick={() => send(C.NEXT)}
        className={`w-full rounded-3xl font-black text-white shadow-xl active:scale-[0.98] transition-transform disabled:opacity-30
          ${compact ? 'py-6 text-2xl' : 'py-10 text-3xl flex-1 min-h-[8rem]'}
          ${action === 'reveal' ? 'bg-amber-500' : finished ? 'bg-fuchsia-600' : 'bg-emerald-600'}`}
      >
        {action ? NEXT_LABEL[action] : finished ? '시상 완료' : '대기'}
      </button>

      {/* 다음 순서 */}
      {next && (next.content || next.theme || next.title) && (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-4 py-2 text-sm">
          <span className="text-slate-400">다음: </span>
          <span className="font-semibold">{next.content || next.theme || next.title}</span>
          {next.correctAnswer && <span className="text-emerald-300"> → {[next.correctAnswer, ...(next.acceptAnswers || [])].join(" / ")}</span>}
        </div>
      )}

      {toast && <p className="text-center text-sm font-bold text-red-300">{toast}</p>}

      {/* 보조 동작 */}
      <div className="grid grid-cols-3 gap-2">
        {standings ? (
          <button className={`${sub} !bg-sky-700`} onClick={() => send(C.HIDE_STANDINGS)}>집계 닫기</button>
        ) : (
          <button className={sub} disabled={open || phase === PHASES.QUESTION_CLOSED || !state.hasSet} onClick={() => send(C.SHOW_STANDINGS, { scope: 'total' })}>📊 개인 집계</button>
        )}
        {open && timer?.paused
          ? <button className={`${sub} !bg-amber-700`} onClick={() => send(C.RESUME)}>▶ 재개</button>
          : <button className={sub} disabled={!open} onClick={() => send(C.PAUSE)}>⏸ 일시정지</button>}
        <button className={sub} onClick={() => setMore((v) => !v)}>⋯ 더보기</button>
      </div>

      {more && (
        <div className="grid grid-cols-2 gap-2">
          <button className={sub} disabled={!open} onClick={() => send(C.EXTEND_TIME, { seconds: 10 })}>+10초</button>
          <button className={sub} disabled={open || phase === PHASES.QUESTION_CLOSED || !state.hasSet} onClick={() => send(C.SHOW_STANDINGS, { scope: 'round' })}>이번 라운드 집계</button>
          <button className={sub} disabled={phase !== PHASES.QUESTION_OPEN && phase !== PHASES.QUESTION_CLOSED}
            onClick={() => ask('이 문제를 무효 처리하고 건너뜁니다.', () => send(C.SKIP))}>⏭ 문제 건너뛰기</button>
          <button className={sub} disabled={!state.hasSet || finished} onClick={() => setSheet(true)}>📋 순서표</button>
          {state.showMain
            ? <button className={`${sub} !bg-sky-700`} onClick={() => send(C.HIDE_MAIN)}>메인 화면 닫기</button>
            : <button className={sub} onClick={() => send(C.SHOW_MAIN)}>🖥 메인 화면 띄우기</button>}
          {phase === PHASES.AWARDS && (
            <button className={sub} disabled={award.index + 1 >= award.total} onClick={() => send(C.AWARD_NEXT)}>이 시상 건너뛰기</button>
          )}
          <button className={`${sub} !bg-red-900`} disabled={phase === PHASES.LOBBY || finished}
            onClick={() => ask('게임을 종료하고 시상 단계로 넘어갑니다. 되돌릴 수 없습니다.', () => send(C.END_GAME))}>게임 종료</button>
        </div>
      )}

      {/* 확인 */}
      {confirm && (
        <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-lg">{confirm.label}</p>
            <div className="grid grid-cols-2 gap-2">
              <button className={sub} onClick={() => setConfirm(null)}>취소</button>
              <button className={`${sub} !bg-red-700`} onClick={() => { confirm.run(); setConfirm(null); }}>진행</button>
            </div>
          </div>
        </div>
      )}

      {/* 순서표 */}
      {sheet && (
        <div className="fixed inset-0 z-[140] bg-slate-950 overflow-y-auto p-4">
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">📋 순서표</p>
              <button className="px-4 py-2 rounded-xl bg-slate-800 font-bold" onClick={() => setSheet(false)}>닫기</button>
            </div>
            {state.outline.map((round, ri) => (
              <div key={ri} className="space-y-1">
                <p className="text-sm font-bold text-sky-300">R{ri + 1} {round.theme} · {MODE_LABEL[round.gameMode]}</p>
                {round.questions.map((q, qi) => {
                  const here = position && position.round === ri && position.question === qi;
                  return (
                    <button
                      key={qi}
                      onClick={() => ask(`R${ri + 1} 문제 ${qi + 1}(으)로 이동합니다. 공개 전인 현재 문제는 무효 처리됩니다.`,
                        () => { send(C.GOTO, { round: ri, question: qi }); setSheet(false); })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${here ? 'bg-emerald-800' : 'bg-slate-900'}`}
                    >
                      <span className="text-slate-400">{qi + 1}. </span>{q.content}
                      {q.correctAnswer && <span className="text-emerald-300"> → {[q.correctAnswer, ...(q.acceptAnswers || [])].join(" / ")}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
