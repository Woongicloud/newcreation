import { GAME_MODES, PHASES } from '@shared/protocol.js';

export const MODE_LABEL = {
  [GAME_MODES.MULTIPLE_CHOICE]: '객관식',
  [GAME_MODES.SHORT_ANSWER]: '단답형',
  [GAME_MODES.CONSONANT]: '초성 퀴즈',
  [GAME_MODES.WORD_GUESS]: '빈칸 맞추기',
  [GAME_MODES.IMAGE_QUIZ]: '이미지 퀴즈',
  [GAME_MODES.AUDIO_QUIZ]: '오디오 퀴즈',
  [GAME_MODES.REACTION]: '반응속도',
  [GAME_MODES.IMAGE_MULTIPLE_CHOICE]: '이미지 객관식',
  [GAME_MODES.IMAGE_MEMORY]: '이미지 기억력',
  [GAME_MODES.EMOJI_FIND]: '이모지 사람 찾기',
  [GAME_MODES.LONG_TYPING]: '장문 타이핑',
};

export const PHASE_LABEL = {
  [PHASES.LOBBY]: '입장 대기',
  [PHASES.ROUND_INTRO]: '라운드 안내',
  [PHASES.QUESTION_OPEN]: '답안 접수 중',
  [PHASES.QUESTION_CLOSED]: '접수 마감',
  [PHASES.QUESTION_REVEAL]: '정답 공개',
  [PHASES.ROUND_END]: '라운드 종료',
  [PHASES.FINAL]: '게임 종료',
  [PHASES.AWARDS]: '시상',
};

// 리모트 주 버튼 라벨 — 서버가 알려준 next.action 기준
export const NEXT_LABEL = {
  start_game: '게임 시작',
  open_question: '문제 시작',
  reveal: '정답 공개',
  next_question: '다음 문제',
  end_round: '라운드 종료',
  next_round: '다음 라운드',
  finish: '게임 종료 · 시상 준비',
  award_next: '다음 시상',
  award_step: '공개',
};

export const AWARD_TYPE_LABEL = {
  individual_ranking: '개인 순위',
  group_ranking: '학년 순위',
  unit_ranking: '브릿지 순위',
  special: '특별상',
  random: '추첨',
};

export const REVEAL_LABEL = {
  podium: '단상',
  countup: '하위부터 공개',
  bar_race: '막대 경주',
  card: '카드',
  slot: '슬롯',
  scroll: '스크롤',
};

export const memberLabel = (p) => [p.group, p.unit].filter(Boolean).join(' ');
export const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());
