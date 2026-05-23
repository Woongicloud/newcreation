import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../lib/socket.js';
import useGameStore from '../store/gameStore.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

export function useSocket() {
  const navigate = useNavigate();
  const {
    setPlayers,
    setCurrentQuestion,
    setTimeRemaining,
    setLastResult,
    setLeaderboard,
    updatePlayerScore,
    player,
  } = useGameStore();

  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onPlayerJoined = ({ players }) => setPlayers(players);

    const onQuestionStart = ({ question, timeLimit }) => {
      setCurrentQuestion({ ...question, timeLimit });
      setTimeRemaining(timeLimit);
      navigate('/game');
    };

    const onTimerTick = ({ remaining }) => setTimeRemaining(remaining);

    const onShowResult = ({ playerId, isCorrect, scoreDelta, newScore }) => {
      if (player && playerId === player.id) {
        setLastResult({ isCorrect, scoreDelta });
        updatePlayerScore(playerId, newScore);
      }
    };

    const onQuestionEnd = ({ correctAnswer, scores }) => {
      scores.forEach(({ playerId, newScore }) => updatePlayerScore(playerId, newScore));
    };

    const onRoundEnd = ({ leaderboard }) => setLeaderboard(leaderboard);

    socket.on(SOCKET_EVENTS.GAME_PLAYER_JOINED, onPlayerJoined);
    socket.on(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
    socket.on(SOCKET_EVENTS.GAME_TIMER_TICK, onTimerTick);
    socket.on(SOCKET_EVENTS.GAME_SHOW_RESULT, onShowResult);
    socket.on(SOCKET_EVENTS.GAME_QUESTION_END, onQuestionEnd);
    socket.on(SOCKET_EVENTS.GAME_ROUND_END, onRoundEnd);

    return () => {
      socket.off(SOCKET_EVENTS.GAME_PLAYER_JOINED, onPlayerJoined);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_START, onQuestionStart);
      socket.off(SOCKET_EVENTS.GAME_TIMER_TICK, onTimerTick);
      socket.off(SOCKET_EVENTS.GAME_SHOW_RESULT, onShowResult);
      socket.off(SOCKET_EVENTS.GAME_QUESTION_END, onQuestionEnd);
      socket.off(SOCKET_EVENTS.GAME_ROUND_END, onRoundEnd);
    };
  }, [player]);

  return socket;
}

export default useSocket;
