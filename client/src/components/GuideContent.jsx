import { motion } from 'framer-motion';

export const MODES = [
  {
    icon: '🔢',
    title: '객관식',
    sub: 'Multiple Choice',
    color: 'from-red-100 to-blue-100 border-red-200',
    desc: '화면에 표시된 4개의 보기 중 정답을 고르세요.',
    tip: '빨리 맞힐수록 더 높은 점수! 제출 후 버튼 색이 바뀝니다.',
    how: '① ② ③ ④ 버튼 중 하나를 탭하면 즉시 제출됩니다.',
  },
  {
    icon: '✏️',
    title: '단답형',
    sub: 'Short Answer',
    color: 'from-purple-100 to-purple-50 border-purple-200',
    desc: '프로젝터 화면의 문제를 보고 답을 직접 입력하세요.',
    tip: '띄어쓰기, 대소문자는 무시됩니다. 핵심 단어만 입력해도 OK!',
    how: '텍스트 칸에 답 입력 → 제출하기 버튼.',
  },
  {
    icon: '🔤',
    title: '초성 퀴즈',
    sub: 'Consonant Quiz',
    color: 'from-yellow-100 to-yellow-50 border-yellow-200',
    desc: '초성 힌트를 보고 단어를 맞혀보세요.',
    tip: '예: ㅅㅇ → 서울, ㄷㅎㅁㄱ → 대한민국',
    how: '초성 힌트가 화면에 크게 표시됩니다. 단어 입력 후 제출!',
  },
  {
    icon: '❓',
    title: '빈칸 맞추기',
    sub: 'Word Guess',
    color: 'from-teal-100 to-teal-50 border-teal-200',
    desc: '빈칸(__) 이 있는 문장을 보고 빠진 단어를 입력하세요.',
    tip: '예: 사 __ 나 무 → 소나무',
    how: '빈칸 단어만 입력하면 됩니다.',
  },
  {
    icon: '🖼️',
    title: '이미지 퀴즈',
    sub: 'Image Quiz',
    color: 'from-blue-100 to-blue-50 border-blue-200',
    desc: '이미지를 보고 정답을 입력하세요.',
    tip: '이미지는 프로젝터 화면에 크게 표시됩니다.',
    how: '답 입력 후 제출하기 버튼.',
  },
  {
    icon: '🎵',
    title: '노래 퀴즈',
    sub: 'Audio Quiz',
    color: 'from-indigo-100 to-indigo-50 border-indigo-200',
    desc: '흘러나오는 음악을 듣고 곡명이나 정답을 입력하세요.',
    tip: '음악은 프로젝터에서 재생됩니다. 잘 들어보세요!',
    how: '휴대폰에서 ▶ 버튼으로도 들을 수 있습니다.',
  },
  {
    icon: '⚡',
    title: '반응게임',
    sub: 'Reaction Game',
    color: 'from-green-100 to-green-50 border-green-200',
    desc: '신호가 뜨는 순간 버튼을 눌러 반응 속도를 겨루세요!',
    tip: '신호 전에 미리 누르면 안 됩니다. 노란 화면이 뜨는 순간 누르세요!',
    how: '준비 → 노란 화면 등장 → 즉시 탭!',
  },
];

// 게임 모드 안내 본문 (GuidePage 와 진행 중 모달에서 공용)
export default function GuideContent({ animate = true }) {
  return (
    <>
      <div className="space-y-4">
        {MODES.map((m, idx) => (
          <motion.div
            key={m.sub}
            initial={animate ? { opacity: 0, y: 20 } : false}
            animate={animate ? { opacity: 1, y: 0 } : false}
            transition={{ delay: idx * 0.05 }}
            className={`bg-gradient-to-br ${m.color} border rounded-2xl p-5`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{m.icon}</span>
              <div>
                <h2 className="text-slate-800 font-bold text-lg leading-tight">{m.title}</h2>
                <p className="text-slate-500 text-xs">{m.sub}</p>
              </div>
            </div>
            <p className="text-slate-700 text-sm mb-2">{m.desc}</p>
            <div className="bg-white/60 rounded-xl px-4 py-3 space-y-1">
              <p className="text-purple-700 text-xs">
                <span className="font-semibold">조작: </span>{m.how}
              </p>
              <p className="text-amber-600 text-xs">
                <span className="font-semibold">팁: </span>{m.tip}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 bg-white/70 border border-slate-200 rounded-2xl p-4 text-center">
        <p className="text-slate-700 text-sm font-semibold mb-1">채점 방식</p>
        <p className="text-slate-500 text-xs">빨리 정답을 맞힐수록 높은 점수 (최대 1000점)</p>
        <p className="text-slate-500 text-xs">오답 제출 시 페널티 점수 차감</p>
        <p className="text-slate-500 text-xs mt-2">반응게임은 빠른 순서대로 점수 차등 지급</p>
      </div>
    </>
  );
}
