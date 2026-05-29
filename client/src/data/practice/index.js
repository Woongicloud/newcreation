import mc from './multiple_choice.json';
import sa from './short_answer.json';
import co from './consonant.json';
import wg from './word_guess.json';
import iq from './image_quiz.json';
import rg from './reaction.json';

export const PRACTICE_SETS = { mc, sa, co, wg, iq, rg };

export const ALL_PRACTICE = {
  rounds: [
    ...mc.rounds,
    ...sa.rounds,
    ...co.rounds,
    ...wg.rounds,
    ...iq.rounds,
    ...rg.rounds,
  ],
};
