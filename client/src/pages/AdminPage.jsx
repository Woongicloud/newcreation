import { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket.js';
import { SOCKET_EVENTS } from '@shared/constants.js';
import { ALL_PRACTICE } from '../data/practice/index.js';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '';

const LS_KEYS_ADMIN = ['adminRoomCode'];

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

  // 탭 상태
  const [activeTab, setActiveTab] = useState('control'); // 'control' | 'awards'

  // 시상 상태
  const [awardsData, setAwardsData] = useState(null);
  const [revealedAwards, setRevealedAwards] = useState({});
  const [slotMachineRunning, setSlotMachineRunning] = useState(false);
  const [slotDisplay, setSlotDisplay] = useState('???');
  const [slotWinner, setSlotWinner] = useState(null);
  const slotIntervalRef = useRef(null);

  // 모니터링 (활성 방 목록)
  const [roomsList, setRoomsList] = useState([]);
  const [nowTs, setNowTs] = useState(Date.now());
  const [allRoundsDone, setAllRoundsDone] = useState(false);        // 모든 라운드 완료(종료 버튼 대기)
  const [selectedAwardsRoom, setSelectedAwardsRoom] = useState(''); // 시상 대상으로 선택한 종료된 방

  function addLog(msg) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  }

  function handleAuth(e) {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      if (!socket.connected) socket.connect();
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
      setAllRoundsDone(false);
      setGameStatus('playing');
      addLog(`문제 시작: ${question.content.slice(0, 30)}...`);
    });

    socket.on(SOCKET_EVENTS.GAME_ROUND_END, ({ leaderboard: lb, isFinal, allRoundsComplete }) => {
      setRoundEndLeaderboard(lb);
      if (isFinal) setGameStatus('finished');
      if (allRoundsComplete) {
        setAllRoundsDone(true);
        addLog('모든 라운드 완료 — "게임 종료 & 시상" 버튼을 눌러주세요');
      } else {
        addLog(isFinal ? '게임 종료 — 최종 순위표' : '라운드 종료 — 다음 라운드 시작 버튼을 눌러주세요');
      }
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
      setQuestionsLoaded(false);
      setAwardsData(null);
      setRevealedAwards({});
      setAllRoundsDone(false);
      addLog(`방 생성: ${rc}`);
    });

    socket.on('admin:questions_loaded', ({ count }) => {
      setQuestionsLoaded(true);
      addLog(`문제 업로드 완료: ${count}개 라운드`);
    });

    socket.on(SOCKET_EVENTS.GAME_AWARDS_DATA, (data) => {
      setAwardsData(data);
      addLog('시상 데이터 로드 완료');
    });

    socket.on(SOCKET_EVENTS.ADMIN_ROOMS_DATA, (rooms) => {
      setRoomsList(rooms || []);
      setNowTs(Date.now());
    });

    socket.on(SOCKET_EVENTS.GAME_SESSION_ENDED, () => {
      setGameStatus('idle');
      setRoomCode('');
      sessionStorage.removeItem('adminRoomCode');
      addLog('세션 종료됨');
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
      socket.off(SOCKET_EVENTS.GAME_AWARDS_DATA);
      socket.off(SOCKET_EVENTS.ADMIN_ROOMS_DATA);
      socket.off(SOCKET_EVENTS.GAME_SESSION_ENDED);
      socket.off(SOCKET_EVENTS.ERROR);
    };
  }, [authed]);

  // 슬롯머신 정리
  useEffect(() => {
    return () => { clearInterval(slotIntervalRef.current); };
  }, []);

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
    const resetInput = e.target;
    setTimeout(() => { resetInput.value = ''; }, 100);
  }

  function handleLoadPractice() {
    if (!roomCode) return;
    emit(SOCKET_EVENTS.ADMIN_UPLOAD_QUESTIONS, { rounds: ALL_PRACTICE.rounds });
    addLog('연습 게임 로드됨');
  }

  // ── 시상 기능 ──────────────────────────────────────────────
  const awardsRoom = selectedAwardsRoom || roomCode;

  function handleLoadAwards() {
    if (!awardsRoom) return;
    socket.emit(SOCKET_EVENTS.ADMIN_GET_AWARDS, { password: ADMIN_PASSWORD, roomCode: awardsRoom });
  }

  // 종료된 방을 시상 대상으로 선택 → 해당 방 시상 데이터 로드
  function selectAwardsRoom(code) {
    setSelectedAwardsRoom(code);
    setAwardsData(null);
    setRevealedAwards({});
    setSlotWinner(null);
    socket.emit(SOCKET_EVENTS.ADMIN_GET_AWARDS, { password: ADMIN_PASSWORD, roomCode: code });
    addLog(`시상 대상 선택: ${code}`);
  }

  // 시상 화면을 Display(프로젝터)로 송출
  function showAwardOnDisplay(award) {
    const target = awardsRoom;
    if (!target) return;
    socket.emit(SOCKET_EVENTS.ADMIN_SHOW_AWARD, { password: ADMIN_PASSWORD, roomCode: target, award });
    addLog(award.type === 'clear' ? 'Display 대기화면 전환' : `Display 송출: ${award.title || award.name || ''}`);
  }

  function revealAward(key) {
    setRevealedAwards((prev) => ({ ...prev, [key]: true }));
  }

  function startSlotMachine() {
    if (!awardsData?.randomPool?.length) return;
    setSlotMachineRunning(true);
    setSlotWinner(null);
    slotIntervalRef.current = setInterval(() => {
      const pick = awardsData.randomPool[Math.floor(Math.random() * awardsData.randomPool.length)];
      setSlotDisplay(pick.name);
    }, 80);
  }

  function stopSlotMachine() {
    clearInterval(slotIntervalRef.current);
    setSlotMachineRunning(false);
    if (awardsData?.randomPool?.length) {
      const winner = awardsData.randomPool[Math.floor(Math.random() * awardsData.randomPool.length)];
      setSlotDisplay(winner.name);
      setSlotWinner(winner);
    }
  }

  // ── 모니터링 ───────────────────────────────────────────────
  function refreshRooms() {
    socket.emit(SOCKET_EVENTS.ADMIN_LIST_ROOMS, { password: ADMIN_PASSWORD });
  }

  function terminateRoom(targetCode) {
    if (!confirm(`방 ${targetCode} 을(를) 강제 종료하시겠습니까? 남은 참가자는 모두 퇴장됩니다.`)) return;
    emit(SOCKET_EVENTS.ADMIN_TERMINATE_ROOM, { roomCode: targetCode });
    addLog(`방 강제 종료 요청: ${targetCode}`);
  }

  function formatAge(createdAt) {
    if (!createdAt) return '-';
    const s = Math.max(0, Math.floor((nowTs - createdAt) / 1000));
    if (s < 60) return `${s}초`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}분`;
    return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  }

  const STATUS_LABEL = { waiting: '대기', playing: '진행중', finished: '종료' };
  const STATUS_STYLE = {
    waiting: 'bg-gray-700 text-gray-200',
    playing: 'bg-green-700 text-green-100',
    finished: 'bg-red-800 text-red-100',
  };

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

  const AWARD_CARDS = [
    {
      key: 'first',
      title: '🥇 1등상',
      data: awardsData?.first,
      extra: (d) => `${d.score.toLocaleString()}점`,
    },
    {
      key: 'middle',
      title: '🎯 뉴평상 (평균상)',
      data: awardsData?.middle,
      extra: (d) => `${d.score.toLocaleString()}점`,
    },
    {
      key: 'thirtyFirst',
      title: '📅 5/31 상',
      data: awardsData?.thirtyFirst,
      extra: (d) => d ? `${d.score.toLocaleString()}점` : null,
      empty: '해당 없음 (31명 미만)',
    },
    {
      key: 'fastestResponder',
      title: '⚡ 마음만 빨라상',
      data: awardsData?.fastestResponder,
      extra: (d) => d ? `평균 ${d.avgResponseMs}ms` : null,
      empty: '해당 없음',
    },
    {
      key: 'chattiest',
      title: '💬 말이 왜케 많아상',
      data: awardsData?.chattiest,
      extra: (d) => `${d.chatCount}개 메시지`,
    },
  ];

  // ── 관리자 패널 ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">🎛 진행자 패널</h1>

      {error && (
        <div className="mb-4 bg-red-900/50 border border-red-600 rounded-xl px-4 py-3 text-red-300 text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400">✕</button>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('control')}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition-colors ${
            activeTab === 'control' ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          🎛 컨트롤
        </button>
        <button
          onClick={() => { setActiveTab('awards'); refreshRooms(); }}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition-colors ${
            activeTab === 'awards' ? 'bg-yellow-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          🏆 시상
        </button>
        <button
          onClick={() => { setActiveTab('monitor'); refreshRooms(); }}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition-colors ${
            activeTab === 'monitor' ? 'bg-cyan-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          🖥 모니터링
        </button>
      </div>

      {/* ── 컨트롤 탭 ──────────────────────────────────────── */}
      {activeTab === 'control' && (
        <>
          {roundEndLeaderboard && (
            <div className="mb-4 bg-yellow-900/50 border border-yellow-600 rounded-xl px-4 py-3">
              <p className="text-yellow-300 font-bold text-sm mb-2">
                {allRoundsDone ? '🏁 모든 라운드 완료' : '📊 라운드 종료 — 순위표'}
              </p>
              <div className="space-y-1 mb-3">
                {roundEndLeaderboard.slice(0, 5).map((p) => (
                  <div key={p.rank} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 w-5">{p.rank}</span>
                    <span className="text-white flex-1">{p.name}</span>
                    <span className="text-yellow-400 font-mono">{p.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {allRoundsDone ? (
                <button
                  onClick={() => { if (confirm('게임을 종료하고 시상을 준비하시겠습니까?')) emit(SOCKET_EVENTS.ADMIN_END_GAME); }}
                  className="w-full py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-sm transition-colors"
                >
                  🏆 게임 종료 & 시상 준비
                </button>
              ) : (
                <button
                  onClick={() => emit(SOCKET_EVENTS.ADMIN_NEXT_ROUND)}
                  className="w-full py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-sm transition-colors"
                >
                  🔄 다음 라운드 시작
                </button>
              )}
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
              <button
                onClick={handleLoadPractice}
                disabled={!roomCode}
                className="w-full py-3 rounded-xl bg-orange-700 hover:bg-orange-600 font-bold transition-colors disabled:opacity-40"
              >
                🎯 연습 게임 불러오기
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
        </>
      )}

      {/* ── 시상 탭 ────────────────────────────────────────── */}
      {activeTab === 'awards' && (
        <div className="space-y-4">
          {/* 종료된 방 선택 (모니터링처럼 목록에서 클릭) */}
          <div className="bg-gray-900 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-300 font-semibold text-sm">🏁 종료된 방 선택 (연습 게임 포함)</p>
              <button
                onClick={refreshRooms}
                className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 font-bold text-xs transition-colors"
              >
                🔄 새로고침
              </button>
            </div>
            {(() => {
              const finished = roomsList.filter((r) => r.status === 'finished' || r.hasAwards);
              if (finished.length === 0) {
                return (
                  <p className="text-gray-500 text-sm">
                    종료된 방이 없습니다. 게임을 종료하면 여기에 표시됩니다.
                  </p>
                );
              }
              return (
                <div className="flex flex-wrap gap-2">
                  {finished.map((r) => (
                    <button
                      key={r.roomCode}
                      onClick={() => selectAwardsRoom(r.roomCode)}
                      className={`px-4 py-2 rounded-lg font-mono font-bold text-sm transition-colors ${
                        awardsRoom === r.roomCode ? 'bg-yellow-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                      }`}
                    >
                      {r.roomCode}
                      <span className="ml-2 text-xs font-sans font-normal opacity-80">{r.playerCount}명</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleLoadAwards}
              disabled={!awardsRoom}
              className="flex-1 py-3 rounded-xl bg-yellow-700 hover:bg-yellow-600 font-bold transition-colors disabled:opacity-40"
            >
              🏆 시상 데이터 불러오기{awardsRoom ? ` (${awardsRoom})` : ''}
            </button>
            <button
              onClick={() => showAwardOnDisplay({ type: 'clear' })}
              disabled={!awardsRoom}
              className="px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold text-sm transition-colors disabled:opacity-40"
              title="Display 를 순위표/대기화면으로"
            >
              📺 대기화면
            </button>
          </div>

          {!awardsData && (
            <p className="text-center text-gray-500 text-sm">종료된 방을 선택하고 시상 데이터를 불러오세요.</p>
          )}

          {awardsData && (
            <>
              {/* 개인 시상 카드 */}
              {AWARD_CARDS.map(({ key, title, data, extra, empty }) => (
                <div key={key} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-yellow-400 font-bold text-sm">{title}</p>
                    {revealedAwards[key] ? (
                      data ? (
                        <>
                          <p className="text-white text-xl font-black mt-1 truncate">
                            {data.name}
                            <span className="text-gray-400 text-sm font-normal ml-2">({data.className})</span>
                          </p>
                          {extra && <p className="text-purple-300 text-sm">{extra(data)}</p>}
                        </>
                      ) : (
                        <p className="text-gray-500 text-sm mt-1">{empty || '해당 없음'}</p>
                      )
                    ) : (
                      <p className="text-gray-600 text-2xl font-black mt-1">???</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-2">
                    {!revealedAwards[key] && (
                      <button
                        onClick={() => revealAward(key)}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-bold text-sm transition-colors"
                      >
                        공개
                      </button>
                    )}
                    {data && (
                      <button
                        onClick={() => {
                          revealAward(key);
                          showAwardOnDisplay({ type: 'category', title, name: data.name, className: data.className, detail: extra ? extra(data) : '' });
                        }}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold text-sm transition-colors"
                      >
                        📺 표시
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* 슬롯머신 랜덤 수상 */}
              <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
                <p className="text-yellow-400 font-bold text-sm">🎰 랜덤 수상</p>
                <div className="bg-gray-800 rounded-xl py-6 flex items-center justify-center min-h-[100px]">
                  {slotWinner ? (
                    <div className="text-center">
                      <p className="text-white text-4xl font-black">{slotWinner.name}</p>
                      <p className="text-gray-400 text-sm mt-1">{slotWinner.className}</p>
                    </div>
                  ) : (
                    <p className={`text-4xl font-black font-mono ${slotMachineRunning ? 'text-yellow-300' : 'text-gray-600'}`}>
                      {slotDisplay}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={startSlotMachine}
                    disabled={slotMachineRunning || !awardsData.randomPool?.length}
                    className="flex-1 py-3 rounded-lg bg-green-700 hover:bg-green-600 font-bold transition-colors disabled:opacity-40"
                  >
                    ▶ 시작
                  </button>
                  <button
                    onClick={stopSlotMachine}
                    disabled={!slotMachineRunning}
                    className="flex-1 py-3 rounded-lg bg-red-700 hover:bg-red-600 font-bold transition-colors disabled:opacity-40"
                  >
                    ■ 멈추기
                  </button>
                  <button
                    onClick={() => slotWinner && showAwardOnDisplay({ type: 'slot', title: '🎰 랜덤 수상', name: slotWinner.name, className: slotWinner.className })}
                    disabled={!slotWinner}
                    className="flex-1 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 font-bold transition-colors disabled:opacity-40"
                  >
                    📺 표시
                  </button>
                </div>
              </div>

              {/* 반별 순위 */}
              <div className="bg-gray-900 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-300 font-semibold text-sm">📊 반별 순위 (평균 점수 기준)</p>
                  {awardsData.classLeaderboard?.length > 0 && (
                    <button
                      onClick={() => showAwardOnDisplay({
                        type: 'classLeaderboard',
                        title: '📊 반별 순위',
                        classLeaderboard: awardsData.classLeaderboard,
                      })}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold text-sm transition-colors"
                    >
                      📺 송출
                    </button>
                  )}
                </div>
                {awardsData.classLeaderboard?.length > 0 ? (
                  <div className="space-y-2">
                    {awardsData.classLeaderboard.map((cls, i) => (
                      <div key={cls.className} className="flex items-center gap-3 text-sm">
                        <span className="text-gray-400 w-6 font-bold">{i + 1}</span>
                        <span className="text-white flex-1 font-medium">{cls.className}</span>
                        <span className="text-gray-500 text-xs">{cls.count}명</span>
                        <span className="text-yellow-400 font-mono font-bold">{cls.avg.toLocaleString()}점</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">참가자 없음</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 모니터링 탭 ────────────────────────────────────── */}
      {activeTab === 'monitor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm">
              실행 중인 방 <span className="font-bold text-white">{roomsList.length}</span>개
              <span className="text-gray-500 ml-2 text-xs">(서버 메모리 기준)</span>
            </p>
            <button
              onClick={refreshRooms}
              className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 font-bold text-sm transition-colors"
            >
              🔄 새로고침
            </button>
          </div>

          <p className="text-gray-500 text-xs">
            진행자 창을 종료 버튼 없이 닫아 남겨진 방을 여기서 강제 종료할 수 있습니다.
            강제 종료 시 남은 참가자는 모두 퇴장됩니다.
          </p>

          {roomsList.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">실행 중인 방이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {roomsList.map((r) => (
                <div key={r.roomCode} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
                  <span className="text-2xl font-mono font-bold tracking-widest text-white">{r.roomCode}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_STYLE[r.status] || 'bg-gray-700'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  <span className="text-sm text-gray-300">
                    👥 {r.onlineCount}/{r.playerCount}명
                  </span>
                  <span className="text-sm text-gray-400">
                    R{(r.currentRound ?? 0) + 1}/{r.totalRounds || 0}
                  </span>
                  <span className="text-xs text-gray-500">⏱ {formatAge(r.createdAt)} 경과</span>
                  <button
                    onClick={() => terminateRoom(r.roomCode)}
                    className="ml-auto px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 font-bold text-sm transition-colors"
                  >
                    ⏹ 강제 종료
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
