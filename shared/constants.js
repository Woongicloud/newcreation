// 게임 모드 이름. 프로토콜(상태·명령·이벤트)은 protocol.js 에 있다.
// 초성 퀴즈: 문제가 나온 뒤 추가 힌트(extraHint)를 보여주기까지 기본 대기 시간(초). 초성 힌트는 바로 나온다
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

// 파일이 아니라 웹페이지인 음악·영상 서비스 링크 — <audio>/<img> 로 재생·표시할 수 없다
// (사운드클라우드·유튜브·구글 드라이브 공유 링크 등). 파일을 내려받아 ⑥ 파일에 올려야 한다.
export const PAGE_LINK_HOSTS = /(^|\.)(soundcloud\.com|snd\.sc|youtube\.com|youtu\.be|drive\.google\.com|docs\.google\.com|music\.apple\.com|spotify\.com|melon\.com|genie\.co\.kr|music\.bugs\.co\.kr|vibe\.naver\.com|blog\.naver\.com|instagram\.com|tiktok\.com|suno\.com|suno\.ai|dropbox\.com)$/i;

export function isPageLink(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return false;
  try { return PAGE_LINK_HOSTS.test(new URL(url.trim()).hostname); } catch { return false; }
}
