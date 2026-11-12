// 가상 참가자 부하 테스트.
//   npm run loadtest                 → 서버를 이 프로세스에 띄워 100명으로 한 판 진행
//   PLAYERS=150 npm run loadtest
//   TARGET=https://… ADMIN_PASSWORD=… npm run loadtest   → 떠 있는 서버를 대상으로
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';
import { EVENTS as E, COMMANDS as C, PHASES, ROLES, GAME_MODES } from '../../shared/protocol.js';

const PLAYERS = Number(process.env.PLAYERS || 100);
const password = process.env.ADMIN_PASSWORD || 'loadtest';
let target = process.env.TARGET;
let local = null;

if (!target) {
  process.env.ADMIN_PASSWORD = password;
  const { buildServer } = await import('../src/app.js');
  const { createMemoryPersistence } = await import('../src/persistence/memory.js');
  local = await buildServer({ persistence: createMemoryPersistence() });
  await new Promise((resolve) => local.httpServer.listen(0, resolve));
  target = `http://localhost:${local.httpServer.address().port}`;
}

const set = JSON.parse(readFileSync(new URL('../../sample_quiz_set_v2.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { ack: [], fanout: [] };
const pct = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);

function client(auth) {
  const socket = io(target, { auth, transports: ['websocket'], forceNew: true });
  socket.state = null;
  socket.on(E.ROOM_STATE, (s) => { socket.state = s; socket.stateAt = performance.now(); });
  socket.ask = async (event, payload = {}) => {
    const t = performance.now();
    const res = await socket.timeout(10000).emitWithAck(event, payload);
    stats.ack.push(performance.now() - t);
    return res;
  };
  return socket;
}

const login = await (await fetch(`${target}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
})).json();
if (!login.ok) throw new Error(`관리자 로그인 실패: ${login.message}`);

const admin = client({ token: login.token });
const { roomCode } = await admin.ask(E.ADMIN_CREATE_ROOM);
const loaded = await admin.ask(E.ADMIN_LOAD_SET, { roomCode, set });
if (!loaded.ok) throw new Error('세트 적용 실패');
const display = client();
await display.ask(E.ROOM_JOIN, { roomCode, role: ROLES.DISPLAY });

const units = set.teams.groups.flatMap((g) => g.units.map((u) => [g.name, u]));
const started = performance.now();
const players = await Promise.all(Array.from({ length: PLAYERS }, async (_, i) => {
  const socket = client();
  const [group, unit] = units[i % units.length];
  const res = await socket.ask(E.PLAYER_REGISTER, { roomCode, name: `참가자${i + 1}`, group, unit });
  if (!res.ok) throw new Error(`등록 실패: ${res.message}`);
  socket.state = res.state;
  return socket;
}));
console.log(`${PLAYERS}명 입장: ${Math.round(performance.now() - started)}ms`);

// 진행 명령을 보내고, 모든 참가자가 새 상태를 받을 때까지 걸린 시간을 잰다
async function advance(type = C.NEXT, args = {}) {
  const before = admin.state.step;
  const t = performance.now();
  const res = await admin.ask(E.HOST_COMMAND, { type, step: before, ...args });
  if (!res.ok) throw new Error(`${type}: ${res.message}`);
  for (let i = 0; i < 400; i++) {
    if (players.every((p) => p.state.step > before)) break;
    await sleep(5);
  }
  if (!players.every((p) => p.state.step > before)) throw new Error('일부 참가자가 상태를 받지 못했습니다');
  stats.fanout.push(Math.max(...players.map((p) => p.stateAt)) - t);
}

let questions = 0;
let chats = 0;
while (admin.state.phase !== PHASES.FINAL) {
  const s = admin.state;
  if (s.phase === PHASES.QUESTION_OPEN) {
    questions += 1;
    const mode = s.question.gameMode;
    if (mode === GAME_MODES.REACTION) {
      while (!players[0].state.reaction?.signaled) await sleep(20);
      await Promise.all(players.map((p) => p.ask(E.PLAYER_REACT, { clientMs: 150 + Math.random() * 400 })));
    } else {
      // 80% 정답, 20% 오답. 열 명에 한 명은 채팅도 보낸다
      await Promise.all(players.map(async (p, i) => {
        await sleep(Math.random() * 300);
        if (i % 10 === 0) { chats += 1; p.emit(E.CHAT_SEND, { message: `화이팅 ${i}` }); }
        return p.ask(E.PLAYER_ANSWER, { answer: Math.random() < 0.8 ? s.question.correctAnswer : '오답' });
      }));
    }
    for (let i = 0; i < 200 && admin.state.phase === PHASES.QUESTION_OPEN; i++) await sleep(5);
    await advance(C.REVEAL);
    await advance(C.SHOW_STANDINGS);
    await advance(C.HIDE_STANDINGS);
  } else {
    await advance();
  }
}
while (admin.state.next.action) await advance();

const scores = admin.state.players.map((p) => p.score);
console.log(`문제 ${questions}개, 채팅 ${chats}건, 요청 ${stats.ack.length}건`);
console.log(`요청 응답   p50 ${pct(stats.ack, 0.5).toFixed(1)}ms · p95 ${pct(stats.ack, 0.95).toFixed(1)}ms · 최대 ${Math.max(...stats.ack).toFixed(1)}ms`);
console.log(`상태 전파   p50 ${pct(stats.fanout, 0.5).toFixed(1)}ms · p95 ${pct(stats.fanout, 0.95).toFixed(1)}ms · 최대 ${Math.max(...stats.fanout).toFixed(1)}ms  (명령 → 전원 수신)`);
console.log(`점수 범위   ${Math.min(...scores)} ~ ${Math.max(...scores)}, 시상 ${admin.state.awardList.length}항목 완료`);
const health = await (await fetch(`${target}/api/health`)).json();
console.log(`저장소      ${health.storage} · database ${health.database}${health.databaseError ? ` (${health.databaseError})` : ''}`);
console.log(`서버 메모리 ${local ? `${Math.round(process.memoryUsage().rss / 1048576)}MB (테스트 클라이언트 포함)` : '(원격 대상)'}`);

// 테스트로 만든 방은 닫아 둔다 (떠 있는 서버를 대상으로 돌렸을 때 방이 남지 않게)
await admin.ask(E.ADMIN_CLOSE_ROOM, { roomCode });
for (const s of [admin, display, ...players]) s.close();
if (local) await local.close();
process.exit(0);
