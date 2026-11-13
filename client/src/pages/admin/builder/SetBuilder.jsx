import { useEffect, useMemo, useRef, useState } from 'react';
import { PHASES } from '@shared/protocol.js';
import { validateQuizSet } from '@shared/quizSchema.js';
import { api, request, EVENTS } from '../../../lib/connection.js';
import { Panel, btn, btnPrimary, input } from '../ui.jsx';
import QuestionEditor from './QuestionEditor.jsx';
import {
  MODE_OPTIONS, MODE_HINT, newSet, newRound, newQuestion, convertQuestion, cleanSet, groupErrors, normalizeImport, pathLabel,
} from './model.js';
import { GAME_MODES as M } from '@shared/protocol.js';

const DRAFT_KEY = 'nc.builder.draft';
const label = 'block text-xs text-slate-400 mb-1';

const AWARD_CHOICES = [
  ['event', '행사 기본 — 브릿지 순위 → 행운상 3명 → 개인 5위 → 뉴평 중간값'],
  ['team_only', '팀 순위만 — 브릿지 순위 → 학년 순위'],
  ['quick', '간단 — 개인 1–3위'],
];

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && Array.isArray(saved.rounds)) return saved;
  } catch { /* 저장된 것이 없거나 깨짐 */ }
  return newSet();
}

const move = (list, i, d) => {
  const next = [...list];
  const [it] = next.splice(i, 1);
  next.splice(i + d, 0, it);
  return next;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

// 문제 만들기 — 게임 모드별 입력 화면에서 세트를 만들고 JSON 으로 내보낸다.
export default function SetBuilder({ state, token, flash, setTab }) {
  const [draft, setDraft] = useState(loadDraft);
  const [open, setOpen] = useState(() => new Set([0]));   // 펼친 라운드
  const [files, setFiles] = useState(null);
  const fileRef = useRef(null);

  // 작성 중인 내용은 이 브라우저에 자동 저장
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const save = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(latest.current)); } catch { /* 저장 불가 */ } };
    const t = setTimeout(save, 400);
    return () => clearTimeout(t);
  }, [draft]);
  // 입력 직후 창을 닫거나 다른 탭으로 가도 남도록
  useEffect(() => {
    const flush = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(latest.current)); } catch { /* 저장 불가 */ } };
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, []);

  useEffect(() => {
    api('/api/media?kind=question', { token }).then((res) => { if (res.ok) setFiles(res.files); });
  }, []);

  const output = useMemo(() => cleanSet(draft), [draft]);
  const check = useMemo(() => validateQuizSet(output), [output]);
  const grouped = useMemo(() => groupErrors(check.errors), [check]);
  const questionCount = draft.rounds.reduce((n, r) => n + (r.questions?.length || 0), 0);

  const update = (fn) => setDraft((d) => { const next = clone(d); fn(next); return next; });
  const setRound = (ri, fn) => update((d) => fn(d.rounds[ri]));

  function exportJson() {
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(draft.sessionName || 'quiz_set').replace(/[\\/:*?"<>|\s]+/g, '_')}.json`;
    // 문서에 붙여서 눌러야 파일 이름이 지켜지고, 페이지가 다운로드 주소로 이동하지 않는다
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.rounds)) throw new Error('rounds 가 없습니다');
        const { set, notes } = normalizeImport(data);
        setDraft(set);
        setOpen(new Set([0]));
        flash(`${file.name} 을(를) 불러왔습니다.${notes.length ? ` (${notes.join(', ')})` : ''}`);
      } catch (err) {
        flash(`불러오지 못했습니다: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function reset() {
    if (!window.confirm('작성 중인 내용을 지우고 새로 시작합니다. 필요하면 먼저 내보내기 하세요.')) return;
    setDraft(newSet());
    setOpen(new Set([0]));
  }

  async function applyToRoom() {
    const res = await request(EVENTS.ADMIN_LOAD_SET, { roomCode: state.roomCode, set: output });
    if (!res.ok) return flash(res.errors?.[0] ? `${res.errors[0].path}: ${res.errors[0].message}` : res.message || '적용하지 못했습니다.');
    flash(`방 ${state.roomCode} 에 적용했습니다.`);
    setTab('prepare');
  }

  const canApply = state && state.phase === PHASES.LOBBY;
  const awardValue = draft.awards?.items ? 'custom' : draft.awards?.preset || 'event';
  const teams = draft.teams;

  return (
    <div className="space-y-4">
      {/* 상단: 상태와 동작 */}
      <div className="sticky top-[60px] z-20 rounded-2xl bg-slate-900/95 backdrop-blur border border-slate-800 p-3 flex flex-wrap items-center gap-2">
        <p className={`text-sm font-bold ${check.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {check.ok ? '✅ 오류 없음' : `❌ 오류 ${check.errors.length}개`}
          <span className="text-slate-400 font-normal"> · 라운드 {draft.rounds.length}개 · 문제 {questionCount}개 · 자동 저장됨</span>
        </p>
        <span className="flex-1" />
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importJson} />
        <button className={btn} onClick={() => fileRef.current.click()}>📂 JSON 불러오기</button>
        <button className={btn} onClick={reset}>새로 만들기</button>
        <button className={btnPrimary} disabled={!check.ok} onClick={exportJson}>⬇ JSON 내보내기</button>
        {state && (
          <button className={btnPrimary} disabled={!check.ok || !canApply} onClick={applyToRoom}
            title={canApply ? '' : '게임이 시작된 방에는 적용할 수 없습니다'}>
            방 {state.roomCode} 에 적용
          </button>
        )}
      </div>

      {(grouped.other.length > 0 || check.warnings.length > 0) && (
        <div className="rounded-xl border border-slate-800 p-3 text-sm space-y-1">
          {grouped.other.map((e, i) => <p key={i} className="text-red-300"><code>{e.path || '(전체)'}</code> — {e.message}</p>)}
          {check.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-300">⚠ {w.path && w.path.startsWith('rounds[') ? <b>{pathLabel(w.path)} </b> : null}{w.message}</p>)}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="기본 정보">
          <label className="block"><span className={label}>행사 이름</span>
            <input className={`${input} w-full`} value={draft.sessionName || ''} placeholder="예: 11월 청소년부 레크레이션"
              onChange={(e) => update((d) => { d.sessionName = e.target.value; })} /></label>
          <div className="flex flex-wrap gap-3">
            <label><span className={label}>정답 기본 점수</span>
              <input type="number" min={0} className={`${input} w-24`} value={draft.scoring?.points ?? ''}
                onChange={(e) => update((d) => { d.scoring = { ...d.scoring, points: e.target.value === '' ? undefined : Number(e.target.value) }; })} /></label>
            <label><span className={label}>오답 기본 감점</span>
              <input type="number" min={0} className={`${input} w-24`} value={draft.scoring?.penalty ?? ''}
                onChange={(e) => update((d) => { d.scoring = { ...d.scoring, penalty: e.target.value === '' ? undefined : Number(e.target.value) }; })} /></label>
          </div>
          <p className="text-xs text-slate-500">문제·라운드에서 따로 정하지 않으면 이 값을 씁니다. 한 라운드에서 깎이는 점수는 그 라운드 감점 합의 50%까지입니다.</p>
          <label className="block"><span className={label}>최종 시상</span>
            <select className={`${input} w-full`} value={awardValue}
              onChange={(e) => update((d) => {
                if (e.target.value === 'event') delete d.awards;
                else if (e.target.value !== 'custom') d.awards = { preset: e.target.value };
              })}>
              {AWARD_CHOICES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              {awardValue === 'custom' && <option value="custom">불러온 세트의 시상 구성 ({draft.awards.items.length}항목)</option>}
            </select></label>
          <p className="text-xs text-slate-500">순서·연출은 게임 당일 ④ 시상 탭에서도 바꿀 수 있습니다.</p>
        </Panel>

        <Panel title="학년 · 브릿지"
          action={<label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-sky-500" checked={!!teams}
              onChange={(e) => update((d) => { if (e.target.checked) d.teams = { groups: [{ name: '', units: [''] }] }; else delete d.teams; })} />
            팀 사용</label>}>
          {!teams && <p className="text-sm text-slate-400">팀 없이 개인전으로 진행합니다. 참가자는 소속을 자유롭게 적습니다.</p>}
          {teams && (
            <>
              {teams.groups.map((g, gi) => (
                <div key={gi} className="rounded-lg border border-slate-800 p-2 space-y-2">
                  <div className="flex gap-2">
                    <input className={`${input} w-28`} placeholder="학년" value={g.name}
                      onChange={(e) => update((d) => { d.teams.groups[gi].name = e.target.value; })} />
                    <div className="flex-1 flex flex-wrap gap-1">
                      {g.units.map((u, ui) => (
                        <span key={ui} className="flex items-center">
                          <input className={`${input} w-28`} placeholder="브릿지" value={u}
                            onChange={(e) => update((d) => { d.teams.groups[gi].units[ui] = e.target.value; })} />
                          {g.units.length > 1 && <button className="text-slate-500 hover:text-red-300 px-1"
                            onClick={() => update((d) => { d.teams.groups[gi].units.splice(ui, 1); })}>✕</button>}
                        </span>
                      ))}
                      <button className={btn} onClick={() => update((d) => { d.teams.groups[gi].units.push(''); })}>+ 브릿지</button>
                    </div>
                    {teams.groups.length > 1 && <button className={`${btn} !text-red-300`}
                      onClick={() => update((d) => { d.teams.groups.splice(gi, 1); })}>삭제</button>}
                  </div>
                </div>
              ))}
              <button className={btn} onClick={() => update((d) => { d.teams.groups.push({ name: '', units: [''] }); })}>+ 학년 추가</button>
              {[...(grouped.other || [])].filter((e) => e.path.startsWith('teams')).length > 0 && (
                <p className="text-xs text-red-300">학년·브릿지 이름이 비었거나 겹치는 곳이 있습니다.</p>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* 라운드 */}
      {draft.rounds.map((round, ri) => {
        const isOpen = open.has(ri);
        const roundErrors = grouped.byRound.get(ri) || [];
        const qErrorCount = round.questions.reduce((n, _, qi) => n + (grouped.byQuestion.get(`${ri}:${qi}`)?.length || 0), 0);
        const toggle = () => setOpen((s) => { const n = new Set(s); if (n.has(ri)) n.delete(ri); else n.add(ri); return n; });
        return (
          <section key={ri} className={`rounded-2xl border p-4 space-y-3 ${qErrorCount + roundErrors.length ? 'border-red-800' : 'border-slate-800'} bg-slate-900`}>
            <div className="flex flex-wrap items-center gap-2">
              <button className="font-bold text-lg" onClick={toggle}>{isOpen ? '▾' : '▸'} R{ri + 1}</button>
              <input className={`${input} flex-1 min-w-[10rem]`} value={round.theme || ''} placeholder="라운드 제목"
                onChange={(e) => setRound(ri, (r) => { r.theme = e.target.value; })} />
              <select className={input} value={round.gameMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  if (round.questions.some((q) => q.content) && !window.confirm('게임 모드를 바꾸면 모드에 맞지 않는 입력(보기 등)이 정리됩니다. 계속할까요?')) return;
                  setRound(ri, (r) => { r.gameMode = mode; r.questions = r.questions.map((q) => convertQuestion(q, mode)); delete r.rankPoints; });
                }}>
                {MODE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <span className="text-sm text-slate-400">문제 {round.questions.length}개</span>
              {qErrorCount + roundErrors.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-800">오류 {qErrorCount + roundErrors.length}</span>}
              <span className="flex-1" />
              <button className={btn} disabled={ri === 0} onClick={() => update((d) => { d.rounds = move(d.rounds, ri, -1); })}>↑</button>
              <button className={btn} disabled={ri === draft.rounds.length - 1} onClick={() => update((d) => { d.rounds = move(d.rounds, ri, 1); })}>↓</button>
              <button className={btn} onClick={() => update((d) => { d.rounds.splice(ri + 1, 0, clone(d.rounds[ri])); })}>복제</button>
              <button className={`${btn} !text-red-300`} disabled={draft.rounds.length === 1}
                onClick={() => { if (window.confirm(`R${ri + 1} 라운드를 삭제합니다.`)) update((d) => { d.rounds.splice(ri, 1); }); }}>삭제</button>
            </div>

            {isOpen && (
              <>
                <p className="text-xs text-slate-400">{MODE_HINT[round.gameMode]}</p>
                <div className="flex flex-wrap items-end gap-3 text-sm">
                  <label className="flex items-center gap-2 pb-2">
                    <input type="checkbox" className="accent-sky-500" checked={!!round.standingsAfter}
                      onChange={(e) => setRound(ri, (r) => { r.standingsAfter = e.target.checked || undefined; })} />
                    라운드 끝나면 개인 집계 자동 표시</label>
                  <label><span className={label}>라운드 점수 (선택)</span>
                    <input type="number" min={0} className={`${input} w-24`} value={round.points ?? ''}
                      onChange={(e) => setRound(ri, (r) => { r.points = e.target.value === '' ? undefined : Number(e.target.value); })} /></label>
                  {round.gameMode !== M.REACTION && round.gameMode !== M.EMOJI_FIND && (
                    <label><span className={label}>라운드 감점 (선택)</span>
                      <input type="number" min={0} className={`${input} w-24`} value={round.penalty ?? ''}
                        onChange={(e) => setRound(ri, (r) => { r.penalty = e.target.value === '' ? undefined : Number(e.target.value); })} /></label>
                  )}
                  {round.gameMode === M.REACTION && (
                    <label><span className={label}>순위별 점수 (1등, 2등, … 쉼표로)</span>
                      <input className={`${input} w-48`} placeholder="예: 15, 10, 5" defaultValue={(round.rankPoints || []).join(', ')}
                        onBlur={(e) => setRound(ri, (r) => {
                          const list = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map(Number);
                          r.rankPoints = list.length ? list : undefined;
                        })} /></label>
                  )}
                </div>
                {roundErrors.map((e, i) => <p key={i} className="text-xs text-red-300"><code>{e.path}</code> — {e.message}</p>)}

                <div className="space-y-3">
                  {round.questions.map((q, qi) => (
                    <QuestionEditor
                      key={qi}
                      uid={`${ri}-${qi}`}
                      mode={round.gameMode}
                      q={q}
                      index={qi}
                      total={round.questions.length}
                      errors={grouped.byQuestion.get(`${ri}:${qi}`)}
                      files={files}
                      onChange={(next) => setRound(ri, (r) => { r.questions[qi] = next; })}
                      onMove={(d) => setRound(ri, (r) => { r.questions = move(r.questions, qi, d); })}
                      onDuplicate={() => setRound(ri, (r) => { r.questions.splice(qi + 1, 0, clone(q)); })}
                      onDelete={() => setRound(ri, (r) => { r.questions.splice(qi, 1); })}
                    />
                  ))}
                </div>
                <button className={btn} onClick={() => setRound(ri, (r) => { r.questions.push(newQuestion(r.gameMode)); })}>+ 문제 추가</button>
              </>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-slate-400 self-center">라운드 추가:</span>
        {MODE_OPTIONS.map(([v, t]) => (
          <button key={v} className={btn} onClick={() => {
            update((d) => { d.rounds.push(newRound(v, d.rounds.length)); });
            setOpen((s) => new Set([...s, draft.rounds.length]));
          }}>+ {t}</button>
        ))}
      </div>
    </div>
  );
}
