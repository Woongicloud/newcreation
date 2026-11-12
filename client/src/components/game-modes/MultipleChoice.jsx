import { useState } from 'react';
import { motion } from 'framer-motion';
import { CHOICE_HEX, CHOICE_LABELS, CORRECT_HEX, WRONG_HEX } from '../../lib/choiceColors.js';

export default function MultipleChoice({ question, onSubmit, hasSubmitted, correctAnswer, submittedAnswer, compact = false }) {
  const choices = question.choices || [];
  // 새로고침해도 고른 보기가 눌린 채로 남도록 서버가 준 내 답에서 시작한다
  const [selected, setSelected] = useState(() => {
    const i = choices.findIndex((c) => c === submittedAnswer);
    return i >= 0 ? i : null;
  });

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
          const isSelected = !revealed && selected === idx;
          // 공개 전: 고른 보기만 눌린 채 고정, 나머지는 흐리게. 공개 후: 정답·내 오답만 남긴다
          const isOtherDim = revealed ? (!isCorrect && !isWrongPick) : (hasSubmitted && !isSelected);

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
                ${isSelected ? 'ring-4 ring-purple-500 ring-offset-2 ring-offset-white scale-95 brightness-95' : ''}
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
