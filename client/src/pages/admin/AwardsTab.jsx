import { useEffect, useState } from 'react';
import { PHASES } from '@shared/protocol.js';
import { request, EVENTS } from '../../lib/connection.js';
import { AWARD_TYPE_LABEL, REVEAL_LABEL, memberLabel } from '../../lib/labels.js';
import HostControls from '../../components/host/HostControls.jsx';
import { Panel, btn, btnPrimary, input } from './ui.jsx';

const METRIC_LABEL = { rank: '지정 등수', middle: '정중앙(중간값)', fastest: '평균 응답 최단', chattiest: '채팅 최다', round_best: '라운드 1위' };

const TEMPLATES = {
  individual_ranking: { type: 'individual_ranking', title: '개인 순위', reveal: 'countup', top: 5 },
  unit_ranking: { type: 'unit_ranking', title: '브릿지 순위', reveal: 'countup' },
  group_ranking: { type: 'group_ranking', title: '학년 순위', reveal: 'bar_race' },
  random: { type: 'random', title: '행운상', reveal: 'slot', count: 1 },
  special: { type: 'special', metric: 'middle', title: '특별상', reveal: 'card' },
};

const REVEALS_FOR = {
  individual_ranking: ['countup', 'podium', 'scroll'],
  unit_ranking: ['countup', 'podium', 'bar_race', 'scroll'],
  group_ranking: ['countup', 'podium', 'bar_race'],
  random: ['slot'],
  special: ['card'],
};

function ResultPreview({ item }) {
  const r = item.result;
  if (r.kind === 'single') return <span>{r.winner ? `${r.winner.name} (${memberLabel(r.winner)}) · ${r.detail}` : '해당자 없음'}</span>;
  if (r.kind === 'draw') return <span>{r.winners.length ? r.winners.map((w) => w.name).join(', ') : '공개할 때 추첨'}</span>;
  return (
    <span>
      {r.sections.flatMap((s) => s.entries).slice(0, 5)
        .map((e) => `${e.rank}. ${r.team ? [e.group, e.name].filter(Boolean).join(' ') : e.name} ${e.score.toLocaleString()}`).join(' / ')}
    </span>
  );
}

// 시상 탭 — 세트 편집(순서·연출·항목) + 종료 후 결과 미리보기와 진행
export default function AwardsTab({ state, flash }) {
  const [items, setItems] = useState(state.awardConfig);
  const [dirty, setDirty] = useState(false);
  const started = state.phase === PHASES.AWARDS;
  const finished = state.phase === PHASES.FINAL || started;
  const hasTeams = !!state.teams;

  // 다른 곳에서 바뀐 구성을 따라간다 (편집 중이 아니면)
  useEffect(() => { if (!dirty) setItems(state.awardConfig); }, [state.awardConfig]);

  const change = (next) => { setItems(next); setDirty(true); };
  const update = (i, p) => change(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const move = (i, d) => {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it);
    change(next);
  };

  async function save() {
    const res = await request(EVENTS.ADMIN_SET_AWARDS, { roomCode: state.roomCode, items });
    if (!res.ok) return flash(res.errors?.[0] ? `${res.errors[0].path}: ${res.errors[0].message}` : res.message || '저장하지 못했습니다.');
    setDirty(false);
    flash('시상 세트를 저장했습니다.');
  }

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(0,26rem)] gap-4 items-start">
      <Panel title="시상 세트"
        action={<div className="flex gap-2">
          {dirty && <button className={btn} onClick={() => { setItems(state.awardConfig); setDirty(false); }}>되돌리기</button>}
          <button className={btnPrimary} disabled={!dirty || started} onClick={save}>저장</button>
        </div>}>
        {started && <p className="text-xs text-amber-400">시상이 시작되어 구성을 바꿀 수 없습니다.</p>}
        {!state.hasSet && <p className="text-sm text-slate-400">문제 세트를 먼저 올려주세요.</p>}

        {items.map((it, i) => (
          <div key={i} className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-mono w-5">{i + 1}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 shrink-0">{AWARD_TYPE_LABEL[it.type]}</span>
              <input className={`${input} flex-1 min-w-0`} value={it.title} disabled={started} onChange={(e) => update(i, { title: e.target.value })} />
              <button className={btn} disabled={started || i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className={btn} disabled={started || i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className={`${btn} !text-red-300`} disabled={started} onClick={() => change(items.filter((_, idx) => idx !== i))}>삭제</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm pl-7">
              <label className="flex items-center gap-1">연출
                <select className={input} value={it.reveal} disabled={started} onChange={(e) => update(i, { reveal: e.target.value })}>
                  {REVEALS_FOR[it.type].map((r) => <option key={r} value={r}>{REVEAL_LABEL[r]}</option>)}
                </select>
              </label>
              {it.type.endsWith('_ranking') && (
                <label className="flex items-center gap-1">상위
                  <input type="number" min={1} className={`${input} w-16`} value={it.top ?? ''} placeholder="전체" disabled={started}
                    onChange={(e) => update(i, { top: e.target.value ? Number(e.target.value) : null })} />
                  {it.type === 'individual_ranking' ? '명' : '팀'}
                </label>
              )}
              {it.type === 'random' && (
                <label className="flex items-center gap-1">
                  <input type="number" min={1} className={`${input} w-16`} value={it.count} disabled={started} onChange={(e) => update(i, { count: Number(e.target.value) || 1 })} />명
                </label>
              )}
              {it.type === 'special' && (
                <>
                  <select className={input} value={it.metric} disabled={started} onChange={(e) => update(i, { metric: e.target.value })}>
                    {Object.entries(METRIC_LABEL).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                  </select>
                  {it.metric === 'rank' && (
                    <label className="flex items-center gap-1">
                      <input type="number" min={1} className={`${input} w-16`} value={it.rank ?? ''} disabled={started} onChange={(e) => update(i, { rank: Number(e.target.value) || 1 })} />등
                    </label>
                  )}
                  {it.metric === 'round_best' && (
                    <label className="flex items-center gap-1">
                      <input type="number" min={1} className={`${input} w-16`} value={it.round ?? ''} disabled={started} onChange={(e) => update(i, { round: Number(e.target.value) || 1 })} />라운드
                    </label>
                  )}
                </>
              )}
            </div>
            {finished && !dirty && state.awardList?.[i] && (
              <p className={`text-sm pl-7 ${state.awardIndex >= i ? 'text-emerald-300' : 'text-slate-400'}`}>
                {state.awardIndex > i ? '✓ ' : state.awardIndex === i ? '▶ ' : ''}<ResultPreview item={state.awardList[i]} />
              </p>
            )}
          </div>
        ))}

        {!started && state.hasSet && (
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-sm text-slate-400 self-center">추가:</span>
            {Object.entries(TEMPLATES).filter(([type]) => hasTeams || !['unit_ranking', 'group_ranking'].includes(type)).map(([type, tpl]) => (
              <button key={type} className={btn} onClick={() => change([...items, { ...tpl }])}>+ {AWARD_TYPE_LABEL[type]}</button>
            ))}
          </div>
        )}
        {!finished && <p className="text-xs text-slate-400">결과는 게임이 끝나면 계산됩니다. 게임이 끝난 뒤에도 시상을 시작하기 전까지는 구성을 바꿀 수 있습니다.</p>}
      </Panel>

      <Panel title="시상 진행">
        {finished ? <HostControls compact /> : <p className="text-sm text-slate-400">게임이 끝나면 여기서(또는 진행자 리모트에서) 시상을 진행합니다.</p>}
      </Panel>
    </div>
  );
}
