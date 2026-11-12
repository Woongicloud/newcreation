import { createPersistence } from './persistence/index.js';
import { buildServer } from './app.js';

// 처리하지 못한 오류로 행사 중에 서버가 내려가지 않게 한다
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.stack || e));

const persistence = await createPersistence();
const server = await buildServer({ persistence });
const PORT = process.env.PORT || 3001;

server.httpServer.listen(PORT, () => {
  console.log(`[v2] Server running on port ${PORT} (storage: ${persistence.kind}, restored rooms: ${server.restored})`);
});

// 배포 환경의 재시작 신호에서 마지막 상태를 저장하고 내려간다
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await server.close().catch((e) => console.error(e.message));
    process.exit(0);
  });
}
