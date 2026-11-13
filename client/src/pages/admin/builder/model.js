// 문제 만들기 — 편집 중인 세트는 업로드 JSON 과 같은 모양으로 들고 있는다
// (그래서 불러오기·내보내기·검사를 그대로 할 수 있다).
import { GAME_MODES as M } from '@shared/protocol.js';
import { scaleFactor, scalePoints, SCORING_DEFAULTS } from '@shared/scoring.js';

export const MODE_OPTIONS = [
  [M.MULTIPLE_CHOICE, '객관식'],
  [M.SHORT_ANSWER, '단답형'],
  [M.CONSONANT, '초성 퀴즈'],
  [M.WORD_GUESS, '빈칸 맞추기'],
  [M.IMAGE_QUIZ, '이미지 퀴즈'],
  [M.IMAGE_MULTIPLE_CHOICE, '이미지 객관식'],
  [M.IMAGE_MEMORY, '이미지 기억력'],
  [M.AUDIO_QUIZ, '오디오 퀴즈'],
  [M.REACTION, '반응속도'],
  [M.EMOJI_FIND, '이모지 사람 찾기'],
  [M.LONG_TYPING, '장문 타이핑'],
];

// 모드별로 보여줄 입력칸
export const MODE_FIELDS = {
  [M.MULTIPLE_CHOICE]: ['choices'],
  [M.IMAGE_MULTIPLE_CHOICE]: ['imageUrl', 'choices'],
  [M.IMAGE_MEMORY]: ['imageUrls', 'choices'],
  [M.SHORT_ANSWER]: ['correctAnswer'],
  [M.CONSONANT]: ['correctAnswer', 'consonantHint'],
  [M.WORD_GUESS]: ['correctAnswer'],
  [M.IMAGE_QUIZ]: ['imageUrl', 'correctAnswer'],
  [M.AUDIO_QUIZ]: ['audioUrl', 'correctAnswer'],
  [M.REACTION]: [],
  [M.EMOJI_FIND]: ['emoji'],
  [M.LONG_TYPING]: ['targetText', 'passAccuracy'],
};

export const HAS_ANSWER = (mode) => mode !== M.REACTION && mode !== M.EMOJI_FIND;
export const CHOICE_MODES = new Set([M.MULTIPLE_CHOICE, M.IMAGE_MULTIPLE_CHOICE, M.IMAGE_MEMORY]);

export const MODE_HINT = {
  [M.MULTIPLE_CHOICE]: '보기 중 정답 하나를 체크하세요.',
  [M.SHORT_ANSWER]: '띄어쓰기·대소문자는 무시하고 비교합니다.',
  [M.CONSONANT]: '정답을 적고 "초성 자동"을 누르면 힌트가 채워집니다.',
  [M.WORD_GUESS]: '문제에 빈칸을 _ 로 표시하세요. 예: 사 _ 나무',
  [M.IMAGE_QUIZ]: '이미지를 보고 정답을 입력하는 문제입니다.',
  [M.IMAGE_MULTIPLE_CHOICE]: '이미지를 보고 보기 중에서 고르는 문제입니다.',
  [M.IMAGE_MEMORY]: '이미지(여러 장 가능)를 보며 보기 중에서 고르는 문제입니다.',
  [M.AUDIO_QUIZ]: '음악·소리는 프로젝터에서 재생됩니다.',
  [M.REACTION]: '신호가 뜨면 빨리 누르기. 순위 점수는 라운드 설정에서 정합니다.',
  [M.EMOJI_FIND]: '같은 이모지 세트를 가진 사람의 코드를 찾아 입력합니다. 정답 입력은 필요 없습니다.',
  [M.LONG_TYPING]: '원문은 프로젝터에만 보이고, 참가자는 따라 입력합니다.',
};

export function newQuestion(mode) {
  const q = { content: '', timeLimit: 20 };
  if (CHOICE_MODES.has(mode)) Object.assign(q, { choices: ['', '', '', ''], correctAnswer: '' });
  else if (HAS_ANSWER(mode)) q.correctAnswer = '';
  if (mode === M.IMAGE_MEMORY) q.imageUrls = [''];
  if (mode === M.IMAGE_QUIZ || mode === M.IMAGE_MULTIPLE_CHOICE) q.imageUrl = '';
  if (mode === M.AUDIO_QUIZ) q.audioUrl = '';
  if (mode === M.CONSONANT) q.consonantHint = '';
  if (mode === M.REACTION) Object.assign(q, { content: '신호가 뜨면 바로 누르세요!', timeLimit: 6 });
  if (mode === M.EMOJI_FIND) Object.assign(q, { content: '같은 이모지 세트를 가진 사람을 찾아 코드를 입력하세요!', timeLimit: 60, setSize: 3, groupSize: 2 });
  if (mode === M.LONG_TYPING) Object.assign(q, { content: '화면의 말씀을 정확하게 따라 입력하세요', timeLimit: 60 });
  return q;
}

// 모드를 바꿀 때 공통 내용(문제·시간·점수·정답 사진)은 살리고 나머지는 새 모드 기본값으로
export function convertQuestion(q, mode) {
  const next = newQuestion(mode);
  for (const key of ['content', 'timeLimit', 'points', 'penalty', 'answerImage', 'answerNote']) {
    if (q[key] !== undefined && q[key] !== '') next[key] = q[key];
  }
  if (HAS_ANSWER(mode) && q.correctAnswer) next.correctAnswer = q.correctAnswer;
  if (CHOICE_MODES.has(mode) && Array.isArray(q.choices)) next.choices = q.choices;
  if (q.imageUrl && 'imageUrl' in next) next.imageUrl = q.imageUrl;
  if (q.imageUrl && 'imageUrls' in next) next.imageUrls = [q.imageUrl];
  return next;
}

export function newRound(mode = M.MULTIPLE_CHOICE, index = 0) {
  return { theme: `라운드 ${index + 1}`, gameMode: mode, questions: [newQuestion(mode)] };
}

export function newSet() {
  return {
    sessionName: '',
    scoring: { points: 5, penalty: 0 },
    teams: { groups: [{ name: '중1', units: ['브릿지 A'] }] },
    rounds: [newRound(M.MULTIPLE_CHOICE, 0)],
  };
}

// 한글 초성 뽑기 (초성 퀴즈 힌트 자동 생성)
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(text) {
  return [...String(text || '')].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return INITIALS[Math.floor((code - 0xac00) / 588)];
    return ch;
  }).join('');
}

// 내보낼 때 빈 선택 항목은 뺀다 (필수 칸은 검사에서 걸리도록 그대로 둔다)
const OPTIONAL = new Set(['points', 'penalty', 'answerImage', 'answerNote', 'imageUrl', 'audioUrl', 'passAccuracy', 'rankPoints', 'theme', 'emojiPool']);
export function cleanSet(set) {
  const clean = (obj) => {
    if (Array.isArray(obj)) return obj.map(clean);
    if (!obj || typeof obj !== 'object') return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (OPTIONAL.has(k) && (v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0))) continue;
      if (k === 'imageUrls' && Array.isArray(v)) {
        const urls = v.filter((u) => u && u.trim());
        if (urls.length) out.imageUrls = urls;
        continue;
      }
      if (v === undefined) continue;
      out[k] = clean(v);
    }
    return out;
  };
  return clean(set);
}

// 검사 오류를 위치별로 묶는다: 'rounds[1].questions[2].choices' → round 1, question 2
export function groupErrors(errors = []) {
  const byQuestion = new Map();
  const byRound = new Map();
  const other = [];
  for (const e of errors) {
    const q = e.path.match(/^rounds\[(\d+)\]\.questions\[(\d+)\]/);
    const r = e.path.match(/^rounds\[(\d+)\]/);
    if (q) {
      const key = `${q[1]}:${q[2]}`;
      if (!byQuestion.has(key)) byQuestion.set(key, []);
      byQuestion.get(key).push({ ...e, field: e.path.slice(q[0].length + 1) });
    } else if (r) {
      if (!byRound.has(+r[1])) byRound.set(+r[1], []);
      byRound.get(+r[1]).push(e);
    } else other.push(e);
  }
  return { byQuestion, byRound, other };
}

// 기존 형식·큰 점수 단위로 된 세트를 편집 화면용으로 바꾼다.
// maxScore → points, passThreshold → passAccuracy, 고정 정답값(__reaction__ 등) 제거,
// 그리고 점수를 새 단위(기본 5점)로 비율 환산해서 화면에 바로 보이게 한다.
export function normalizeImport(raw) {
  const set = JSON.parse(JSON.stringify(raw));
  const notes = [];
  let legacy = false;
  for (const r of set.rounds) {
    delete r.roundNumber;
    if (!Array.isArray(r.questions)) r.questions = [];
    for (const q of r.questions) {
      if (q.maxScore !== undefined) { if (q.points === undefined) q.points = q.maxScore; delete q.maxScore; legacy = true; }
      if (q.passThreshold !== undefined) { if (q.passAccuracy === undefined) q.passAccuracy = q.passThreshold; delete q.passThreshold; }
      if ('panalty' in q) { if (q.penalty === undefined) q.penalty = q.panalty; delete q.panalty; }
      delete q.memorizeDuration;
      if (typeof q.correctAnswer === 'string' && /^__\w+__$/.test(q.correctAnswer)) delete q.correctAnswer;
    }
  }
  if (legacy) notes.push('기존 형식(maxScore)을 points 로 바꿨습니다');

  const scoring = set.scoring || {};
  if (scoring.autoScale !== false) {
    const values = set.rounds.filter((r) => r.gameMode !== M.REACTION).flatMap((r) => r.questions.map((q) => q.points ?? r.points ?? scoring.points));
    const { factor, base } = scaleFactor(values.filter((v) => typeof v === 'number'), scoring.scaleTo ?? SCORING_DEFAULTS.scaleTo);
    if (factor !== 1) {
      const sc = (v) => (typeof v === 'number' ? scalePoints(v, factor) : v);
      for (const r of set.rounds) {
        r.points = sc(r.points); r.penalty = sc(r.penalty);
        if (Array.isArray(r.rankPoints)) r.rankPoints = r.rankPoints.map(sc);
        for (const q of r.questions) {
          q.points = sc(q.points); q.penalty = sc(q.penalty);
          if (Array.isArray(q.rankPoints)) q.rankPoints = q.rankPoints.map(sc);
        }
      }
      if (set.scoring) { set.scoring.points = sc(set.scoring.points); set.scoring.penalty = sc(set.scoring.penalty); }
      notes.push(`점수를 ${base}점 → ${scoring.scaleTo ?? SCORING_DEFAULTS.scaleTo}점 기준으로 환산했습니다`);
    }
  }
  return { set, notes };
}

// 'rounds[8].questions[1].imageUrl' → 'R9 Q2'
export function pathLabel(path = '') {
  const m = path.match(/^rounds\[(\d+)\](?:\.questions\[(\d+)\])?/);
  if (!m) return path || '전체';
  return m[2] !== undefined ? `R${+m[1] + 1} Q${+m[2] + 1}` : `R${+m[1] + 1}`;
}
