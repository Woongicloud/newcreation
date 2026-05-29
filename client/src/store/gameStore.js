import { create } from 'zustand';

const useGameStore = create((set) => ({
  // 플레이어 정보
  player: null,        // { id, name, className, score }
  roomCode: '',

  // 세션 정보
  session: null,       // { status, currentRound, currentQuestion }
  players: [],         // 전체 참가자 목록

  // 현재 문제
  currentQuestion: null,
  timeRemaining: 0,
  hasSubmitted: false,
  lastResult: null,    // { isCorrect, scoreDelta }

  // 라운드 결과
  leaderboard: [],

  setPlayer: (player) => set({ player }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setSession: (session) => set({ session }),
  setPlayers: (players) => set({ players }),
  setCurrentQuestion: (currentQuestion) => set({ currentQuestion, hasSubmitted: false, lastResult: null }),
  setTimeRemaining: (timeRemaining) => set({ timeRemaining }),
  setHasSubmitted: (val = true) => set({ hasSubmitted: val }),
  setLastResult: (lastResult) => set({ lastResult }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  updatePlayerScore: (playerId, score) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === playerId ? { ...p, score } : p)),
      player: state.player?.id === playerId ? { ...state.player, score } : state.player,
    })),
  reset: () =>
    set({
      player: null,
      roomCode: '',
      session: null,
      players: [],
      currentQuestion: null,
      timeRemaining: 0,
      hasSubmitted: false,
      lastResult: null,
      leaderboard: [],
    }),
}));

export default useGameStore;
