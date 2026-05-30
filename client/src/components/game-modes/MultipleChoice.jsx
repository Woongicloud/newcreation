import { useState } from 'react';
import { motion } from 'framer-motion';
import { CHOICE_HEX, CHOICE_LABELS, CORRECT_HEX, WRONG_HEX } from '../../lib/choiceColors.js';

export default function MultipleChoice({ question, onSubmit, hasSubmitted, correctAnswer, compact = false }) {
  const [selected, setSelected] = useState(null);

  const choices = question.choices || [];

  function handleSelect(choice, idx) {
    if (hasSubmitted) return;
    setSelected(idx);
    onSubmit(choice);
  }

  const revealed = hasSubmitted && correctAnswer != null;

  return (
    <div className="w-full px-2">
      <div className="grid grid-cols-2 gap-3">
        {choices.map((choice, idx) => {
          const isCorrect = revealed && choice === correctAnswer;
          const isWrongPick = revealed && selected === idx && !isCorrect;
          const isOtherDim = revealed && !isCorrect && !isWrongPick;
          const isSelected = !revealed && selected === idx;

          let bg = CHOICE_HEX[idx];
          if (isCorrect) bg = CORRECT_HEX;
          else if (isWrongPick) bg = WRONG_HEX;

          return (
            <motion.button
              key={idx}
              whileTap={!hasSubmitted ? { scale: 0.93 } : {}}
              onClick={() => handleSelect(choice, idx)}
              disabled={hasSubmitted}
              style={{ backgroundColor: bg, opacity: isOtherDim ? 0.45 : 1 }}
              className={`
                rounded-2xl text-slate-900 font-bold leading-tight border-2 border-black/5 shadow-md transition-all duration-200 touch-target
                ${compact ? 'min-h-[56px] px-3 py-2' : 'min-h-[80px] px-4 py-4'}
                ${isCorrect ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-white scale-105' : ''}
                ${isSelected ? 'ring-4 ring-purple-500 ring-offset-2 ring-offset-white scale-95' : ''}
              `}
            >
              <span className={`block mb-0.5 ${compact ? 'text-lg' : 'text-2xl'}`}>{CHOICE_LABELS[idx]}</span>
              <span className={compact ? 'block text-sm' : 'block text-base'}>{choice}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
