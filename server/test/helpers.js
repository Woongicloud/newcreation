import { readFileSync } from 'node:fs';
import { validateQuizSet } from '../../shared/quizSchema.js';
import { Room } from '../src/rooms/room.js';

export const mc = (correct = 'a', extra = {}) => ({ content: 'Q', choices: ['a', 'b', 'c', 'd'], correctAnswer: correct, timeLimit: 10, ...extra });

export function makeSet(overrides = {}) {
  const raw = {
    sessionName: '테스트',
    scoring: { points: 100, penalty: 50 },
    teams: { groups: [{ name: '중1', units: ['A', 'B'] }, { name: '중2', units: ['A'] }] },
    rounds: [
      { theme: 'R1', gameMode: 'multiple_choice', questions: [mc(), mc(), mc(), mc()] },
      { theme: 'R2', gameMode: 'short_answer', standingsAfter: true, questions: [{ content: 'Q', correctAnswer: '방주', timeLimit: 10 }] },
    ],
    ...overrides,
  };
  const result = validateQuizSet(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.set;
}

export const sampleSet = () => {
  const raw = JSON.parse(readFileSync(new URL('../../sample_quiz_set_v2.json', import.meta.url), 'utf8'));
  return validateQuizSet(raw).set;
};

// 세트를 올리고 참가자를 입장시킨 방
export function makeRoom({ set = makeSet(), players = [['가', '중1', 'A'], ['나', '중1', 'B'], ['다', '중2', 'A']] } = {}) {
  const room = new Room({ roomCode: 'TEST01' });
  room.loadSet(set);
  const ids = players.map(([name, group, unit]) => {
    const { player } = room.register({ name, group, unit });
    room.setOnline(player.id, true);
    return player.id;
  });
  return { room, ids, p: (i) => room.players.get(ids[i]) };
}

export const cmd = (room, type, args = {}) => room.command(type, { step: room.step, ...args });
