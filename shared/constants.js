// 게임 모드 이름. 프로토콜(상태·명령·이벤트)은 protocol.js 에 있다.
// 초성 퀴즈: 문제가 나온 뒤 초성 힌트를 보여주기까지 기본 대기 시간(초)
export const HINT_DELAY_DEFAULT = 5;

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
