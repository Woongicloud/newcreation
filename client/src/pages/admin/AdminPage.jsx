import { useEffect, useState } from 'react';
import { api, joinRoom, leaveRoom, request, setAuthToken, useRoom, adoptRoom, EVENTS } from '../../lib/connection.js';
import { adminSession } from '../../lib/session.js';
import { ROLES } from '@shared/protocol.js';
import { PHASE_LABEL } from '../../lib/labels.js';
import ConnectionBanner from '../../components/ConnectionBanner.jsx';
import PrepareTab from './PrepareTab.jsx';
import RunTab from './RunTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import AwardsTab from './AwardsTab.jsx';

const TABS = [
  ['prepare', '① 준비'],
  ['run', '② 진행'],
  ['settings', '③ 표시 설정'],
  ['awards', '④ 시상'],
];

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // 비밀번호는 서버가 확인한다. 브라우저에는 발급된 토큰만 남는다.
    const res = await api('/api/admin/login', { method: 'POST', body: { password } });
    setBusy(false);
    if (!res.ok) return setError(res.message || '로그인하지 못했습니다.');
    onDone(res.token);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <h1 className="text-2xl font-bold text-center">🛠 관리자</h1>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" autoFocus
          className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-sky-500" />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button disabled={busy || !password} className="w-full py-3 rounded-xl bg-sky-600 font-bold disabled:opacity-40">
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState(() => adminSession.get()?.token || null);
  const [tab, setTab] = useState('prepare');
  const [rooms, setRooms] = useState([]);
  const [notice, setNotice] = useState('');
  const state = useRoom((s) => s.state);
  const closed = useRoom((s) => s.closed);
  const rejoinFailed = useRoom((s) => s.rejoinFailed);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  async function refreshRooms() {
    const res = await request(EVENTS.ADMIN_LIST_ROOMS);
    if (res.ok) setRooms(res.rooms);
    else if (res.error === 'forbidden') logout();
  }

  // 로그인 후: 토큰을 연결에 싣고, 이전에 보던 방이 있으면 다시 들어간다
  useEffect(() => {
    if (!token) return;
    setAuthToken(token);
    const saved = adminSession.get()?.roomCode;
    (async () => {
      if (saved) {
        const res = await joinRoom({ roomCode: saved, role: ROLES.ADMIN });
        if (!res.ok && res.error !== 'network') adminSession.set({ token });
      }
      refreshRooms();
    })();
  }, [token]);

  useEffect(() => {
    if (!closed && !rejoinFailed) return;
    adminSession.set({ token });
    leaveRoom();
    refreshRooms();
  }, [closed, rejoinFailed]);

  function logout() {
    adminSession.clear();
    leaveRoom();
    setAuthToken(null);
    setToken(null);
  }

  async function createRoom() {
    const res = await request(EVENTS.ADMIN_CREATE_ROOM);
    if (!res.ok) return flash(res.message || '방을 만들지 못했습니다.');
    adoptRoom(res.roomCode, res.state, ROLES.ADMIN);
    adminSession.set({ token, roomCode: res.roomCode });
    setTab('prepare');
    refreshRooms();
  }

  async function openRoom(roomCode) {
    const res = await joinRoom({ roomCode, role: ROLES.ADMIN });
    if (!res.ok) return flash(res.message || '방에 들어가지 못했습니다.');
    adminSession.set({ token, roomCode });
  }

  async function closeRoom(roomCode) {
    if (!window.confirm(`방 ${roomCode} 을(를) 닫습니다. 참가자 전원의 연결이 끊기고 되돌릴 수 없습니다.`)) return;
    const res = await request(EVENTS.ADMIN_CLOSE_ROOM, { roomCode });
    if (!res.ok) flash(res.message || '닫지 못했습니다.');
    refreshRooms();
  }

  if (!token) {
    return <Login onDone={(t) => { adminSession.set({ token: t }); setToken(t); }} />;
  }

  const ctx = { state, token, flash, rooms, refreshRooms, createRoom, openRoom, closeRoom, setTab };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ConnectionBanner />
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="font-bold text-lg">🛠 관리자</h1>
          {state ? (
            <p className="text-sm">
              <span className="font-mono font-bold text-sky-300 text-base">{state.roomCode}</span>
              <span className="text-slate-400"> · {state.sessionName || '세트 없음'} · {PHASE_LABEL[state.phase]} · 접속 {state.onlineCount}/{state.playerCount}명</span>
            </p>
          ) : <p className="text-sm text-slate-400">방을 만들거나 선택하세요</p>}
          <nav className="flex gap-1 ml-auto">
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} disabled={!state && id !== 'prepare'}
                className={`px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-30 ${tab === id ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                {label}
              </button>
            ))}
            <button onClick={logout} className="px-3 py-2 rounded-lg text-sm bg-slate-900 text-slate-400 hover:text-white">로그아웃</button>
          </nav>
        </div>
        {notice && <p className="bg-amber-600 text-white text-sm font-bold text-center py-1">{notice}</p>}
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {tab === 'prepare' && <PrepareTab {...ctx} />}
        {tab === 'run' && state && <RunTab {...ctx} />}
        {tab === 'settings' && state && <SettingsTab {...ctx} />}
        {tab === 'awards' && state && <AwardsTab {...ctx} />}
      </main>
    </div>
  );
}
