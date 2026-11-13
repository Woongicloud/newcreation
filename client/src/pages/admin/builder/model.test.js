import { describe, it, expect } from 'vitest';
import { validateQuizSet } from '@shared/quizSchema.js';
import { GAME_MODES as M } from '@shared/protocol.js';
import { readFileSync } from 'node:fs';
import { MODE_OPTIONS, newSet, newRound, newQuestion, convertQuestion, cleanSet, chosung, groupErrors, CHOICE_MODES, HAS_ANSWER, normalizeImport, pathLabel } from './model.js';

// 화면에서 필수 칸을 채운 것처럼
function fill(q, mode) {
  const out = { ...q, content: q.content || '문제' };
  if (CHOICE_MODES.has(mode)) { out.choices = ['가', '나', '다', '라']; out.correctAnswer = '나'; }
  else if (HAS_ANSWER(mode)) out.correctAnswer = '정답';
  if ('imageUrl' in out) out.imageUrl = 'a.png';
  if ('imageUrls' in out) out.imageUrls = ['a.png', ''];
  if ('audioUrl' in out) out.audioUrl = 'a.mp3';
  if (mode === M.CONSONANT) out.consonantHint = chosung(out.correctAnswer);
  return out;
}

describe('문제 만들기 모델', () => {
  it('11개 모드 모두, 필수 칸을 채우면 서버 검사를 통과하는 JSON 이 나온다', () => {
    const set = newSet();
    set.sessionName = '테스트';
    set.teams.groups = [{ name: '중1', units: ['브릿지 A', '브릿지 B'] }];
    set.rounds = MODE_OPTIONS.map(([mode], i) => {
      const r = newRound(mode, i);
      r.questions = [fill(r.questions[0], mode), fill(newQuestion(mode), mode)];
      return r;
    });
    const result = validateQuizSet(cleanSet(set));
    expect(result.errors).toEqual([]);
    expect(result.set.rounds).toHaveLength(11);
  });

  it('비어 있는 새 세트는 오류 위치를 문제 단위로 알려준다', () => {
    const { errors } = validateQuizSet(cleanSet(newSet()));
    const grouped = groupErrors(errors);
    expect([...grouped.byQuestion.keys()]).toEqual(['0:0']);
    expect(grouped.byQuestion.get('0:0').map((e) => e.field)).toEqual(expect.arrayContaining(['content', 'choices']));
  });

  it('내보낼 때 빈 선택 항목은 빼고, 빈 이미지 칸은 정리한다', () => {
    const out = cleanSet({ rounds: [{ theme: '', gameMode: M.IMAGE_MEMORY, questions: [{ content: 'Q', points: undefined, answerImage: '', imageUrls: ['a.png', ' '] }] }] });
    expect(out.rounds[0]).toEqual({ gameMode: M.IMAGE_MEMORY, questions: [{ content: 'Q', imageUrls: ['a.png'] }] });
  });

  it('모드를 바꾸면 공통 내용은 남기고 새 모드 칸으로 바꾼다', () => {
    const q = { content: '수도는?', timeLimit: 15, points: 8, correctAnswer: '서울', answerImage: 's.jpg' };
    expect(convertQuestion(q, M.CONSONANT)).toMatchObject({ content: '수도는?', timeLimit: 15, points: 8, correctAnswer: '서울', consonantHint: '', answerImage: 's.jpg' });
    const r = convertQuestion(q, M.REACTION);
    expect(r).toMatchObject({ content: '수도는?', timeLimit: 15 });
    expect(r.correctAnswer).toBeUndefined();
  });

  it('초성 자동 생성', () => {
    expect(chosung('베들레헴')).toBe('ㅂㄷㄹㅎ');
    expect(chosung('노아의 방주')).toBe('ㄴㅇㅇ ㅂㅈ');
    expect(chosung('A1')).toBe('A1');
  });

  it('기존 형식 세트를 불러오면 새 형식·새 점수 단위로 바꾸고, 그대로 내보내도 같은 결과가 된다', () => {
    const raw = JSON.parse(readFileSync(new URL('../../../../../sample_quiz_set.json', import.meta.url), 'utf8'));
    const { set, notes } = normalizeImport(raw);
    const q = set.rounds[0].questions[0];
    expect(q).toMatchObject({ points: 5, penalty: 1 });
    expect(q.maxScore).toBeUndefined();
    expect(set.rounds.find((r) => r.gameMode === 'reaction').questions[0].correctAnswer).toBeUndefined();
    expect(notes.join(' ')).toContain('1000점 → 5점');
    // 서버 검사 결과가 원본을 올렸을 때와 같다
    const direct = validateQuizSet(raw).set.rounds.map((r) => r.questions.map((x) => [x.points, x.penalty]));
    const viaBuilder = validateQuizSet(cleanSet(set)).set.rounds.map((r) => r.questions.map((x) => [x.points, x.penalty]));
    expect(viaBuilder).toEqual(direct);
  });

  it('오류 위치를 R·Q 번호로', () => {
    expect(pathLabel('rounds[8].questions[1].imageUrl')).toBe('R9 Q2');
    expect(pathLabel('rounds[2].gameMode')).toBe('R3');
    expect(pathLabel('teams.groups[0]')).toBe('teams.groups[0]');
  });
});

describe('문제 만들기 — 다른 인정 답', () => {
  it('빈 칸은 빼고 내보내며, 서버 검사를 통과한다', () => {
    const set = newSet();
    set.rounds = [{ theme: 'R', gameMode: M.SHORT_ANSWER, questions: [{ content: '수제자는?', correctAnswer: '베드로', acceptAnswers: ['시몬', '', ' 시몬 베드로 '], timeLimit: 10 }] }];
    const out = cleanSet(set);
    expect(out.rounds[0].questions[0].acceptAnswers).toEqual(['시몬', '시몬 베드로']);
    const { ok, set: checked } = validateQuizSet(out);
    expect(ok).toBe(true);
    expect(checked.rounds[0].questions[0].acceptAnswers).toEqual(['시몬', '시몬 베드로']);
  });

  it('입력형 모드끼리 바꾸면 인정 답이 남고, 객관식으로 바꾸면 빠진다', () => {
    const q = { content: 'Q', correctAnswer: '서울', acceptAnswers: ['서울특별시'] };
    expect(convertQuestion(q, M.CONSONANT).acceptAnswers).toEqual(['서울특별시']);
    expect(convertQuestion(q, M.MULTIPLE_CHOICE).acceptAnswers).toBeUndefined();
  });
});
