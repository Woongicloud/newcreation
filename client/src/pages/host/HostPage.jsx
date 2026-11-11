import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { joinRoom, useRoom } from '../../lib/connection.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import HostControls from '../../components/host/HostControls.jsx';

const KEY = 'nc.host';

// 진행자 리모트 — 관리자 화면의 QR/링크(/host?room=CODE&t=TOKEN)로 들어온다.
export default function HostPage() {
  const [params, setParams] = useSearchParams();
  const state = useRoom((s) => s.state);
  const closed = useRoom((s) => s.closed);
  const rejoinFailed = useRoom((s) => s.rejoinFailed);
  const [error, setError] = useState('');
  useWakeLock();

  useEffect(() => {
    let creds = null;
    const room = params.get('room');
    const token = params.get('t');
    if (room && token) {
      creds = { roomCode: room.toUpperCase(), token };
      sessionStorage.setItem(KEY, JSON.stringify(creds));
      setParams({}, { replace: true }); // 토큰이 주소창·화면 공유에 남지 않게
    } else {
      try { creds = JSON.parse(sessionStorage.getItem(KEY)); } catch { /* 없음 */ }
    }
    if (!creds) return setError('관리자 화면의 진행자 QR로 접속해주세요.');
    joinRoom(creds).then((res) => { if (!res.ok) setError(res.message || '접속하지 못했습니다.'); });
  }, []);

  const message = closed ? '방이 종료되었습니다.' : rejoinFailed || error;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-4">
        {state ? (
          <HostControls />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-lg font-semibold text-slate-300">{message || '접속 중…'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
