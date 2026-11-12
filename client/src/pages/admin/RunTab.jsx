import { useState } from 'react';
import { request, EVENTS } from '../../lib/connection.js';
import HostControls from '../../components/host/HostControls.jsx';
import { Panel, btn, input } from './ui.jsx';

// 진행 탭 — 리모트와 같은 진행 패널 + 참가자 모니터링
export default function RunTab({ state, flash }) {
  const [editing, setEditing] = useState(null); // { id, name, group, unit }
  const [filter, setFilter] = useState('');
  const teams = state.teams;
  const players = (state.players || []).filter((p) => !filter || p.name.includes(filter) || `${p.group} ${p.unit}`.includes(filter));

  async function save() {
    const res = await request(EVENTS.ADMIN_UPDATE_PLAYER, {
      roomCode: state.roomCode, playerId: editing.id, name: editing.name, group: editing.group, unit: editing.unit,
    });
    if (!res.ok) return flash(res.message || '수정하지 못했습니다.');
    setEditing(null);
  }

  async function remove(p) {
    if (!window.confirm(`${p.name} 님을 내보냅니다. 점수 기록도 함께 지워집니다.`)) return;
    const res = await request(EVENTS.ADMIN_REMOVE_PLAYER, { roomCode: state.roomCode, playerId: p.id });
    if (!res.ok) flash(res.message || '내보내지 못했습니다.');
  }

  const units = teams?.groups.find((g) => g.name === editing?.group)?.units || [];

  return (
    <div className="grid lg:grid-cols-[minmax(0,26rem)_1fr] gap-4 items-start">
      <Panel title="진행">
        <HostControls compact />
      </Panel>

      <Panel title={`참가자 ${state.playerCount}명 (접속 ${state.onlineCount}명)`}
        action={<input className={input} placeholder="이름·소속 검색" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-left sticky top-0 bg-slate-900">
              <tr><th className="py-1 w-10">#</th><th>이름</th><th>{teams?.labels.group || '소속'}</th><th>{teams?.labels.unit || ''}</th><th className="text-right">점수</th><th className="w-28" /></tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="py-1.5 text-slate-400">{p.rank}</td>
                  <td><span className={`inline-block w-2 h-2 rounded-full mr-2 ${p.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />{p.name}</td>
                  <td className={p.group ? '' : 'text-amber-400'}>{p.group || '미지정'}</td>
                  <td>{p.unit || ''}</td>
                  <td className="text-right font-mono">{p.score.toLocaleString()}</td>
                  <td className="text-right space-x-1">
                    <button className="text-sky-300 underline" onClick={() => setEditing({ id: p.id, name: p.name, group: p.group || '', unit: p.unit || '' })}>수정</button>
                    <button className="text-red-300 underline" onClick={() => remove(p)}>내보내기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {players.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">참가자가 없습니다.</p>}
        </div>
      </Panel>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">참가자 수정</p>
            <input className={`${input} w-full`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            {teams ? (
              <div className="grid grid-cols-2 gap-2">
                <select className={input} value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value, unit: '' })}>
                  <option value="">{teams.labels.group}</option>
                  {teams.groups.map((g) => <option key={g.name}>{g.name}</option>)}
                </select>
                <select className={input} value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}>
                  <option value="">{teams.labels.unit}</option>
                  {units.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            ) : (
              <input className={`${input} w-full`} placeholder="소속" value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })} />
            )}
            <div className="flex justify-end gap-2">
              <button className={btn} onClick={() => setEditing(null)}>취소</button>
              <button className={`${btn} !bg-sky-600`} onClick={save}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
