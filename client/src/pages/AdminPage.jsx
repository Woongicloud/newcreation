import { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [gameStatus, setGameStatus] = useState('idle'); // idle | waiting | playing | finished
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [roundEndLeaderboard, setRoundEndLeaderboard] = useState(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const fileRef = useRef();

  function addLog(msg) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  }

  function handleAuth(e) {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      if (!socket.connected) socket.connect();
      // 저장된 방코드 복원
      const saved = sessionStorage.getItem('adminRoomCode');
      if (saved) setRoomCode(saved);
    } else {
      setPwError('비밀번호가 틀렸습니다.');
    }
  }

  useEffect(() => {
    if (!authed) return;

    socket.on(SOCKET_EVENTS.GAME_PLAYER_JOINED, ({ players: p }) => {
      setPlayers(p);
      setTotalPlayers(p.length);
      addLog(`참가자 업데이트: ${p.length}명`);
    });

    socket.on(SOCKET_EVENTS.GAME_QUESTION_START, ({ question }) => {
      setCurrentQuestion(question);
      setSubmittedCount(0);
      setRoundEndLeaderboard(null);
      setGameStatus('playing');
      addLog(`문제 시작: ${question.content.slice(0, 30)}...`);
    });

    socket.on(SOCKET_EVENTS.GAME_ROUND_END, ({ leaderboard: lb, isFinal }) => {
      setRoundEndLeaderboard(lb);
      addLog(isFinal ? '게임 종료 — 최종 순위표' : `라운드 종료 — 다음 라운드 시작 버튼을 눌러주세요`);
    });

    socket.on(SOCKET_EVENTS.GAME_QUESTION_END, ({ submittedCount: sc }) => {
      setSubmittedCount(sc ?? 0);
    });

    socket.on(SOCKET_EVENTS.GAME_SHOW_RESULT, ({ submittedCount: sc }) => {
      if (sc !== undefined) setSubmittedCount(sc);
    });

    socket.on('admin:room_created', ({ roomCode: rc }) => {
      setRoomCode(rc);
      sessionStorage.setItem('adminRoomCode', rc);
      setGameStatus('waiting');
      addLog(`방 생성: ${rc}`);
    });

    socket.on('admin:questions_loaded', ({ count }) => {
      setQuestionsLoaded(true);
      addLog(`문제 업로드 완료: ${count}개 라운드`);
    });

    socket.on(SOCKET_EVENTS.ERROR, ({ message }) => {
      setError(message);
      addLog(`오류: ${message}`);
    });

    return () => {
      socket.off(SOCKET_EVENTS.GAME_PLAYER_JOINED);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_END);
      socket.off(SOCKET_EVENTS.GAME_SHOW_RESULT);
      socket.off(SOCKET_EVENTS.GAME_ROUND_END);
      socket.off('admin:room_created');
      socket.off('admin:questions_loaded');
      socket.off(SOCKET_EVENTS.ERROR);
    };
  }, [authed]);

  function emit(event, extra = {}) {
    socket.emit(event, { password: ADMIN_PASSWORD, roomCode, ...extra });
  }

  function handleCreateRoom() {
    setError('');
    socket.emit(SOCKET_EVENTS.ADMIN_CREATE_ROOM, { password: ADMIN_PASSWORD });
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // UTF-8 BOM 제거 (Windows에서 저장 시 추가될 수 있음)
        let content = ev.target.result;
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        content = content.trim();

        if (!content) throw new Error(`파일이 비어있습니다 (${file.name}, ${file.size}bytes)`);

        const json = JSON.parse(content);
        if (!json.rounds) throw new Error('rounds 필드가 없습니다.');
        emit(SOCKET_EVENTS.ADMIN_UPLOAD_QUESTIONS, { rounds: json.rounds });
        addLog(`파일 파싱 완료: ${file.name} (${json.rounds.length}라운드)`);
      } catch (err) {
        setError('JSON 파싱 오류: ' + err.message);
        addLog(`파싱 실패: ${err.message}`);
      }
    };
    reader.onerror = () => setError(`파일 읽기 실패: ${reader.error}`);
    reader.readAsText(file, 'UTF-8');

    // input 초기화는 파일 참조 캡처 후
    const resetInput = e.target;
    setTimeout(() => { resetInput.value = ''; }, 100);
  }

  // ── 비밀번호 화면 ──────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <form onSubmit={handleAuth} className="w-full max-w-xs space-y-4">
          <h1 className="text-2xl font-bold text-white text-center">🔐 관리자</h1>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-400"
          />
          {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-lg active:scale-95 transition-transform"
          >
            입장
          </button>
        </form>
      </div>
    );
  }

  const submitPct = totalPlayers > 0 ? Math.round((submittedCount / totalPlayers) * 100) : 0;

  // ── 관리자 패널 ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">🎛 진행자 패널</h1>

      {error && (
        <div className="mb-4 bg-red-900/50 border border-red-600 rounded-xl px-4 py-3 text-red-300 text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400">✕</button>
        </div>
      )}

      {roundEndLeaderboard && (
        <div className="mb-4 bg-yellow-900/50 border border-yellow-600 rounded-xl px-4 py-3">
          <p className="text-yellow-300 font-bold text-sm mb-2">📊 라운드 종료 — 순위표</p>
          <div className="space-y-1 mb-3">
            {roundEndLeaderboard.slice(0, 5).map((p) => (
              <div key={p.rank} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-5">{p.rank}</span>
                <span className="text-white flex-1">{p.name}</span>
                <span className="text-yellow-400 font-mono">{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => emit(SOCKET_EVENTS.ADMIN_NEXT_ROUND)}
            className="w-full py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-sm transition-colors"
          >
            🔄 다음 라운드 시작
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 방 관리 */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-300 text-sm">방 관리</h2>
          {roomCode ? (
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">방 코드</p>
              <p className="text-5xl font-mono font-bold text-white tracking-widest">{roomCode}</p>
              <p className="text-purple-300 text-sm mt-2">{players.length}명 접속 중</p>
            </div>
          ) : (
            <button
              onClick={handleCreateRoom}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-lg transition-colors"
            >
              방 만들기
            </button>
          )}
        </div>

        {/* 문제 업로드 */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-300 text-sm">문제 업로드</h2>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!roomCode}
            className="w-full py-3 rounded-xl bg-teal-700 hover:bg-teal-600 font-bold transition-colors disabled:opacity-40"
          >
            📂 JSON 파일 선택
          </button>
          {questionsLoaded && (
            <p className="text-green-400 text-sm text-center">✅ 문제 업로드 완료</p>
          )}
        </div>

        {/* 게임 컨트롤 */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-300 text-sm">게임 컨트롤</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => emit(SOCKET_EVENTS.ADMIN_START_GAME)}
              disabled={!questionsLoaded || gameStatus === 'playing'}
              className="py-3 rounded-xl bg-green-700 hover:bg-green-600 font-bold transition-colors disabled:opacity-40"
            >
              ▶ 게임 시작
            </button>
            <button
              onClick={() => emit(SOCKET_EVENTS.ADMIN_NEXT_QUESTION)}
              disabled={gameStatus !== 'playing'}
              className="py-3 rounded-xl bg-blue-700 hover:bg-blue-600 font-bold transition-colors disabled:opacity-40"
            >
              ⏭ 다음 문제
            </button>
            <button
              onClick={() => emit(SOCKET_EVENTS.ADMIN_NEXT_ROUND)}
              disabled={gameStatus !== 'playing'}
              className="py-3 rounded-xl bg-yellow-700 hover:bg-yellow-600 font-bold transition-colors disabled:opacity-40"
            >
              🔄 다음 라운드
            </button>
            <button
              onClick={() => { if (confirm('게임을 종료하시겠습니까?')) emit(SOCKET_EVENTS.ADMIN_END_GAME); }}
              disabled={gameStatus !== 'playing'}
              className="py-3 rounded-xl bg-red-800 hover:bg-red-700 font-bold transition-colors disabled:opacity-40"
            >
              ⏹ 종료
            </button>
          </div>
        </div>

        {/* 응답 현황 */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-gray-300 text-sm">응답 현황</h2>
          {currentQuestion && (
            <p className="text-white text-sm line-clamp-2">{currentQuestion.content}</p>
          )}
          <div>
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>제출</span>
              <span>{submittedCount} / {totalPlayers} ({submitPct}%)</span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${submitPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 참가자 목록 */}
        <div className="bg-gray-900 rounded-2xl p-4 md:col-span-2">
          <h2 className="font-semibold text-gray-300 text-sm mb-3">참가자 ({players.length}명)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-4">이름</th>
                  <th className="text-left py-2 pr-4">반</th>
                  <th className="text-right py-2">점수</th>
                </tr>
              </thead>
              <tbody>
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .map((p) => (
                    <tr key={p.id} className="border-b border-gray-800">
                      <td className="py-2 pr-4 text-white">{p.name}</td>
                      <td className="py-2 pr-4 text-gray-400">{p.className}</td>
                      <td className="py-2 text-right text-yellow-400 font-mono">{p.score.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 로그 */}
        <div className="bg-gray-900 rounded-2xl p-4 md:col-span-2">
          <h2 className="font-semibold text-gray-300 text-sm mb-2">로그</h2>
          <div className="h-32 overflow-y-auto space-y-1 font-mono text-xs text-gray-400">
            {log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
