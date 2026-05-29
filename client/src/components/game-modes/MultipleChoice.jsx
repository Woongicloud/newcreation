import { useState } from 'react';
import { motion } from 'framer-motion';

const COLORS = [
  { bg: 'bg-red-600 active:bg-red-700', label: '①' },
  { bg: 'bg-blue-600 active:bg-blue-700', label: '②' },
  { bg: 'bg-yellow-500 active:bg-yellow-600', label: '③' },
  { bg: 'bg-green-600 active:bg-green-700', label: '④' },
];

export default function MultipleChoice({ question, onSubmit, hasSubmitted, correctAnswer }) {
  const [selected, setSelected] = useState(null);

  const choices = question.choices || [];

  function handleSelect(choice, idx) {
    if (hasSubmitted) return;
    setSelected(idx);
    onSubmit(choice);
  }

  function getButtonState(idx, choiceText) {
    if (!hasSubmitted || correctAnswer === undefined) {
      return selected === idx ? 'selected' : 'idle';
    }
    if (choiceText === correctAnswer) return 'correct';
    if (selected === idx) return 'wrong';
    return 'dim';
  }

  const stateClass = {
    idle: '',
    selected: 'ring-4 ring-purple-500 ring-offset-2 ring-offset-white scale-95',
    correct: 'bg-green-500',
    wrong: 'bg-gray-600 opacity-60',
    dim: 'opacity-40',
  };

  return (
    <div className="w-full px-2">
      <div className="grid grid-cols-2 gap-3">
        {choices.map((choice, idx) => {
          const state = getButtonState(idx, choice);
          return (
            <motion.button
              key={idx}
              whileTap={!hasSubmitted ? { scale: 0.93 } : {}}
              onClick={() => handleSelect(choice, idx)}
              disabled={hasSubmitted}
              className={`
                min-h-[80px] rounded-2xl text-white font-bold text-lg leading-tight px-4 py-4
                shadow-md transition-all duration-200 touch-target
                ${COLORS[idx].bg} ${stateClass[state]}
              `}
            >
              <span className="block text-2xl mb-1">{COLORS[idx].label}</span>
              <span className="block text-base">{choice}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
