// 서버 조립 — 테스트에서도 같은 구성을 띄울 수 있게 listen 과 분리한다.
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomRegistry } from './rooms/registry.js';
import { createApp } from './http.js';
import { attachSockets } from './sockets.js';

export async function buildServer({ persistence, clientUrl = process.env.CLIENT_URL } = {}) {
  const allowedOrigins = [(clientUrl || '').replace(/\/$/, ''), 'http://localhost:5173'].filter(Boolean);
  const registry = new RoomRegistry(persistence);
  const app = createApp({ registry, allowedOrigins });
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });
  attachSockets(io, registry);
  const restored = await registry.restore();

  return {
    app, io, httpServer, registry, restored,
    async close() {
      await registry.flush();
      registry.dispose();
      await io.close();
    },
  };
}
