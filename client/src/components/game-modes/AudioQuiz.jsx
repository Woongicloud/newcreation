import { useState } from 'react';

// 오디오 퀴즈 — 음악은 프로젝터(Display)에서만 나온다. 폰에는 입력칸만.
export default function AudioQuiz({ question, onSubmit, hasSubmitted, correctAnswer, submittedAnswer }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-4">
      <div className="w-full py-5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-center">
        <p className="text-3xl">🎧</p>
        <p className="font-bold mt-1">화면에서 나오는 음악을 잘 들어보세요</p>
      </div>

      <input
        type="text"
        value={hasSubmitted && submittedAnswer != null ? submittedAnswer : text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted}
        placeholder="정답을 입력하세요"
        autoComplete="off"
        className="w-full px-4 py-4 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 text-xl
                   placeholder:text-slate-400 focus:outline-none focus:border-indigo-400
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
        className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : '제출하기'}
      </button>
    </form>
  );
}
