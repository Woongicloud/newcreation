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
  // 시작할 때 DB 가 안 되더라도 서버는 뜬다 — 죽어 버리면 원인을 볼 방법이 로그뿐이다.
  // 상태는 /api/health 의 database 로 확인한다.
  let restored = 0;
  try {
    restored = await registry.restore();
  } catch (e) {
    registry.databaseError = e.message;
    console.error(`[db] 저장된 방을 불러오지 못했습니다: ${e.message}`);
    console.error('[db] supabase/schema.sql 적용 여부, SUPABASE_URL, SUPABASE_SERVICE_KEY(service_role 키), 프로젝트 일시정지 여부를 확인하세요.');
  }

  return {
    app, io, httpServer, registry, restored,
    async close() {
      await registry.flush();
      registry.dispose();
      await io.close();
    },
  };
}
