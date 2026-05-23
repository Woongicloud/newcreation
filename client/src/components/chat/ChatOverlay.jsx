import { useState, useEffect } from 'react';
import socket from '../../lib/socket.js';
import { SOCKET_EVENTS } from '@shared/constants.js';

const MAX_MESSAGES = 15;

export default function ChatOverlay() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const onMessage = ({ message, sender, position, speed, fontSize }) => {
      const id = Date.now() + Math.random();
      const top = position?.y ?? (Math.random() * 80 + 5);
      const duration = speed ?? (5 + Math.random() * 4);
      const size = fontSize ?? (1.4 + Math.random() * 0.6);
      const text = sender ? `${sender}: ${message}` : message;

      setMessages((prev) => {
        const next = [...prev, { id, text, top, duration, size }];
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
      });

      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, duration * 1000 + 200);
    };

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onMessage);
    return () => socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onMessage);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {messages.map((msg) => (
        <span
          key={msg.id}
          className="absolute whitespace-nowrap animate-slide-left
                     bg-black/60 text-white rounded-full px-4 py-1 font-semibold"
          style={{
            top: `${msg.top}%`,
            fontSize: `${msg.size}rem`,
            animationDuration: `${msg.duration}s`,
          }}
        >
          {msg.text}
        </span>
      ))}
    </div>
  );
}
