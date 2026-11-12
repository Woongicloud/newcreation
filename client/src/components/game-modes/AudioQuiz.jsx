import { useState, useRef } from 'react';

export default function AudioQuiz({ question, onSubmit, hasSubmitted, correctAnswer, submittedAnswer }) {
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef();

  function handlePlay() {
    if (!audioRef.current) return;
    audioRef.current.play().catch(() => {});
    setPlaying(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || hasSubmitted) return;
    onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-2 space-y-4">
      {question.audioUrl && (
        <>
          <audio ref={audioRef} src={question.audioUrl} preload="auto" className="hidden" />
          <button
            type="button"
            onClick={handlePlay}
            disabled={hasSubmitted}
            className="w-full py-6 rounded-2xl bg-indigo-700 hover:bg-indigo-600 text-white text-2xl font-bold
                       active:scale-95 transition-transform touch-target disabled:opacity-60"
          >
            {playing ? '🔊 재생 중...' : '▶ 음악 재생'}
          </button>
        </>
      )}

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
