export const GAME_MODES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  SHORT_ANSWER: 'short_answer',
  CONSONANT: 'consonant',
  WORD_GUESS: 'word_guess',
  IMAGE_QUIZ: 'image_quiz',
  REACTION: 'reaction',
};

export const SOCKET_EVENTS = {
  // Client → Server
  PLAYER_REGISTER: 'player:register',
  PLAYER_SUBMIT: 'player:submit_answer',
  PLAYER_REACTION: 'player:reaction',
  PLAYER_REJOIN: 'player:rejoin',
  CHAT_SEND: 'chat:send',
  ADMIN_CREATE_ROOM: 'admin:create_room',
  ADMIN_UPLOAD_QUESTIONS: 'admin:upload_questions',
  ADMIN_START_GAME: 'admin:start_game',
  ADMIN_NEXT_QUESTION: 'admin:next_question',
  ADMIN_NEXT_ROUND: 'admin:next_round',
  ADMIN_END_GAME: 'admin:end_game',

  // Server → Client
  GAME_PLAYER_JOINED: 'game:player_joined',
  GAME_QUESTION_START: 'game:question_start',
  GAME_TIMER_TICK: 'game:timer_tick',
  GAME_QUESTION_END: 'game:question_end',
  GAME_SHOW_RESULT: 'game:show_result',
  GAME_ROUND_END: 'game:round_end',
  GAME_REACTION_START: 'game:reaction_start',
  GAME_REACTION_END: 'game:reaction_end',
  GAME_STATE_SYNC: 'game:state_sync',
  CHAT_MESSAGE: 'chat:message',
  ERROR: 'error',
};

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

export const CLASS_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3', '기타'];
