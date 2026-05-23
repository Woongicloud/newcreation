import { useState } from 'react';

export default function ConsonantQuiz({ question, onSubmit, hasSubmitted, correctAnswer }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-5">
      {/* 초성 힌트 */}
      {question.consonantHint && (
        <div className="bg-white/10 rounded-2xl py-6 text-center">
          <p className="text-gray-400 text-sm mb-2">초성 힌트</p>
          <p className="text-5xl font-bold text-yellow-300 tracking-[0.3em]">
            {question.consonantHint}
          </p>
        </div>
      )}

      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted}
        placeholder="정답을 입력하세요"
        autoComplete="off"
        className="w-full px-4 py-4 rounded-2xl bg-white/10 border-2 border-white/20 text-white text-xl
                   placeholder:text-gray-500 focus:outline-none focus:border-yellow-400
                   disabled:opacity-60 touch-target"
      />
      {hasSubmitted && correctAnswer && (
        <p className="text-center text-yellow-300 text-sm">
          정답: <span className="font-bold">{correctAnswer}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={hasSubmitted || !text.trim()}
        className="w-full py-4 rounded-2xl bg-yellow-500 text-gray-900 text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : '제출하기'}
      </button>
    </form>
  );
}
