// 실제 서버를 띄우고 소켓으로 붙어 보는 테스트 — 인증, 역할별 전송, 재시작 복구.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import { EVENTS as E, COMMANDS as C, PHASES, ROLES, ERRORS } from '../../shared/protocol.js';
import { buildServer } from '../src/app.js';
import { createMemoryPersistence } from '../src/persistence/memory.js';
import { signToken, verifyToken } from '../src/auth.js';

process.env.ADMIN_PASSWORD = 'test-password';

const rawSet = JSON.parse(readFileSync(new URL('../../sample_quiz_set_v2.json', import.meta.url), 'utf8'));
const persistence = createMemoryPersistence();
let server;
let url;
const sockets = [];

async function start() {
  server = await buildServer({ persistence });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${server.httpServer.address().port}`;
}

function client(auth) {
  const socket = connect(url, { auth, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  socket.states = [];
  socket.on(E.ROOM_STATE, (s) => socket.states.push(s));
  socket.last = () => socket.states.at(-1);
  socket.ask = (event, payload = {}) => socket.timeout(2000).emitWithAck(event, payload);
  return socket;
}

// 조건을 만족하는 상태가 올 때까지 기다린다
function until(socket, predicate) {
  return new Promise((resolve, reject) => {
    const hit = socket.states.find(predicate);
    if (hit) return resolve(hit);
    const timer = setTimeout(() => reject(new Error('상태를 기다리다 시간 초과')), 2000);
    const handler = (s) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      socket.off(E.ROOM_STATE, handler);
      resolve(s);
    };
    socket.on(E.ROOM_STATE, handler);
  });
}

const api = (path, init) => fetch(`${url}${path}`, init).then(async (r) => ({ status: r.status, body: await r.json() }));
const login = (password) => api('/api/admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
});

beforeAll(start);
afterEach(() => { while (sockets.length) sockets.pop().close(); });
afterAll(() => server.close());

describe('인증', () => {
  it('비밀번호는 서버에서만 확인하고 토큰을 발급한다', async () => {
    expect((await login('wrong')).status).toBe(401);
    const { status, body } = await login('test-password');
    expect(status).toBe(200);
    expect(verifyToken(body.token)).toMatchObject({ role: ROLES.ADMIN });
  });

  it('변조되거나 만료된 토큰은 거부한다', () => {
    const token = signToken({ role: ROLES.HOST, room: 'AAAAAA' });
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ role: ROLES.ADMIN, exp: Date.now() + 1e6 })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyToken(`${body}.${sig}x`)).toBeNull();
    expect(verifyToken(signToken({ role: ROLES.HOST }, -1))).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
  });

  it('토큰 없이는 관리자 명령과 진행 명령을 쓸 수 없다', async () => {
    const anon = client();
    expect(await anon.ask(E.ADMIN_CREATE_ROOM)).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });
    expect(await anon.ask(E.ADMIN_LIST_ROOMS)).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });
    expect(await anon.ask(E.HOST_COMMAND, { type: C.NEXT })).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });
    expect((await api('/api/media')).status).toBe(401);
  });
});

describe('한 판 진행', () => {
  it('관리자·진행자·Display·참가자가 각자 맞는 상태를 받는다', async () => {
    const adminToken = (await login('test-password')).body.token;
    const admin = client({ token: adminToken });
    const { roomCode } = await admin.ask(E.ADMIN_CREATE_ROOM);
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

    // 세트를 올리기 전에는 입장할 수 없다
    const early = client();
    expect((await early.ask(E.PLAYER_REGISTER, { roomCode, name: '가', group: '중1', unit: '브릿지 A' })).ok).toBe(false);
    expect((await api(`/api/rooms/${roomCode}/public`)).body).toMatchObject({ ready: false, teams: null });

    const bad = await admin.ask(E.ADMIN_LOAD_SET, { roomCode, set: { rounds: [{ gameMode: 'x', questions: [] }] } });
    expect(bad).toMatchObject({ ok: false, errors: [{ path: 'rounds[0].gameMode' }] });
    const loaded = await admin.ask(E.ADMIN_LOAD_SET, { roomCode, set: rawSet });
    expect(loaded).toMatchObject({ ok: true, summary: { rounds: 3, questions: 7, groups: 3 } });

    // 등록 화면은 HTTP 로 학년·브릿지 목록을 받는다
    const pub = (await api(`/api/rooms/${roomCode.toLowerCase()}/public`)).body;
    expect(pub).toMatchObject({ ready: true, teams: { labels: { group: '학년', unit: '브릿지' } } });
    expect(pub.teams.groups[0]).toEqual({ name: '중1', units: ['브릿지 A', '브릿지 B'] });

    const display = client();
    expect(await display.ask(E.ROOM_JOIN, { roomCode, role: ROLES.DISPLAY })).toMatchObject({ ok: true, role: ROLES.DISPLAY });
    expect(await display.ask(E.ROOM_JOIN, { roomCode, role: ROLES.HOST })).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });

    const hostLink = await admin.ask(E.ADMIN_HOST_TOKEN, { roomCode });
    const host = client();
    expect(await host.ask(E.ROOM_JOIN, { roomCode, token: hostLink.token })).toMatchObject({ ok: true, role: ROLES.HOST });
    // 진행자 토큰은 그 방에서만 통하고, 관리자 권한은 없다
    expect(await host.ask(E.ADMIN_SETTINGS, { roomCode, patch: { chatFontScale: 2 } })).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });
    const other = await admin.ask(E.ADMIN_CREATE_ROOM);
    expect(await client().ask(E.ROOM_JOIN, { roomCode: other.roomCode, token: hostLink.token })).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });
    await admin.ask(E.ADMIN_CLOSE_ROOM, { roomCode: other.roomCode });
    expect((await admin.ask(E.ROOM_JOIN, { roomCode, role: ROLES.ADMIN })).ok).toBe(true);

    const p1 = client();
    const p2 = client();
    const r1 = await p1.ask(E.PLAYER_REGISTER, { roomCode, name: '김하늘', group: '중1', unit: '브릿지 A' });
    const r2 = await p2.ask(E.PLAYER_REGISTER, { roomCode, name: '이바다', group: '중2', unit: '브릿지 B' });
    expect(r1).toMatchObject({ ok: true, state: { role: ROLES.PLAYER, phase: PHASES.LOBBY, me: { name: '김하늘', score: 0 } } });
    expect((await client().ask(E.PLAYER_REGISTER, { roomCode, name: '박', group: '중1', unit: '없는 브릿지' })).ok).toBe(false);
    const lobby = await until(display, (s) => s.lobby?.length === 2);
    expect(lobby.lobby.map((p) => p.name)).toEqual(['김하늘', '이바다']);

    // 참가자는 진행 명령을 쓸 수 없다
    expect(await p1.ask(E.HOST_COMMAND, { type: C.NEXT })).toMatchObject({ ok: false, error: ERRORS.FORBIDDEN });

    // 진행자 폰으로 시작
    expect((await host.ask(E.HOST_COMMAND, { type: C.NEXT, step: host.last().step })).ok).toBe(true);
    const intro = await until(host, (s) => s.phase === PHASES.ROUND_INTRO);
    expect(intro.next).toMatchObject({ action: 'open_question', correctAnswer: '창세기' });
    expect(intro.outline).toHaveLength(3);

    // 관리자 PC 와 진행자 폰이 같은 순간에 누르면 한 번만 처리된다
    const [a, b] = await Promise.all([
      host.ask(E.HOST_COMMAND, { type: C.NEXT, step: intro.step }),
      admin.ask(E.HOST_COMMAND, { type: C.NEXT, step: intro.step }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a.error, b.error]).toContain(ERRORS.STALE);

    const open = await until(p1, (s) => s.phase === PHASES.QUESTION_OPEN);
    expect(open.position).toMatchObject({ round: 0, question: 0, questionCount: 4 });
    expect(open.question).toMatchObject({ content: '성경에서 가장 먼저 나오는 책은?', points: 100, penalty: 50 });
    expect(open.question.correctAnswer).toBeUndefined();
    expect(open.timer.deadlineAt).toBeGreaterThan(open.serverNow);
    expect(open.outline).toBeUndefined();
    expect((await until(host, (s) => s.phase === PHASES.QUESTION_OPEN)).question.correctAnswer).toBe('창세기');

    const results = [];
    p1.on(E.PLAYER_RESULT, (r) => results.push(r));
    expect(await p1.ask(E.PLAYER_ANSWER, { answer: '창세기' })).toMatchObject({ ok: true, isCorrect: true, delta: 100, score: 100 });
    expect(await p2.ask(E.PLAYER_ANSWER, { answer: '시편' })).toMatchObject({ ok: true, isCorrect: false, delta: -50 });
    expect(results).toEqual([expect.objectContaining({ isCorrect: true, delta: 100 })]);

    // 모두 제출 → 마감. 정답은 진행자가 공개할 때 나간다
    const closed = await until(display, (s) => s.phase === PHASES.QUESTION_CLOSED);
    expect(closed).toMatchObject({ submittedCount: 2, stats: null });
    expect(closed.question.correctAnswer).toBeUndefined();
    await host.ask(E.HOST_COMMAND, { type: C.NEXT, step: closed.step });
    const reveal = await until(display, (s) => s.phase === PHASES.QUESTION_REVEAL);
    expect(reveal.question.correctAnswer).toBe('창세기');
    expect(reveal.stats).toMatchObject({ answered: 2, correct: 1, choiceCounts: [1, 0, 1, 0] });
    expect((await until(p2, (s) => s.phase === PHASES.QUESTION_REVEAL)).me).toMatchObject({ score: -50, rank: 2, result: { isCorrect: false, delta: -50 } });

    // 집계 송출
    await host.ask(E.HOST_COMMAND, { type: C.SHOW_STANDINGS, step: reveal.step });
    const standings = await until(display, (s) => s.standings);
    expect(standings.standings.entries).toEqual([
      { rank: 1, group: '중1', unit: '브릿지 A', name: '김하늘', score: 100 },
      { rank: 2, group: '중2', unit: '브릿지 B', name: '이바다', score: -50 },
    ]);

    // 표시 설정은 관리자만, 바꾸면 Display 에 바로 간다
    expect(await admin.ask(E.ADMIN_SETTINGS, { roomCode, patch: { chatFontScale: 9, theme: 'pastel' } }))
      .toMatchObject({ ok: true, settings: { chatFontScale: 3, theme: 'pastel' } });
    await until(display, (s) => s.settings.theme === 'pastel');

    // 채팅
    const chats = [];
    display.on(E.CHAT_MESSAGE, (m) => chats.push(m));
    expect((await p1.ask(E.CHAT_SEND, { message: '  화이팅  ' })).ok).toBe(true);
    expect((await p1.ask(E.CHAT_SEND, { message: '도배' })).ok).toBe(false); // 너무 빠름
    expect((await display.ask(E.CHAT_SEND, { message: 'x' })).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(chats).toEqual([expect.objectContaining({ message: '화이팅', sender: '김하늘' })]);
    expect(persistence.chats).toEqual([expect.objectContaining({ message: '화이팅', playerId: r1.playerId })]);

    // 관리자 화면에는 참가자 전체 목록이 온다
    expect(admin.last().players.map((p) => [p.name, p.score, p.rank])).toEqual([['김하늘', 100, 1], ['이바다', -50, 2]]);
    expect(host.last().players).toBeUndefined();

    // ── 서버 재시작 ──
    const stepBefore = host.last().step;
    const playerToken = r1.token;
    await server.close();
    await start();
    expect(server.restored).toBe(1);

    const back = client();
    const rejoined = await back.ask(E.ROOM_JOIN, { roomCode, token: playerToken });
    expect(rejoined).toMatchObject({
      ok: true, role: ROLES.PLAYER,
      state: { phase: PHASES.QUESTION_REVEAL, step: stepBefore, me: { name: '김하늘', score: 100, result: { isCorrect: true } } },
    });
    const host2 = client();
    const hostState = (await host2.ask(E.ROOM_JOIN, { roomCode, token: hostLink.token })).state;
    expect(hostState.standings.entries).toHaveLength(2);
    expect(hostState.settings.theme).toBe('pastel');
    expect((await host2.ask(E.HOST_COMMAND, { type: C.NEXT, step: hostState.step })).ok).toBe(true);
    expect((await until(back, (s) => s.phase === PHASES.QUESTION_OPEN)).position.question).toBe(1);

    // 저장소에 점수 기록이 남아 있다
    const saved = [...persistence.sessions.values()].find((s) => s.roomCode === roomCode);
    expect(saved.events.map((e) => [e.isCorrect, e.raw, e.applied])).toEqual([[true, 100, 100], [false, -50, -50]]);
    expect([...saved.players.values()].map((p) => p.name).sort()).toEqual(['김하늘', '이바다']);
  });
});
