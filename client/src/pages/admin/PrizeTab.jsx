import { useMemo, useState } from 'react';
import { PHASES } from '@shared/protocol.js';
import { request, EVENTS } from '../../lib/connection.js';
import { Panel, btn, btnPrimary } from './ui.jsx';

// ⑦ 경품 — 게임이 끝난 뒤 시상 결과를 경품 지급용 목록으로 본다.
// 지급할 때마다 체크하면 서버에 저장되어 여러 기기에서 같이 보인다. 인쇄·CSV 내려받기.

const placeOf = (item, e) => {
  if (item.result.kind === 'draw') return '당첨';
  if (item.result.kind === 'single') return item.result.detail || '수상';
  return `${e.rank}위`;
};

// 시상 결과 → 지급 줄 목록
export function prizeRows(awardList = []) {
  const rows = [];
  awardList.forEach((item, i) => {
    const r = item.result;
    if (!r) return;
    if (r.kind === 'ranking') {
      for (const sec of r.sections) {
        for (const e of sec.entries) {
          if (r.team) {
            const [group, unit] = String(e.key || '').split('/');
            rows.push({
              key: `a${i}:t:${e.key}`, award: item.title, awardIndex: i, place: `${sec.label ? `${sec.label} ` : ''}${e.rank}위`,
              team: true, name: unit ? `${group} ${unit}` : group, group, unit: unit || null,
              roster: (e.roster || []).map((m) => m.name), score: e.score,
            });
          } else {
            rows.push({
              key: `a${i}:p:${e.id}`, award: item.title, awardIndex: i, place: `${sec.label ? `${sec.label} ` : ''}${e.rank}위`,
              team: false, name: e.name, group: e.group, unit: e.unit, score: e.score,
            });
          }
        }
      }
    } else if (r.kind === 'draw') {
      r.winners.forEach((w) => rows.push({
        key: `a${i}:p:${w.id}`, award: item.title, awardIndex: i, place: '당첨', team: false, name: w.name, group: w.group, unit: w.unit,
      }));
      if (r.winners.length === 0) rows.push({ key: null, award: item.title, awardIndex: i, place: '-', pending: true, name: '시상 때 추첨합니다' });
    } else if (r.winner) {
      rows.push({
        key: `a${i}:p:${r.winner.id}`, award: item.title, awardIndex: i, place: placeOf(item), team: false,
        name: r.winner.name, group: r.winner.group, unit: r.winner.unit,
      });
    }
  });
  return rows;
}

function toCsv(rows, checks) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['시상', '순위', '받는 사람/팀', '학년', '브릿지', '팀원 명단', '지급'];
  const body = rows.filter((r) => r.key).map((r) => [
    r.award, r.place, r.name, r.group || '', r.unit || '',
    (r.roster || []).join(', '), checks[r.key] ? 'O' : '',
  ]);
  return `﻿${[head, ...body].map((line) => line.map(esc).join(',')).join('\r\n')}`;
}

function Check({ row, checks, onToggle }) {
  if (!row.key) return <span className="text-slate-500">—</span>;
  const on = !!checks[row.key];
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={on} onChange={() => onToggle(row.key, !on)} />
      <span className={`text-xs ${on ? 'text-emerald-300' : 'text-slate-500'}`}>{on ? '지급' : '미지급'}</span>
    </label>
  );
}

export default function PrizeTab({ state, flash }) {
  const [view, setView] = useState('award'); // award | team
  const [hideDone, setHideDone] = useState(false);
  const finished = state.phase === PHASES.FINAL || state.phase === PHASES.AWARDS;
  const checks = state.prizeChecks || {};
  const rows = useMemo(() => prizeRows(state.awardList), [state.awardList]);
  const countable = rows.filter((r) => r.key);
  const done = countable.filter((r) => checks[r.key]).length;
  const visible = (list) => (hideDone ? list.filter((r) => !r.key || !checks[r.key]) : list);

  async function toggle(key, checked) {
    const res = await request(EVENTS.ADMIN_PRIZE_CHECK, { roomCode: state.roomCode, key, checked });
    if (!res.ok) flash(res.message || '저장하지 못했습니다.');
  }

  function download() {
    const blob = new Blob([toCsv(rows, checks)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.sessionName || '시상').replace(/[\\/:*?"<>|\s]+/g, '_')}_경품목록.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  if (!finished) {
    return <Panel title="경품 지급 목록"><p className="text-sm text-slate-400">게임이 끝나면 시상 결과가 여기에 지급 목록으로 나옵니다.</p></Panel>;
  }

  // 팀별: 학년 → 브릿지 → 그 팀이 받은 팀 시상 + 팀원 개인 시상
  const teamGroups = (() => {
    const map = new Map();
    const add = (group, unit, row) => {
      const g = group || '소속 없음';
      const label = unit ? `${g} ${unit}` : g;
      if (!map.has(label)) map.set(label, { label, group: g, rows: [] });
      map.get(label).rows.push(row);
    };
    for (const r of rows) if (r.key) add(r.group, r.unit, r);
    const order = new Map((state.teams?.groups || []).flatMap((g, gi) => [[g.name, gi * 100], ...g.units.map((u, ui) => [`${g.name} ${u}`, gi * 100 + ui + 1])]));
    return [...map.values()].sort((a, b) => (order.get(a.label) ?? 9999) - (order.get(b.label) ?? 9999) || a.label.localeCompare(b.label, 'ko'));
  })();

  const th = 'text-left font-semibold text-slate-400 py-1.5 pr-3';
  const td = 'py-2 pr-3 align-top';

  return (
    <div className="space-y-4 print-area">
      <Panel title={`경품 지급 목록 — ${state.sessionName || ''}`}
        action={<div className="flex flex-wrap gap-2 print:hidden">
          <button className={view === 'award' ? btnPrimary : btn} onClick={() => setView('award')}>시상별</button>
          <button className={view === 'team' ? btnPrimary : btn} onClick={() => setView('team')}>팀별</button>
          <button className={btn} onClick={() => window.print()}>🖨 인쇄</button>
          <button className={btn} onClick={download}>⬇ CSV (엑셀)</button>
        </div>}>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <p className="font-bold">지급 <span className="text-emerald-300">{done}</span> / {countable.length}</p>
          <label className="flex items-center gap-2 print:hidden">
            <input type="checkbox" className="accent-sky-500" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            지급한 항목 숨기기
          </label>
          <p className="text-xs text-slate-500 print:hidden">체크는 서버에 저장되어 다른 기기에서도 같이 보입니다. 행운상은 시상 때 추첨해야 목록에 나옵니다.</p>
        </div>
      </Panel>

      {view === 'award' && (state.awardList || []).map((item, i) => {
        const list = visible(rows.filter((r) => r.awardIndex === i));
        const team = item.result?.team;
        return (
          <Panel key={i} title={`🏆 ${item.title}`} className="break-inside-avoid">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={`${th} w-24`}>순위</th>
                <th className={th}>{team ? '팀' : '이름'}</th>
                {!team && <th className={th}>소속</th>}
                {team && <th className={th}>팀원 명단</th>}
                <th className={`${th} w-28`}>지급</th>
              </tr></thead>
              <tbody>
                {list.map((r, j) => (
                  <tr key={r.key || j} className={`border-t border-slate-800 ${r.key && checks[r.key] ? 'opacity-50' : ''}`}>
                    <td className={`${td} font-bold`}>{r.place}</td>
                    <td className={`${td} font-semibold`}>{r.name}</td>
                    {!team && <td className={`${td} text-slate-400`}>{[r.group, r.unit].filter(Boolean).join(' ')}</td>}
                    {team && <td className={`${td} text-slate-300`}>{(r.roster || []).join(', ') || '—'} <span className="text-slate-500">({(r.roster || []).length}명)</span></td>}
                    <td className={td}><Check row={r} checks={checks} onToggle={toggle} /></td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">{hideDone ? '모두 지급했습니다.' : '해당자가 없습니다.'}</td></tr>}
              </tbody>
            </table>
          </Panel>
        );
      })}

      {view === 'team' && teamGroups.map((g) => {
        const list = visible(g.rows);
        if (list.length === 0) return null;
        return (
          <Panel key={g.label} title={`👥 ${g.label}`} className="break-inside-avoid">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={th}>시상</th>
                <th className={`${th} w-24`}>순위</th>
                <th className={th}>받는 사람</th>
                <th className={`${th} w-28`}>지급</th>
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.key} className={`border-t border-slate-800 ${checks[r.key] ? 'opacity-50' : ''}`}>
                    <td className={td}>{r.award}</td>
                    <td className={`${td} font-bold`}>{r.place}</td>
                    <td className={`${td} font-semibold`}>
                      {r.team ? <>팀 전체 <span className="font-normal text-slate-300">— {(r.roster || []).join(', ')}</span></> : r.name}
                    </td>
                    <td className={td}><Check row={r} checks={checks} onToggle={toggle} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        );
      })}
      {view === 'team' && teamGroups.length === 0 && <Panel><p className="text-sm text-slate-400">지급할 항목이 없습니다.</p></Panel>}
    </div>
  );
}
