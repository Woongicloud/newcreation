import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import socket from '../../lib/socket.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

// 이모지 사람 찾기 — 내 세트/코드는 서버가 소켓별로 보내줌(GAME_EMOJI_ASSIGN).
// 같은 세트를 가진 다른 사람의 코드를 입력해 제출. 오답이면 재시도.
export default function EmojiFind({ onSubmitCode, hasSubmitted, wrongNonce }) {
  const [assign, setAssign] = useState(null); // { emojiSet, code }
  const [text, setText] = useState('');
  const [shake, setShake] = useState(false);
  const lastWrong = useRef(0);

  useEffect(() => {
    const onAssign = (data) => setAssign(data);
    socket.on(SOCKET_EVENTS.GAME_EMOJI_ASSIGN, onAssign);
    return () => socket.off(SOCKET_EVENTS.GAME_EMOJI_ASSIGN, onAssign);
  }, []);

  // 오답 신호(wrongNonce 증가) → 흔들림 + 입력 초기화
  useEffect(() => {
    if (wrongNonce && wrongNonce !== lastWrong.current) {
      lastWrong.current = wrongNonce;
      setShake(true);
      setText('');
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [wrongNonce]);

  function handleSubmit(e) {
    e.preventDefault();
    const code = text.trim();
    if (!code || hasSubmitted) return;
    onSubmitCode(code);
  }

  if (hasSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-3 py-8 text-center"
      >
        <div className="text-6xl">🎉</div>
        <p className="text-slate-800 text-2xl font-bold">찾았습니다!</p>
        <p className="text-slate-500 text-sm">결과를 기다리는 중...</p>
      </motion.div>
    );
  }

  return (
    <div className="w-full px-2 space-y-4">
      {/* 내 이모지 세트 + 코드 */}
      <div className="bg-white/85 rounded-2xl p-5 text-center shadow-sm border border-slate-200">
        <p className="text-slate-500 text-xs mb-2">내 이모지 세트</p>
        <div className="flex justify-center gap-3 text-5xl">
          {assign?.emojiSet?.length
            ? assign.emojiSet.map((e, i) => <span key={i}>{e}</span>)
            : <span className="text-slate-300 text-2xl">불러오는 중…</span>}
        </div>
        <p className="text-slate-500 text-xs mt-4">내 코드</p>
        <p className="text-purple-700 text-3xl font-black font-mono tracking-[0.3em]">
          {assign?.code || '-----'}
        </p>
      </div>

      <p className="text-center text-slate-600 text-sm leading-relaxed">
        같은 이모지 세트를 가진 사람을 찾아<br />
        그 사람의 <b className="text-purple-700">코드</b>를 입력하세요!
      </p>

      <motion.form
        onSubmit={handleSubmit}
        animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="space-y-3"
      >
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="상대방 5자리 코드"
          className="w-full px-4 py-4 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 text-2xl
                     text-center font-mono tracking-[0.3em] placeholder:text-slate-400 placeholder:text-base placeholder:tracking-normal
                     focus:outline-none focus:border-purple-400 touch-target"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="w-full py-4 rounded-2xl bg-purple-600 text-white text-xl font-bold
                     active:scale-95 transition-transform disabled:opacity-40 touch-target"
        >
          제출하기
        </button>
      </motion.form>
    </div>
  );
}
