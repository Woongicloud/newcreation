import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, joinRoom, registerPlayer } from '../../lib/connection.js';
import { playerSession } from '../../lib/session.js';

// 참가 등록: 방 코드 → (서버에서 학년·브릿지 목록) → 이름 + 학년 + 브릿지
export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlRoom = (params.get('roomCode') || '').trim().toUpperCase();

  const [roomCode, setRoomCode] = useState(urlRoom);
  const [room, setRoom] = useState(null);   // /api/rooms/:code/public 응답
  const [roomError, setRoomError] = useState('');
  const [name, setName] = useState(playerSession.get()?.name || '');
  const [group, setGroup] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);

  // 이어서 하기: 저장된 접속 정보가 있고, QR 이 다른 방을 가리키지 않으면 바로 복귀
  useEffect(() => {
    const saved = playerSession.get();
    if (!saved?.token || (urlRoom && urlRoom !== saved.roomCode)) return;
    let cancelled = false;
    setResuming(true);
    joinRoom({ roomCode: saved.roomCode, token: saved.token }).then((res) => {
      if (cancelled) return;
      if (res.ok) return navigate('/play', { replace: true });
      if (res.error !== 'network') playerSession.set({ name: saved.name });
      setResuming(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 방 코드 6자리가 채워지면 방 정보를 불러온다
  async function loadRoom(code) {
    setRoomError('');
    const res = await api(`/api/rooms/${code}/public`);
    if (!res.ok) { setRoom(null); return setRoomError(res.message || '방을 찾을 수 없습니다.'); }
    setRoom(res);
  }
  useEffect(() => {
    setRoom(null); setGroup(''); setUnit('');
    if (roomCode.length === 6) loadRoom(roomCode);
    else setRoomError('');
  }, [roomCode]);

  const teams = room?.teams;
  const units = teams?.groups.find((g) => g.name === group)?.units || [];
  const ready = room?.ready && !room.finished;
  const complete = ready && name.trim() && (!teams || (group && unit));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setError('');
    const res = await registerPlayer({ roomCode, name: name.trim(), group, unit });
    setBusy(false);
    if (!res.ok) return setError(res.message || '입장하지 못했습니다.');
    playerSession.set({ roomCode, token: res.token, name: name.trim() });
    navigate('/play', { replace: true });
  }

  if (resuming) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pinwheel">
        <p className="bg-white/80 rounded-2xl px-8 py-6 text-slate-700 font-semibold shadow-lg">이어서 접속하는 중…</p>
      </div>
    );
  }

  const chip = (active) => `px-4 py-3 rounded-xl border-2 font-bold text-base touch-target transition-colors ${
    active ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-pinwheel">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white/85 backdrop-blur rounded-3xl shadow-xl p-6 space-y-5"
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800">🎮 {room?.sessionName || '레크레이션'}</h1>
          <p className="text-purple-700 text-sm mt-1">방 코드를 입력하고 참가하세요!</p>
        </div>

        <label className="block">
          <span className="text-slate-600 text-sm font-semibold">방 코드</span>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="6자리"
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white border-2 border-slate-300 text-slate-800 text-2xl font-mono tracking-[0.3em] text-center focus:outline-none focus:border-purple-400"
          />
          {roomError && <p className="text-red-600 text-sm mt-1">{roomError}</p>}
          {room?.finished && <p className="text-red-600 text-sm mt-1">이미 종료된 게임입니다.</p>}
          {room && !room.ready && (
            <p className="text-amber-700 text-sm mt-1">
              아직 준비 중인 방입니다.{' '}
              <button type="button" onClick={() => loadRoom(roomCode)} className="underline font-bold">다시 확인</button>
            </p>
          )}
        </label>

        {ready && (
          <>
            <label className="block">
              <span className="text-slate-600 text-sm font-semibold">이름</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                placeholder="이름을 입력하세요"
                autoComplete="off"
                className="mt-1 w-full px-4 py-3 rounded-xl bg-white border-2 border-slate-300 text-slate-800 text-lg focus:outline-none focus:border-purple-400"
              />
            </label>

            {teams ? (
              <>
                <div>
                  <span className="text-slate-600 text-sm font-semibold">{teams.labels.group}</span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {teams.groups.map((g) => (
                      <button key={g.name} type="button" className={chip(group === g.name)}
                        onClick={() => { setGroup(g.name); setUnit(g.units.length === 1 ? g.units[0] : ''); }}>
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
                {group && (
                  <div>
                    <span className="text-slate-600 text-sm font-semibold">{teams.labels.unit}</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {units.map((u) => (
                        <button key={u} type="button" className={chip(unit === u)} onClick={() => setUnit(u)}>{u}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <label className="block">
                <span className="text-slate-600 text-sm font-semibold">소속 (선택)</span>
                <input
                  value={group}
                  onChange={(e) => setGroup(e.target.value.slice(0, 20))}
                  placeholder="예: 중2"
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-white border-2 border-slate-300 text-slate-800 text-lg focus:outline-none focus:border-purple-400"
                />
              </label>
            )}
          </>
        )}

        {error && <p className="text-red-600 text-sm text-center font-semibold">{error}</p>}

        <button
          type="submit"
          disabled={!complete || busy}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xl font-bold
                     active:scale-95 transition-transform disabled:opacity-40 touch-target"
        >
          {busy ? '입장 중…' : '참가하기'}
        </button>
        <Link to="/guide" className="block text-center text-purple-700 text-sm font-semibold underline">게임 방법 보기</Link>
      </motion.form>
    </div>
  );
}
