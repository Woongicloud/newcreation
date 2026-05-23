import { SOCKET_EVENTS } from '../shared/constants.js';
import supabase from './supabase.js';

export function handleChat(roomCode, message, sender, io) {
  const top = Math.random() * 80 + 5;
  const duration = 5 + Math.random() * 4;
  const fontSize = 1.4 + Math.random() * 0.6;

  io.to(roomCode).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
    message,
    sender,
    position: { y: top },
    speed: duration,
    fontSize,
  });

  supabase.from('chat_logs').insert({ session_id: null, message: sender ? `${sender}: ${message}` : message }).then(({ error }) => {
    if (error) console.error('[chat] DB save error:', error.message);
  });
}
