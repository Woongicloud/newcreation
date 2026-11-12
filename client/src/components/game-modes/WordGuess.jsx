import { useState } from 'react';

export default function WordGuess({ question, onSubmit, hasSubmitted, correctAnswer, submittedAnswer }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  // "사 _ 나 무" 형태로 표시
  const displayContent = question.content;

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-5">
      <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl py-6 px-4 text-center shadow-sm">
        <p className="text-3xl font-bold text-slate-800 tracking-widest leading-relaxed">
          {displayContent}
        </p>
      </div>

      <input
        type="text"
        value={hasSubmitted && submittedAnswer != null ? submittedAnswer : text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted}
        placeholder="빈칸의 단어를 맞춰보세요"
        autoComplete="off"
        className="w-full px-4 py-4 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 text-xl
                   placeholder:text-slate-400 focus:outline-none focus:border-teal-400
                   disabled:opacity-60 touch-target"
      />
      {hasSubmitted && correctAnswer && (
        <p className="text-center text-amber-600 text-sm">
          정답: <span className="font-bold">{correctAnswer}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={hasSubmitted || !text.trim()}
        className="w-full py-4 rounded-2xl bg-teal-600 text-white text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : '제출하기'}
      </button>
    </form>
  );
}
