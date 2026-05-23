import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('[Socket] connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] disconnected:', reason);
});

socket.on('connect_error', (err) => {
  console.error('[Socket] connection error:', err.message);
});

export default socket;
