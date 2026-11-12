import { useState, useEffect } from 'react';
import { onChat, useRoom } from '../../lib/connection.js';

const MAX_MESSAGES = 20;

// Display 위를 흐르는 채팅. 글자 크기·속도·투명도는 관리자 표시 설정을 따른다.
export default function ChatOverlay() {
  const [messages, setMessages] = useState([]);
  const settings = useRoom((s) => s.state?.settings);
  const scale = settings?.chatFontScale ?? 1;
  const speed = settings?.chatSpeed ?? 1;

  useEffect(() => onChat(({ id, message, sender, y }) => {
    // 메시지마다 크기·속도를 조금씩 달리해 겹쳐 보이지 않게 한다
    const duration = (6 + Math.random() * 3) / speed;
    const jitter = 0.9 + Math.random() * 0.25;
    setMessages((prev) => [...prev, { id, text: sender ? `${sender}: ${message}` : message, y, duration, jitter }].slice(-MAX_MESSAGES));
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), duration * 1000 + 300);
  }), [speed]);

  if (settings?.chatEnabled === false) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-40" style={{ opacity: settings?.chatOpacity ?? 1 }}>
      {messages.map((msg) => (
        <span
          key={msg.id}
          className="absolute whitespace-nowrap animate-slide-left bg-black/60 text-white rounded-full font-semibold"
          style={{
            top: `${msg.y}%`,
            fontSize: `${1.6 * scale * msg.jitter}vw`,
            padding: `${0.3 * scale}vw ${1 * scale}vw`,
            animationDuration: `${msg.duration}s`,
          }}
        >
          {msg.text}
        </span>
      ))}
    </div>
  );
}
