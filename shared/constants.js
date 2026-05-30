export const GAME_MODES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  SHORT_ANSWER: 'short_answer',
  CONSONANT: 'consonant',
  WORD_GUESS: 'word_guess',
  IMAGE_QUIZ: 'image_quiz',
  AUDIO_QUIZ: 'audio_quiz',
  REACTION: 'reaction',
  IMAGE_MULTIPLE_CHOICE: 'image_multiple_choice',
  IMAGE_MEMORY: 'image_memory',
  EMOJI_FIND: 'emoji_find',
  LONG_TYPING: 'long_typing',
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
  ADMIN_LIST_ROOMS: 'admin:list_rooms',
  ADMIN_TERMINATE_ROOM: 'admin:terminate_room',
  ADMIN_SHOW_AWARD: 'admin:show_award',

  // Server → Client
  GAME_PLAYER_JOINED: 'game:player_joined',
  GAME_QUESTION_START: 'game:question_start',
  GAME_TIMER_TICK: 'game:timer_tick',
  GAME_QUESTION_END: 'game:question_end',
  GAME_SHOW_RESULT: 'game:show_result',
  GAME_ROUND_END: 'game:round_end',
  GAME_REACTION_START: 'game:reaction_start',
  GAME_REACTION_END: 'game:reaction_end',
  GAME_EMOJI_ASSIGN: 'game:emoji_assign',
  GAME_MEMORY_END: 'game:memory_end',
  GAME_STATE_SYNC: 'game:state_sync',
  GAME_SESSION_ENDED: 'game:session_ended',
  GAME_AWARDS_DATA: 'game:awards_data',
  GAME_SHOW_AWARD: 'game:show_award',
  CHAT_MESSAGE: 'chat:message',
  ERROR: 'error',

  ADMIN_ROOMS_DATA: 'admin:rooms_data',

  // Admin
  ADMIN_GET_AWARDS: 'admin:get_awards',
};

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

export const CLASS_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3', '기타'];
