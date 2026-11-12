import { useState } from 'react';
import { request, EVENTS, useRoom } from '../../lib/connection.js';

export default function ChatInput() {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = useRoom((s) => s.state?.settings?.chatEnabled !== false);

  async function handleSubmit(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText('');
    const res = await request(EVENTS.CHAT_SEND, { message });
    if (!res.ok) {
      setNotice(res.message || '보내지 못했습니다.');
      setTimeout(() => setNotice(''), 1500);
    }
  }

  if (!enabled) return null;
  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-3 py-2 bg-white/70 backdrop-blur border-t border-slate-200">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={notice || '채팅 입력...'}
        maxLength={60}
        className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm placeholder:text-slate-400
                   focus:outline-none focus:border-purple-400 min-h-[40px]"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold
                   active:scale-95 transition-transform disabled:opacity-40 min-h-[40px]"
      >
        전송
      </button>
    </form>
  );
}
