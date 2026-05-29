import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import socket from '../lib/socket.js';
import useGameStore from '../store/gameStore.js';
import { CLASS_OPTIONS, SOCKET_EVENTS } from '@shared/constants.js';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setPlayer, setRoomCode } = useGameStore();

  // 저장된 세션이 있으면 자동 재접속 (단, URL에 roomCode가 있으면 새 방 우선)
  useEffect(() => {
    const urlRoom = searchParams.get('roomCode')?.trim().toUpperCase() || null;

    // QR 코드로 새 방에 진입하는 경우 — 기존 세션 무조건 클리어
    if (urlRoom) {
      ['playerId', 'roomCode', 'playerName', 'playerClass'].forEach((k) => localStorage.removeItem(k));
      return;
    }

    const savedId = localStorage.getItem('playerId');
    const savedRoom = localStorage.getItem('roomCode');
    if (!savedId || !savedRoom) return;

    if (!socket.connected) socket.connect();

    const doRejoin = () => {
      socket.emit(SOCKET_EVENTS.PLAYER_REJOIN, { playerId: savedId, roomCode: savedRoom });
    };
    const onSync = ({ status, currentQuestion }) => {
      setPlayer({
        id: savedId,
        name: localStorage.getItem('playerName') || '',
        className: localStorage.getItem('playerClass') || '',
        score: 0,
      });
      setRoomCode(savedRoom);
      if (status === 'playing' || currentQuestion) navigate('/game');
      else navigate('/lobby');
    };
    const onFail = () => {
      ['playerId', 'roomCode', 'playerName', 'playerClass'].forEach((k) => localStorage.removeItem(k));
    };

    if (socket.connected) doRejoin(); else socket.once('connect', doRejoin);
    socket.once(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
    socket.once('error', onFail);

    return () => {
      socket.off('connect', doRejoin);
      socket.off(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
      socket.off('error', onFail);
    };
  }, [searchParams]);

  const [roomCode, setRoomCodeInput] = useState(searchParams.get('roomCode') || '');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [customClass, setCustomClass] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const finalClass = isCustom ? customClass : className;

  function handleClassChange(val) {
    if (val === '직접입력') {
      setIsCustom(true);
      setClassName('직접입력');
    } else {
      setIsCustom(false);
      setClassName(val);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!roomCode.trim()) return setError('방 코드를 입력해주세요.');
    if (!name.trim()) return setError('이름을 입력해주세요.');
    if (!finalClass.trim()) return setError('반을 선택하거나 입력해주세요.');

    setLoading(true);

    if (!socket.connected) socket.connect();

    socket.emit('player:register', {
      name: name.trim(),
      className: finalClass.trim(),
      roomCode: roomCode.trim().toUpperCase(),
    });

    socket.once('player:registered', ({ player }) => {
      setPlayer(player);
      setRoomCode(roomCode.trim().toUpperCase());
      localStorage.setItem('playerId', player.id);
      localStorage.setItem('roomCode', roomCode.trim().toUpperCase());
      localStorage.setItem('playerName', player.name);
      localStorage.setItem('playerClass', player.className);
      setLoading(false);
      navigate('/lobby');
    });

    socket.once('error', ({ message }) => {
      setError(message);
      setLoading(false);
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-pinwheel">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white/80 backdrop-blur rounded-3xl shadow-xl p-6"
      >
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">🎮 레크레이션</h1>
        <p className="text-center text-purple-700 text-sm mb-8">방 코드를 입력하고 참가하세요!</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 방 코드 */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">방 코드</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-xl font-mono tracking-[0.4em] text-center placeholder:text-slate-400 focus:outline-none focus:border-purple-400 touch-target"
            />
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              maxLength={10}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-lg placeholder:text-slate-400 focus:outline-none focus:border-purple-400 touch-target"
            />
          </div>

          {/* 반 선택 */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">반</label>
            <select
              value={className}
              onChange={(e) => handleClassChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-lg focus:outline-none focus:border-purple-400 touch-target appearance-none"
            >
              <option value="" className="bg-white text-slate-800">반 선택</option>
              {CLASS_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-white text-slate-800">{c}</option>
              ))}
              <option value="직접입력" className="bg-white text-slate-800">직접 입력...</option>
            </select>
            {isCustom && (
              <input
                type="text"
                value={customClass}
                onChange={(e) => setCustomClass(e.target.value)}
                placeholder="반 이름 입력 (예: 청소년부)"
                maxLength={10}
                className="mt-2 w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-lg placeholder:text-slate-400 focus:outline-none focus:border-purple-400 touch-target"
              />
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-red-600 text-sm text-center bg-red-100 border border-red-200 rounded-lg py-2 px-3">{error}</p>
          )}

          {/* 참가 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50 touch-target mt-2"
          >
            {loading ? '접속 중...' : '참가하기 🚀'}
          </button>

          <Link to="/guide" className="block text-center text-purple-700 text-xs mt-3 underline underline-offset-2">
            게임 방법 보기
          </Link>
        </form>
      </motion.div>
    </div>
  );
}
