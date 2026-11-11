// v2 프로토콜 — 서버와 모든 화면이 공유하는 상태·명령·이벤트 이름.
// 자세한 설명은 docs/PROTOCOL.md 참고.

export { GAME_MODES } from './constants.js';

export const PROTOCOL_VERSION = 2;

export const ROLES = {
  PLAYER: 'player',
  DISPLAY: 'display',
  HOST: 'host',
  ADMIN: 'admin',
};

// 방의 진행 단계. 서버만 바꾸고, 화면은 받아서 그린다.
export const PHASES = {
  LOBBY: 'lobby',                     // 참가자 입장 대기
  ROUND_INTRO: 'round_intro',         // 라운드 제목 안내
  QUESTION_OPEN: 'question_open',     // 답안 접수 중
  QUESTION_CLOSED: 'question_closed', // 접수 마감, 정답 공개 전
  QUESTION_REVEAL: 'question_reveal', // 정답 공개
  ROUND_END: 'round_end',             // 라운드 종료
  FINAL: 'final',                     // 모든 라운드 종료, 시상 대기
  AWARDS: 'awards',                   // 시상 진행 중
};

// 진행 명령 (host:command 의 type). 진행자와 관리자가 같은 채널을 쓴다.
export const COMMANDS = {
  NEXT: 'next',                     // 현재 단계에 맞는 다음 동작
  REVEAL: 'reveal',                 // 접수 마감 + 정답 공개
  SKIP: 'skip',                     // 현재 문제 무효 처리 후 다음으로
  GOTO: 'goto',                     // { round, question } 로 이동
  PAUSE: 'pause',
  RESUME: 'resume',
  EXTEND_TIME: 'extend_time',       // { seconds }
  SHOW_STANDINGS: 'show_standings', // { scope: 'total' | 'round' }
  HIDE_STANDINGS: 'hide_standings',
  END_GAME: 'end_game',
  AWARD_NEXT: 'award_next',         // 다음 시상 항목
  AWARD_STEP: 'award_step',         // 현재 항목을 한 단계 공개
  SHOW_MAIN: 'show_main',           // Display 를 메인 화면으로
  HIDE_MAIN: 'hide_main',
};

export const EVENTS = {
  // Client → Server (모두 ack 콜백으로 { ok, ... } 응답)
  ROOM_JOIN: 'room:join',                 // { roomCode, token?, role? }
  PLAYER_REGISTER: 'player:register',     // { roomCode, name, group, unit }
  PLAYER_ANSWER: 'player:answer',         // { answer }
  PLAYER_REACT: 'player:react',           // { clientMs }
  CHAT_SEND: 'chat:send',                 // { message }
  HOST_COMMAND: 'host:command',           // { type, step, ...args }
  ADMIN_CREATE_ROOM: 'admin:create_room',
  ADMIN_LOAD_SET: 'admin:load_set',       // { roomCode, set }
  ADMIN_SETTINGS: 'admin:settings',       // { roomCode, patch }
  ADMIN_SET_AWARDS: 'admin:set_awards',   // { roomCode, items }
  ADMIN_UPDATE_PLAYER: 'admin:update_player', // { roomCode, playerId, name?, group?, unit? }
  ADMIN_REMOVE_PLAYER: 'admin:remove_player', // { roomCode, playerId }
  ADMIN_HOST_TOKEN: 'admin:host_token',   // { roomCode }
  ADMIN_LIST_ROOMS: 'admin:list_rooms',
  ADMIN_CLOSE_ROOM: 'admin:close_room',   // { roomCode }

  // Server → Client
  ROOM_STATE: 'room:state',         // 역할별 전체 상태 스냅샷
  ROOM_PROGRESS: 'room:progress',   // { step, submittedCount, onlineCount } (참가자 제외)
  ROOM_CLOSED: 'room:closed',
  PLAYER_RESULT: 'player:result',   // 본인 채점 결과
  CHAT_MESSAGE: 'chat:message',
};

// ack 의 error 코드
export const ERRORS = {
  STALE: 'stale',               // step 불일치 — 이미 처리된 명령
  INVALID: 'invalid',           // 지금 단계에서 할 수 없는 명령
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  BAD_REQUEST: 'bad_request',
};

export const DEFAULT_DISPLAY_SETTINGS = {
  chatEnabled: true,
  chatFontScale: 1,     // 0.5 – 3
  chatOpacity: 1,
  chatSpeed: 1,
  theme: 'default',
  background: null,     // { type: 'color' | 'gradient' | 'image' | 'video', value }
  standingsSpeed: 1,    // 0.5 – 2
};
