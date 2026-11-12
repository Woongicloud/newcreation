// 서버 연결 하나와 방 상태 저장소. 모든 화면이 이것만 쓴다.
// 서버가 보내는 room:state 스냅샷을 그대로 들고 있고, 화면은 그것을 그리기만 한다.
import { io } from 'socket.io-client';
import { create } from 'zustand';
import { EVENTS, COMMANDS } from '@shared/protocol.js';

export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 6000;

const initial = {
  connected: false,
  state: null,        // 마지막 room:state
  clockOffset: 0,     // 서버 시각 - 기기 시각
  lastResult: null,   // 마지막 player:result
  resultNonce: 0,
  closed: false,      // 방이 닫힘
  rejoinFailed: null, // 재접속 실패 메시지
};

export const useRoom = create(() => ({ ...initial }));

let socket = null;
let joinParams = null; // 재접속 때 다시 보낼 입장 정보
const chatListeners = new Set();

function applyState(state) {
  useRoom.setState({ state, clockOffset: state.serverNow - Date.now(), closed: false, rejoinFailed: null });
}

function getSocket() {
  if (socket) return socket;
  socket = io(SERVER_URL, { autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });

  socket.on('connect', async () => {
    useRoom.setState({ connected: true });
    // 끊겼다 다시 붙으면 같은 방에 다시 들어간다 — 서버가 현재 상태를 한 번에 보내준다
    if (joinParams) {
      const res = await rawRequest(EVENTS.ROOM_JOIN, joinParams);
      if (res.ok) applyState(res.state);
      else if (res.error !== 'network') useRoom.setState({ rejoinFailed: res.message || '다시 접속하지 못했습니다.' });
    }
  });
  socket.on('disconnect', () => useRoom.setState({ connected: false }));
  socket.on(EVENTS.ROOM_STATE, applyState);
  socket.on(EVENTS.ROOM_PROGRESS, ({ submittedCount, onlineCount }) => {
    const { state } = useRoom.getState();
    if (state) useRoom.setState({ state: { ...state, submittedCount, onlineCount } });
  });
  socket.on(EVENTS.PLAYER_RESULT, (result) => {
    useRoom.setState((s) => ({ lastResult: result, resultNonce: s.resultNonce + 1 }));
  });
  socket.on(EVENTS.ROOM_CLOSED, () => {
    joinParams = null;
    useRoom.setState({ closed: true, state: null });
  });
  socket.on(EVENTS.CHAT_MESSAGE, (msg) => chatListeners.forEach((fn) => fn(msg)));
  return socket;
}

function rawRequest(event, payload = {}) {
  return getSocket().timeout(REQUEST_TIMEOUT_MS).emitWithAck(event, payload)
    .catch(() => ({ ok: false, error: 'network', message: '서버 응답이 없습니다. 연결을 확인해주세요.' }));
}

// 연결을 보장한 뒤 요청. 항상 { ok, ... } 를 돌려준다.
export function request(event, payload = {}) {
  const s = getSocket();
  if (!s.connected) s.connect();
  return rawRequest(event, payload);
}

// 관리자 토큰을 연결에 싣는다 (방에 들어가기 전에도 방 생성·목록 조회에 필요)
export function setAuthToken(token) {
  const s = getSocket();
  s.auth = token ? { token } : {};
  if (s.connected) s.disconnect();
  s.connect();
}

export async function joinRoom(params) {
  const res = await request(EVENTS.ROOM_JOIN, params);
  if (res.ok) {
    joinParams = params;
    applyState(res.state);
  }
  return res;
}

export async function registerPlayer({ roomCode, name, group, unit }) {
  const res = await request(EVENTS.PLAYER_REGISTER, { roomCode, name, group, unit });
  if (res.ok) {
    joinParams = { roomCode, token: res.token };
    applyState(res.state);
  }
  return res;
}

// 방 생성 직후처럼 서버가 이미 입장시켜 준 경우
export function adoptRoom(roomCode, state, role) {
  joinParams = { roomCode, role };
  applyState(state);
}

export function leaveRoom() {
  joinParams = null;
  useRoom.setState({ ...initial, connected: !!socket?.connected });
}

// 진행 명령. 마지막으로 받은 step 을 실어 중복 처리를 막는다.
export function command(type, args = {}) {
  const step = useRoom.getState().state?.step;
  return request(EVENTS.HOST_COMMAND, { type, step, ...args });
}

export function onChat(listener) {
  chatListeners.add(listener);
  return () => chatListeners.delete(listener);
}

export async function api(path, { method = 'GET', body, token } = {}) {
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data, ok: res.ok && data.ok !== false };
  } catch {
    return { ok: false, status: 0, message: '서버에 연결할 수 없습니다.' };
  }
}

export { EVENTS, COMMANDS };
