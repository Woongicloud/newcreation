import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../lib/socket.js';
import useGameStore from '../store/gameStore.js';
import { SOCKET_EVENTS } from '@shared/constants.js';
import ChatInput from '../components/chat/ChatInput.jsx';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { player, roomCode, players, setPlayer, setRoomCode, setPlayers, setCurrentQuestion, setTimeRemaining } = useGameStore();
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!player) {
      const savedId = localStorage.getItem('playerId');
      const savedRoom = localStorage.getItem('roomCode');
      if (!savedId || !savedRoom) { navigate('/'); return; }

      setReconnecting(true);
      if (!socket.connected) socket.connect();

      const doRejoin = () => socket.emit(SOCKET_EVENTS.PLAYER_REJOIN, { playerId: savedId, roomCode: savedRoom });
      if (socket.connected) doRejoin(); else socket.once('connect', doRejoin);

      const onSync = ({ status, currentQuestion, players: sp, timeRemaining: tr }) => {
        const myPlayer = sp?.find(p => p.id === savedId)
          || { id: savedId, name: localStorage.getItem('playerName') || '', className: localStorage.getItem('playerClass') || '', score: 0 };
        setPlayer(myPlayer);
        setRoomCode(savedRoom);
        if (sp) setPlayers(sp);
        setReconnecting(false);
        if ((status === 'playing' || currentQuestion) && currentQuestion) {
          setCurrentQuestion(currentQuestion);
          setTimeRemaining(tr || 0);
          navigate('/game');
        }
      };
      const onFail = () => { localStorage.removeItem('playerId'); localStorage.removeItem('roomCode'); navigate('/'); };

      socket.once(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
      socket.once('error', onFail);

      return () => {
        socket.off('connect', doRejoin);
        socket.off(SOCKET_EVENTS.GAME_STATE_SYNC, onSync);
        socket.off('error', onFail);
      };
    }

    if (!socket.connected) socket.connect();

    const onReconnect = () => {
      const playerId = localStorage.getItem('playerId');
      const storedRoomCode = localStorage.getItem('roomCode');
      if (playerId && storedRoomCode) {
        socket.emit(SOCKET_EVENTS.PLAYER_REJOIN, { playerId, roomCode: storedRoomCode });
      }
    };
    const onPlayerJoined = ({ players: p }) => setPlayers(p);
    const onQuestionStart = ({ question, timeLimit }) => {
      setCurrentQuestion({ ...question, timeLimit });
      setTimeRemaining(timeLimit);
      navigate('/game');
    };
    const onSessionEnded = () => {
      ['playerId', 'roomCode', 'playerName', 'playerClass'].forEach((k) => localStorage.removeItem(k));
      navigate('/');
    };

    socket.on('connect', onReconnect);
    socket.on(SOCKET_EVENTS.GAME_PLAYER_JOINED, onPlayerJoined);
    socket.on(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
    socket.on(SOCKET_EVENTS.GAME_SESSION_ENDED, onSessionEnded);

    return () => {
      socket.off('connect', onReconnect);
      socket.off(SOCKET_EVENTS.GAME_PLAYER_JOINED, onPlayerJoined);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
      socket.off(SOCKET_EVENTS.GAME_SESSION_ENDED, onSessionEnded);
    };
  }, [player?.id]);

  if (reconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-gray-950">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">🔄</div>
          <p className="text-white text-lg font-semibold">재연결 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-950 via-purple-950 to-gray-950">
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-2">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <p className="text-purple-300 text-sm mb-1">방 코드</p>
          <h2 className="text-4xl font-mono font-bold text-white tracking-widest">{roomCode}</h2>
        </div>

        {/* 내 정보 */}
        {player && (
          <div className="bg-white/10 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-lg font-bold">
              {player.name[0]}
            </div>
            <div>
              <p className="text-white font-semibold">{player.name}</p>
              <p className="text-purple-300 text-sm">{player.className}</p>
            </div>
            <span className="ml-auto text-xs text-green-400 bg-green-900/40 px-2 py-1 rounded-full">접속됨</span>
          </div>
        )}

        {/* 대기 애니메이션 */}
        <div className="text-center mb-6">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-4xl mb-3"
          >
            ⏳
          </motion.div>
          <p className="text-white font-semibold text-lg">게임 시작 대기 중...</p>
          <p className="text-gray-400 text-sm mt-1">진행자가 게임을 시작하면 자동으로 이동됩니다</p>
        </div>

        {/* 참가자 목록 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-300 text-sm font-medium">참가자</h3>
            <span className="text-purple-300 text-sm font-bold">{players.length}명</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AnimatePresence>
              {players.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {p.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{p.name}</p>
                    <p className="text-gray-400 text-xs">{p.className}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="shrink-0"><ChatInput /></div>
    </div>
  );
}
