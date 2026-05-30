import { useState } from 'react';

// 장문 타이핑 — 원문은 프로젝터에만 표시. 폰에는 입력창만.
export default function LongTyping({ onSubmit, hasSubmitted, lastResult }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-4">
      <p className="text-center text-slate-600 text-sm">
        📺 화면의 말씀을 보고 <b>정확하게</b> 입력하세요
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted}
        rows={5}
        placeholder="여기에 입력하세요..."
        className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 text-lg leading-relaxed
                   placeholder:text-slate-400 focus:outline-none focus:border-blue-400 disabled:opacity-60 resize-none"
      />
      {hasSubmitted && lastResult?.accuracy != null && (
        <p className="text-center text-amber-600 text-sm">
          정확도: <span className="font-bold">{Math.round(lastResult.accuracy * 100)}%</span>
        </p>
      )}
      <button
        type="submit"
        disabled={hasSubmitted || !text.trim()}
        className="w-full py-4 rounded-2xl bg-blue-600 text-white text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : '제출하기'}
      </button>
    </form>
  );
}
