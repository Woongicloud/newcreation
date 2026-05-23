import { useState } from 'react';
import socket from '../../lib/socket.js';
import useGameStore from '../../store/gameStore.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

export default function ChatInput() {
  const [text, setText] = useState('');
  const { player } = useGameStore();

  function handleSubmit(e) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    socket.emit(SOCKET_EVENTS.CHAT_SEND, {
      message: msg,
      sender: player?.name || '',
    });
    setText('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-3 py-2 bg-black/40 border-t border-white/10">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="채팅 입력..."
        maxLength={40}
        className="flex-1 px-3 py-2 rounded-xl bg-white/10 text-white text-sm placeholder:text-gray-500
                   focus:outline-none focus:bg-white/15 min-h-[40px]"
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
