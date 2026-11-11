// 브라우저에 남기는 접속 정보. 참가자는 탭을 닫아도 이어서 하도록 localStorage,
// 관리자 토큰은 탭을 닫으면 사라지도록 sessionStorage.
const read = (store, key) => {
  try { return JSON.parse(store.getItem(key)); } catch { return null; }
};
const write = (store, key, value) => {
  if (value === null || value === undefined) store.removeItem(key);
  else store.setItem(key, JSON.stringify(value));
};

export const playerSession = {
  get: () => read(localStorage, 'nc.player'),          // { roomCode, token, name }
  set: (v) => write(localStorage, 'nc.player', v),
  clear: () => write(localStorage, 'nc.player', null),
};

export const adminSession = {
  get: () => read(sessionStorage, 'nc.admin'),         // { token, roomCode }
  set: (v) => write(sessionStorage, 'nc.admin', v),
  clear: () => write(sessionStorage, 'nc.admin', null),
};

export const appUrl = () => (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
