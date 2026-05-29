import { useState, useRef } from 'react';

export default function ShortAnswer({ onSubmit, hasSubmitted, correctAnswer }) {
  const [text, setText] = useState('');
  const inputRef = useRef();

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-4">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted}
        placeholder="정답을 입력하세요"
        autoComplete="off"
        className="w-full px-4 py-4 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 text-xl
                   placeholder:text-slate-400 focus:outline-none focus:border-purple-400
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
        className="w-full py-4 rounded-2xl bg-purple-600 text-white text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : '제출하기'}
      </button>
    </form>
  );
}
