// 문제 세트 JSON 검증 + 정규화.
// validateQuizSet(raw) → { ok, errors: [{ path, message }], warnings: [...], set }
// 정규화된 set 은 모든 문제에 points / penalty / timeLimit 이 채워져 있다.

import { GAME_MODES } from './constants.js';
import { SCORING_DEFAULTS, normalizeAnswer, scaleFactor, scalePoints } from './scoring.js';

const MODES = new Set(Object.values(GAME_MODES));
const CHOICE_MODES = new Set([
  GAME_MODES.MULTIPLE_CHOICE,
  GAME_MODES.IMAGE_MULTIPLE_CHOICE,
  GAME_MODES.IMAGE_MEMORY,
]);
const NO_ANSWER_MODES = new Set([GAME_MODES.REACTION, GAME_MODES.EMOJI_FIND]);
const IMAGE_MODES = new Set([
  GAME_MODES.IMAGE_QUIZ,
  GAME_MODES.IMAGE_MULTIPLE_CHOICE,
  GAME_MODES.IMAGE_MEMORY,
]);

export const AWARD_TYPES = ['individual_ranking', 'group_ranking', 'unit_ranking', 'special', 'random'];
export const AWARD_REVEALS = ['podium', 'countup', 'bar_race', 'card', 'slot', 'scroll'];
export const SPECIAL_METRICS = ['rank', 'middle', 'fastest', 'chattiest', 'round_best'];
export const TEAM_SCORE_METHODS = ['adjusted', 'average', 'sum'];

const DEFAULT_REVEAL = {
  individual_ranking: 'countup',
  group_ranking: 'countup',
  unit_ranking: 'countup',
  special: 'card',
  random: 'slot',
};

const AWARD_PRESETS = {
  // 이번 행사 기본 세트
  event: [
    { type: 'unit_ranking', title: '브릿지 순위', reveal: 'countup' },
    { type: 'random', title: '행운상', reveal: 'slot', count: 3 },
    { type: 'individual_ranking', title: '개인 순위', reveal: 'countup', top: 5 },
    { type: 'special', metric: 'middle', title: '뉴평 중간값', reveal: 'card' },
  ],
  team_only: [
    { type: 'unit_ranking', title: '브릿지 순위', reveal: 'countup' },
    { type: 'group_ranking', title: '학년 순위', reveal: 'bar_race' },
  ],
  quick: [{ type: 'individual_ranking', title: '개인 순위', reveal: 'podium', top: 3 }],
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function resolveMediaUrl(url) {
  if (!isStr(url)) return null;
  if (url.startsWith('/') || /^https?:\/\//.test(url)) return url;
  return `/media/${url}`;
}

// 숫자 필드 읽기: 없으면 fallback, 있으면 범위 검사
function makeNum(err) {
  return (value, path, fallback, { min = 0, max = Infinity, integer = false } = {}) => {
    if (value === undefined || value === null) return fallback;
    if (!isNum(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      err(path, `${min} 이상${max === Infinity ? '' : ` ${max} 이하`}의 ${integer ? '정수' : '숫자'}여야 합니다.`);
      return fallback;
    }
    return value;
  };
}

function normalizeAwards(awardItems, { teams, roundCount }, err, warn) {
  const num = makeNum(err);
  const awards = [];
  awardItems.forEach((item, i) => {
    const ap = `awards.items[${i}]`;
    if (!isObj(item) || !AWARD_TYPES.includes(item.type)) {
      return err(`${ap}.type`, `${AWARD_TYPES.join(' / ')} 중 하나여야 합니다.`);
    }
    if ((item.type === 'unit_ranking' || item.type === 'group_ranking') && !teams) {
      return warn(ap, '팀(teams) 설정이 없어 팀 순위 시상을 제외했습니다.');
    }
    const out = { type: item.type, title: isStr(item.title) ? item.title.trim() : '시상' };
    out.reveal = item.reveal ?? DEFAULT_REVEAL[item.type];
    if (!AWARD_REVEALS.includes(out.reveal)) {
      err(`${ap}.reveal`, `${AWARD_REVEALS.join(' / ')} 중 하나여야 합니다.`);
      out.reveal = DEFAULT_REVEAL[item.type];
    }
    if (item.type !== 'special') {
      out.scope = item.scope ?? 'all';
      const scopes = item.type === 'individual_ranking' ? ['all', 'group', 'unit']
        : item.type === 'unit_ranking' ? ['all', 'group'] : ['all'];
      if (!scopes.includes(out.scope) || (out.scope !== 'all' && !teams)) {
        err(`${ap}.scope`, `${scopes.join(' / ')} 중 하나여야 합니다.`);
        out.scope = 'all';
      }
    }
    if (item.type.endsWith('_ranking')) {
      out.top = num(item.top, `${ap}.top`, item.type === 'individual_ranking' ? 3 : null, { min: 1, integer: true });
    }
    if (item.type === 'random') out.count = num(item.count, `${ap}.count`, 1, { min: 1, integer: true });
    if (item.type === 'special') {
      if (!SPECIAL_METRICS.includes(item.metric)) {
        return err(`${ap}.metric`, `${SPECIAL_METRICS.join(' / ')} 중 하나여야 합니다.`);
      }
      out.metric = item.metric;
      if (item.metric === 'rank') {
        out.rank = num(item.rank, `${ap}.rank`, null, { min: 1, integer: true });
        if (out.rank === null) return err(`${ap}.rank`, '등수(rank)가 필요합니다.');
      }
      if (item.metric === 'round_best') {
        out.round = num(item.round, `${ap}.round`, null, { min: 1, max: Math.max(1, roundCount), integer: true });
        if (out.round === null) return err(`${ap}.round`, '라운드 번호(round)가 필요합니다.');
      }
    }
    awards.push(out);
  });
  return awards;

}

// 시상 세트만 따로 검증 (관리자가 당일에 순서·연출을 바꿀 때)
export function validateAwards(items, { teams, roundCount }) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push({ path: 'awards.items', message: '배열이어야 합니다.' });
    return { ok: false, errors, warnings, awards: null };
  }
  const awards = normalizeAwards(items, { teams, roundCount },
    (path, message) => errors.push({ path, message }),
    (path, message) => warnings.push({ path, message }));
  return { ok: errors.length === 0, errors, warnings, awards: errors.length === 0 ? awards : null };
}

export function validateQuizSet(raw) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObj(raw)) {
    err('', '세트는 JSON 객체여야 합니다.');
    return { ok: false, errors, warnings, set: null };
  }

  const num = makeNum(err);

  // ── 점수 기본값 ──────────────────────────────────────────
  const rawScoring = isObj(raw.scoring) ? raw.scoring : {};
  if (raw.scoring !== undefined && !isObj(raw.scoring)) err('scoring', '객체여야 합니다.');
  const scoring = {
    points: num(rawScoring.points, 'scoring.points', SCORING_DEFAULTS.points),
    penalty: num(rawScoring.penalty, 'scoring.penalty', SCORING_DEFAULTS.penalty),
    lossCapRatio: num(rawScoring.lossCapRatio, 'scoring.lossCapRatio', SCORING_DEFAULTS.lossCapRatio, { max: 1 }),
    scaleTo: num(rawScoring.scaleTo, 'scoring.scaleTo', SCORING_DEFAULTS.scaleTo, { min: 1, integer: true }),
    autoScale: rawScoring.autoScale !== false,
  };

  // ── 팀 (학년 → 브릿지) ───────────────────────────────────
  let teams = null;
  if (raw.teams !== undefined) {
    if (!isObj(raw.teams) || !Array.isArray(raw.teams.groups) || raw.teams.groups.length === 0) {
      err('teams.groups', '학년 목록이 필요합니다.');
    } else {
      const labels = isObj(raw.teams.labels) ? raw.teams.labels : {};
      const seenGroups = new Set();
      const groups = [];
      raw.teams.groups.forEach((g, gi) => {
        const gp = `teams.groups[${gi}]`;
        if (!isObj(g) || !isStr(g.name)) return err(`${gp}.name`, '학년 이름이 필요합니다.');
        const name = g.name.trim();
        if (seenGroups.has(name)) return err(`${gp}.name`, `"${name}" 이(가) 중복됩니다.`);
        seenGroups.add(name);
        if (!Array.isArray(g.units) || g.units.length === 0) {
          return err(`${gp}.units`, '브릿지가 하나 이상 필요합니다.');
        }
        const seenUnits = new Set();
        const units = [];
        g.units.forEach((u, ui) => {
          if (!isStr(u)) return err(`${gp}.units[${ui}]`, '브릿지 이름은 문자열이어야 합니다.');
          const unit = u.trim();
          if (seenUnits.has(unit)) return err(`${gp}.units[${ui}]`, `"${unit}" 이(가) 중복됩니다.`);
          seenUnits.add(unit);
          units.push(unit);
        });
        groups.push({ name, units });
      });
      let teamScore = raw.teams.teamScore ?? 'adjusted';
      if (!TEAM_SCORE_METHODS.includes(teamScore)) {
        err('teams.teamScore', `${TEAM_SCORE_METHODS.join(' / ')} 중 하나여야 합니다.`);
        teamScore = 'adjusted';
      }
      teams = {
        labels: {
          group: isStr(labels.group) ? labels.group.trim() : '학년',
          unit: isStr(labels.unit) ? labels.unit.trim() : '브릿지',
        },
        groups,
        teamScore,
        teamScoreWeight: num(raw.teams.teamScoreWeight, 'teams.teamScoreWeight', 3),
      };
    }
  }

  // ── 라운드·문제 ─────────────────────────────────────────
  const rounds = [];
  let legacyScoreSeen = false;
  if (!Array.isArray(raw.rounds) || raw.rounds.length === 0) {
    err('rounds', '라운드가 하나 이상 필요합니다.');
  } else {
    raw.rounds.forEach((r, ri) => {
      const rp = `rounds[${ri}]`;
      if (!isObj(r)) return err(rp, '라운드는 객체여야 합니다.');
      if (!MODES.has(r.gameMode)) {
        return err(`${rp}.gameMode`, `알 수 없는 게임 모드입니다: ${JSON.stringify(r.gameMode)}`);
      }
      if (!Array.isArray(r.questions) || r.questions.length === 0) {
        return err(`${rp}.questions`, '문제가 하나 이상 필요합니다.');
      }
      const mode = r.gameMode;
      const roundPoints = num(r.points, `${rp}.points`, undefined);
      const roundPenalty = num(r.penalty, `${rp}.penalty`, undefined);
      const roundPass = num(r.passAccuracy, `${rp}.passAccuracy`, undefined, { max: 1 });
      const roundRank = r.rankPoints;

      const questions = r.questions.map((q, qi) => {
        const qp = `${rp}.questions[${qi}]`;
        if (!isObj(q)) {
          err(qp, '문제는 객체여야 합니다.');
          return null;
        }
        if ('panalty' in q) warn(`${qp}.panalty`, '"panalty"는 오타로 보입니다. "penalty"로 고쳐주세요. (무시됨)');

        // 기존 포맷: maxScore → points
        let legacyPoints;
        if (q.maxScore !== undefined) {
          legacyScoreSeen = true;
          legacyPoints = num(q.maxScore, `${qp}.maxScore`, undefined);
        }
        const out = {
          content: isStr(q.content) ? q.content : '',
          correctAnswer: null,
          timeLimit: num(q.timeLimit, `${qp}.timeLimit`, SCORING_DEFAULTS.timeLimit, { min: 1, max: 600 }),
          points: num(q.points, `${qp}.points`, undefined) ?? legacyPoints ?? roundPoints ?? scoring.points,
          penalty: num(q.penalty, `${qp}.penalty`, undefined) ?? roundPenalty ?? scoring.penalty,
        };
        if (!out.content && !NO_ANSWER_MODES.has(mode)) err(`${qp}.content`, '문제 내용이 필요합니다.');

        // 정답을 배열로 적으면 첫 번째가 대표 정답, 나머지는 인정 답
        let correct = q.correctAnswer;
        let accept = q.acceptAnswers;
        if (Array.isArray(correct)) {
          accept = [...correct.slice(1), ...(Array.isArray(accept) ? accept : [])];
          correct = correct[0];
        }
        if (!NO_ANSWER_MODES.has(mode)) {
          if (!isStr(correct) && !isNum(correct)) {
            err(`${qp}.correctAnswer`, '정답이 필요합니다.');
          } else {
            out.correctAnswer = String(correct);
          }
        }
        if (accept !== undefined) {
          if (!Array.isArray(accept) || !accept.every((a) => isStr(a) || isNum(a) || a === '')) {
            err(`${qp}.acceptAnswers`, '다른 인정 답은 문자열 배열이어야 합니다.');
          } else {
            const list = [...new Set(accept.map((a) => String(a).trim()).filter(Boolean))];
            if (list.length && (CHOICE_MODES.has(mode) || NO_ANSWER_MODES.has(mode) || mode === GAME_MODES.LONG_TYPING)) {
              warn(`${qp}.acceptAnswers`, '이 게임 모드에서는 다른 인정 답을 쓰지 않습니다. (무시됨)');
            } else if (list.length) {
              out.acceptAnswers = list;
            }
          }
        }

        if (CHOICE_MODES.has(mode)) {
          if (!Array.isArray(q.choices) || q.choices.length < 2 || !q.choices.every((c) => isStr(c) || isNum(c))) {
            err(`${qp}.choices`, '보기가 2개 이상 필요합니다.');
          } else {
            out.choices = q.choices.map(String);
            if (out.correctAnswer !== null
              && !out.choices.some((c) => normalizeAnswer(c) === normalizeAnswer(out.correctAnswer))) {
              err(`${qp}.correctAnswer`, '정답이 보기 중에 없습니다.');
            }
          }
        }

        const imageUrl = resolveMediaUrl(q.imageUrl);
        const imageUrls = Array.isArray(q.imageUrls) ? q.imageUrls.map(resolveMediaUrl).filter(Boolean) : [];
        if (imageUrls.length) out.imageUrls = imageUrls;
        else if (imageUrl) out.imageUrls = [imageUrl];
        if (IMAGE_MODES.has(mode) && !out.imageUrls) warn(`${qp}.imageUrl`, '이미지가 없습니다. 이미지 없이 출제됩니다.');

        // 정답 공개 때 함께 보여줄 참고 이미지와 설명 (예: 정답 '서울' → 서울 사진)
        if (q.answerImage !== undefined) {
          const answerImage = resolveMediaUrl(q.answerImage);
          if (answerImage) out.answerImage = answerImage;
          else err(`${qp}.answerImage`, '이미지 경로(파일명 또는 https:// 주소)가 필요합니다.');
        }
        if (q.answerNote !== undefined) {
          if (isStr(q.answerNote)) out.answerNote = q.answerNote.trim().slice(0, 200);
          else err(`${qp}.answerNote`, '문자열이어야 합니다.');
        }

        const audioUrl = resolveMediaUrl(q.audioUrl);
        if (audioUrl) out.audioUrl = audioUrl;
        if (mode === GAME_MODES.AUDIO_QUIZ && !audioUrl) err(`${qp}.audioUrl`, '오디오가 필요합니다.');

        if (mode === GAME_MODES.CONSONANT) {
          if (isStr(q.consonantHint)) out.consonantHint = q.consonantHint;
          else err(`${qp}.consonantHint`, '초성 힌트가 필요합니다.');
        }

        if (mode === GAME_MODES.LONG_TYPING) {
          out.passAccuracy = num(q.passAccuracy ?? q.passThreshold, `${qp}.passAccuracy`, undefined, { max: 1 })
            ?? roundPass ?? SCORING_DEFAULTS.passAccuracy;
        }

        if (mode === GAME_MODES.REACTION) {
          const table = q.rankPoints ?? roundRank;
          if (table !== undefined) {
            if (Array.isArray(table) && table.every((p) => isNum(p) && p >= 0)) out.rankPoints = table;
            else err(`${qp}.rankPoints`, '0 이상의 숫자 배열이어야 합니다.');
          }
          if (!out.content) out.content = '신호가 뜨면 바로 누르세요!';
        }

        if (mode === GAME_MODES.EMOJI_FIND) {
          if (Array.isArray(q.emojiPool) && q.emojiPool.every(isStr)) out.emojiPool = q.emojiPool;
          out.setSize = num(q.setSize, `${qp}.setSize`, 3, { min: 2, integer: true });
          out.groupSize = num(q.groupSize, `${qp}.groupSize`, 2, { min: 2, integer: true });
          if (!out.content) out.content = '같은 이모지 세트를 가진 사람을 찾아 코드를 입력하세요!';
        }
        return out;
      });

      if (questions.includes(null)) return;
      rounds.push({
        roundNumber: rounds.length + 1,
        theme: isStr(r.theme) ? r.theme.trim() : `라운드 ${rounds.length + 1}`,
        gameMode: mode,
        standingsAfter: r.standingsAfter === true,
        questions,
      });
    });
  }
  if (legacyScoreSeen) {
    warn('rounds', '기존 포맷의 "maxScore"를 "points"로 읽었습니다. 이제 점수는 시간과 무관하게 고정 지급됩니다.');
  }

  // ── 점수 단위 환산 ──────────────────────────────────────
  // 100점·1000점처럼 큰 단위로 쓴 세트는 기준 점수가 scaleTo(기본 5점)가 되도록 비율로 줄인다.
  if (scoring.autoScale) {
    const all = rounds.flatMap((r) => r.questions.filter(() => r.gameMode !== GAME_MODES.REACTION).map((q) => q.points));
    const { factor, base } = scaleFactor(all.length ? all : rounds.flatMap((r) => r.questions.map((q) => q.points)), scoring.scaleTo);
    if (factor !== 1) {
      for (const r of rounds) {
        for (const q of r.questions) {
          q.points = scalePoints(q.points, factor);
          q.penalty = scalePoints(q.penalty, factor);
          if (q.rankPoints) q.rankPoints = q.rankPoints.map((p) => scalePoints(p, factor));
        }
      }
      scoring.points = scalePoints(scoring.points, factor);
      scoring.penalty = scalePoints(scoring.penalty, factor);
      warn('scoring', `점수를 ${base}점 → ${scoring.scaleTo}점 기준으로 환산했습니다 (비율 ${+(factor.toFixed(4))}). 환산하지 않으려면 "scoring": { "autoScale": false }`);
    }
  }

  // ── 시상 세트 ───────────────────────────────────────────
  let awardItems = AWARD_PRESETS.event;
  if (raw.awards !== undefined) {
    if (!isObj(raw.awards)) {
      err('awards', '객체여야 합니다.');
    } else if (Array.isArray(raw.awards.items)) {
      awardItems = raw.awards.items;
    } else if (raw.awards.preset !== undefined) {
      if (AWARD_PRESETS[raw.awards.preset]) awardItems = AWARD_PRESETS[raw.awards.preset];
      else err('awards.preset', `${Object.keys(AWARD_PRESETS).join(' / ')} 중 하나여야 합니다.`);
    }
  }
  const awards = normalizeAwards(awardItems, { teams, roundCount: rounds.length }, err, warn);

  const set = {
    sessionName: isStr(raw.sessionName) ? raw.sessionName.trim() : '레크레이션',
    scoring,
    teams,
    standingsTop: num(raw.standingsTop, 'standingsTop', 10, { min: 1, integer: true }),
    display: isObj(raw.display) ? raw.display : null,
    awards,
    rounds,
  };
  return { ok: errors.length === 0, errors, warnings, set: errors.length === 0 ? set : null };
}
