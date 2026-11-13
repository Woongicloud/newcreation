import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_MODES, PHASES } from '@shared/protocol.js';
import { useRoom, joinRoom, leaveRoom, request, EVENTS } from '../../lib/connection.js';
import { playerSession } from '../../lib/session.js';
import { MODE_LABEL, memberLabel, signed } from '../../lib/labels.js';
import Timer from '../../components/Timer.jsx';
import FloatingScore from '../../components/FloatingScore.jsx';
import ChatInput from '../../components/chat/ChatInput.jsx';
import GameGuideModal from '../../components/GameGuideModal.jsx';
import ConnectionBanner from '../../components/ConnectionBanner.jsx';
import MultipleChoice from '../../components/game-modes/MultipleChoice.jsx';
import ShortAnswer from '../../components/game-modes/ShortAnswer.jsx';
import ConsonantQuiz from '../../components/game-modes/ConsonantQuiz.jsx';
import WordGuess from '../../components/game-modes/WordGuess.jsx';
import ImageQuiz from '../../components/game-modes/ImageQuiz.jsx';
import AudioQuiz from '../../components/game-modes/AudioQuiz.jsx';
import ReactionGame from '../../components/game-modes/ReactionGame.jsx';
import ImageMultipleChoice from '../../components/game-modes/ImageMultipleChoice.jsx';
import ImageMemory from '../../components/game-modes/ImageMemory.jsx';
import EmojiFind from '../../components/game-modes/EmojiFind.jsx';
import LongTyping from '../../components/game-modes/LongTyping.jsx';

const TEXT_MODES = {
  [GAME_MODES.SHORT_ANSWER]: ShortAnswer,
  [GAME_MODES.CONSONANT]: ConsonantQuiz,
  [GAME_MODES.WORD_GUESS]: WordGuess,
  [GAME_MODES.IMAGE_QUIZ]: ImageQuiz,
  [GAME_MODES.AUDIO_QUIZ]: AudioQuiz,
  [GAME_MODES.MULTIPLE_CHOICE]: MultipleChoice,
  [GAME_MODES.IMAGE_MULTIPLE_CHOICE]: ImageMultipleChoice,
  [GAME_MODES.IMAGE_MEMORY]: ImageMemory,
};

const Card = ({ children }) => (
  <div className="flex-1 flex items-center justify-center px-4">
    <div className="w-full max-w-sm text-center bg-white/80 backdrop-blur rounded-3xl px-6 py-8 shadow-lg">{children}</div>
  </div>
);

// 문제 화면 — 접수 중·마감·정답 공개를 같은 컴포넌트로 그린다
function QuestionView({ state }) {
  const { question, me, phase, reaction } = state;
  const lastResult = useRoom((s) => s.lastResult);
  const resultNonce = useRoom((s) => s.resultNonce);
  const [wrongNonce, setWrongNonce] = useState(0);
  const [notice, setNotice] = useState('');
  const open = phase === PHASES.QUESTION_OPEN;
  const revealed = phase === PHASES.QUESTION_REVEAL;
  const mode = question.gameMode;
  const locked = me.answered || !open;

  // 이모지 찾기 오답 → 흔들림
  useEffect(() => {
    if (lastResult?.retry) setWrongNonce((n) => n + 1);
  }, [resultNonce]);

  async function submit(answer) {
    const res = await request(EVENTS.PLAYER_ANSWER, { answer });
    if (!res.ok) { setNotice(res.message || '제출하지 못했습니다.'); setTimeout(() => setNotice(''), 2000); }
  }
  const react = (clientMs) => request(EVENTS.PLAYER_REACT, { clientMs });

  // 기존 모드 컴포넌트는 imageUrl 하나를 받는다
  const q = { ...question, imageUrl: question.imageUrls?.[0] };
  const answer = revealed ? question.correctAnswer : null;
  const Text = TEXT_MODES[mode];

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-2">
      <div className="flex justify-center">
        {open ? <Timer /> : (
          <p className="px-4 py-2 rounded-full bg-slate-800 text-white text-sm font-bold">
            {revealed ? '정답 공개' : '접수 마감 — 정답 공개를 기다려주세요'}
          </p>
        )}
      </div>
      {notice && <p className="text-center text-red-600 text-sm font-semibold">{notice}</p>}

      <div className="relative">
        {Text && <Text key={question.id} question={q} onSubmit={submit} hasSubmitted={locked} correctAnswer={answer} submittedAnswer={me.answer} />}
        {mode === GAME_MODES.LONG_TYPING && (
          <LongTyping key={question.id} onSubmit={submit} hasSubmitted={me.answered} lastResult={me.result} timeExpired={!open} submittedAnswer={me.answer} />
        )}
        {mode === GAME_MODES.REACTION && (
          <ReactionGame key={question.id} signaled={!!reaction?.signaled} answered={me.answered} closed={!open} result={me.result} onReact={react} />
        )}
        {mode === GAME_MODES.EMOJI_FIND && (
          <EmojiFind key={question.id} assign={me.emoji} onSubmitCode={submit} hasSubmitted={me.answered || !open} wrongNonce={wrongNonce} />
        )}
        {revealed && <FloatingScore key={`score-${question.id}`} result={me.result} answered={me.answered} gameMode={mode} />}
      </div>

      {revealed && (question.answerImage || question.answerNote) && (
        <div className="rounded-2xl bg-white/90 shadow p-3 space-y-2">
          {question.answerImage && <img src={question.answerImage} alt="" className="w-full max-h-64 object-contain rounded-xl" />}
          {question.answerNote && <p className="text-center text-slate-700 text-sm font-semibold">{question.answerNote}</p>}
        </div>
      )}

      {open && me.answered && mode !== GAME_MODES.EMOJI_FIND && (
        <p className="text-center text-slate-600 text-sm bg-white/70 rounded-xl py-2">제출 완료 — 정답 공개를 기다려주세요</p>
      )}
    </div>
  );
}

export default function PlayPage() {
  const navigate = useNavigate();
  const state = useRoom((s) => s.state);
  const closed = useRoom((s) => s.closed);
  const rejoinFailed = useRoom((s) => s.rejoinFailed);
  const [showGuide, setShowGuide] = useState(false);

  // 새로고침으로 들어온 경우 저장된 토큰으로 복귀
  useEffect(() => {
    if (state) return;
    const saved = playerSession.get();
    if (!saved?.token) return navigate('/', { replace: true });
    joinRoom({ roomCode: saved.roomCode, token: saved.token }).then((res) => {
      if (!res.ok && res.error !== 'network') { playerSession.set({ name: saved.name }); navigate('/', { replace: true }); }
    });
  }, []);

  // 방이 닫혔거나 내보내진 경우
  useEffect(() => {
    if (!closed && !rejoinFailed) return;
    playerSession.set({ name: playerSession.get()?.name });
    leaveRoom();
    navigate('/', { replace: true });
  }, [closed, rejoinFailed]);

  if (!state?.me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pinwheel">
        <ConnectionBanner />
        <p className="bg-white/80 rounded-2xl px-8 py-6 text-slate-700 font-semibold shadow-lg">접속 중…</p>
      </div>
    );
  }

  const { me, phase, position, standings } = state;
  const inQuestion = !!state.question;

  let body;
  if (standings) {
    // 집계가 떠 있는 동안: 내 순위와 점수
    body = (
      <Card>
        <p className="text-slate-500 text-sm">📊 {standings.scope === 'round' ? '이번 라운드 집계' : '중간 집계'}</p>
        <p className="text-6xl font-black text-purple-700 my-3">{me.rank}<span className="text-2xl">등</span></p>
        <p className="text-amber-600 text-3xl font-bold font-mono">{me.score.toLocaleString()}점</p>
        <p className="text-slate-500 text-sm mt-3">전체 {state.playerCount}명 · 상위 순위는 화면에서 확인하세요</p>
      </Card>
    );
  } else if (inQuestion) {
    body = <QuestionView state={state} />;
  } else if (phase === PHASES.LOBBY) {
    body = (
      <Card>
        <div className="text-5xl mb-3 animate-pulse">🎮</div>
        <p className="text-slate-800 text-xl font-bold">{me.name} 님, 입장 완료!</p>
        <p className="text-purple-700 font-semibold mt-1">{memberLabel(me)}</p>
        <p className="text-slate-500 text-sm mt-4">곧 게임이 시작됩니다. 화면을 켜 두세요.</p>
      </Card>
    );
  } else if (phase === PHASES.ROUND_INTRO) {
    body = (
      <Card>
        <p className="text-slate-500 text-sm">라운드 {position.round + 1} / {position.roundCount}</p>
        <p className="text-slate-800 text-2xl font-bold my-2">{position.theme}</p>
        <p className="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-bold">{MODE_LABEL[position.gameMode]}</p>
        <p className="text-slate-500 text-sm mt-4">문제 {position.questionCount}개 · 곧 시작합니다</p>
      </Card>
    );
  } else if (phase === PHASES.ROUND_END) {
    body = (
      <Card>
        <p className="text-slate-500 text-sm">라운드 {position.round + 1} 종료</p>
        <p className="text-amber-600 text-4xl font-bold font-mono my-3">{me.score.toLocaleString()}점</p>
        <p className="text-slate-500 text-sm">다음 라운드를 기다려주세요</p>
      </Card>
    );
  } else if (phase === PHASES.FINAL || phase === PHASES.AWARDS) {
    body = (
      <Card>
        <div className="text-5xl mb-3">🏁</div>
        <p className="text-slate-800 text-xl font-bold">게임 종료!</p>
        <p className="text-amber-600 text-4xl font-bold font-mono my-3">{me.score.toLocaleString()}점</p>
        <p className="text-purple-700 font-bold">최종 {me.rank}등 / {state.playerCount}명</p>
        <p className="text-slate-500 text-sm mt-4">
          {state.award ? `🏆 ${state.award.title} — 화면을 봐주세요` : '시상을 기다려주세요'}
        </p>
      </Card>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-pinwheel">
      <ConnectionBanner />
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white/70 backdrop-blur border-b border-slate-200 shrink-0">
        <div className="min-w-0">
          {position ? (
            <>
              <p className="text-slate-500 text-xs truncate">R{position.round + 1} · {position.theme}</p>
              <p className="text-slate-800 text-sm font-semibold">
                {inQuestion ? `Q${position.question + 1} / ${position.questionCount}` : MODE_LABEL[position.gameMode]}
                {inQuestion && state.question.points > 0 && (
                  <span className="ml-2 text-xs text-slate-500 font-normal">
                    {signed(state.question.points)}{state.question.penalty ? ` / -${state.question.penalty}` : ''}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-slate-700 text-sm font-semibold truncate">{state.sessionName}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGuide(true)}
            className="text-xs font-semibold text-purple-700 bg-white/80 border border-purple-200 rounded-full px-3 py-1.5 active:scale-95 transition-transform touch-target"
          >
            ❓ 게임방법
          </button>
          <div className="text-right">
            <p className="text-slate-500 text-xs truncate max-w-[6rem]">{me.name}</p>
            <p className="text-amber-600 text-lg font-bold font-mono">{me.score.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">{body}</div>
      <div className="shrink-0"><ChatInput /></div>
      <GameGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
