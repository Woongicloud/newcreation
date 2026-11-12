import { useState } from 'react';

// 장문 타이핑 — 원문은 프로젝터에만 표시. 폰에는 입력창만.
export default function LongTyping({ onSubmit, hasSubmitted, lastResult, timeExpired = false, submittedAnswer }) {
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);

  function handleRequestConfirm(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted || timeExpired) return;
    setConfirming(true);
  }

  function handleConfirm() {
    onSubmit(text.trim());
    setConfirming(false);
  }

  function handleEdit() {
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="w-full px-2 space-y-4">
        <p className="text-center text-slate-600 text-sm font-bold">📋 입력한 내용을 확인하세요</p>
        <div className="bg-white border-2 border-blue-300 rounded-2xl px-4 py-3 min-h-[120px] max-h-[200px] overflow-y-auto">
          <p className="text-slate-800 text-base leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleEdit}
            className="flex-1 py-4 rounded-2xl bg-slate-200 text-slate-700 text-lg font-bold
                       active:scale-95 transition-transform touch-target"
          >
            ✏️ 수정
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-4 rounded-2xl bg-blue-600 text-white text-lg font-bold
                       active:scale-95 transition-transform touch-target"
          >
            ✅ 최종 제출
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequestConfirm} className="w-full px-2 space-y-4">
      <p className="text-center text-slate-600 text-sm">
        📺 화면의 말씀을 보고 <b>정확하게</b> 입력하세요
      </p>
      <textarea
        value={hasSubmitted && submittedAnswer != null ? submittedAnswer : text}
        onChange={(e) => setText(e.target.value)}
        disabled={hasSubmitted || timeExpired}
        rows={5}
        placeholder={timeExpired ? '제한시간이 종료되었습니다' : '여기에 입력하세요...'}
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
        disabled={hasSubmitted || !text.trim() || timeExpired}
        className="w-full py-4 rounded-2xl bg-blue-600 text-white text-xl font-bold
                   active:scale-95 transition-transform disabled:opacity-40 touch-target"
      >
        {hasSubmitted ? '제출 완료 ✓' : timeExpired ? '시간 종료' : '제출하기'}
      </button>
    </form>
  );
}
