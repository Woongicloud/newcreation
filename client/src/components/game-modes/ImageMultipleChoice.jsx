import MultipleChoice from './MultipleChoice.jsx';

// 이미지 + 4지선다 — 상단 이미지, 하단은 기존 객관식 버튼 재사용
export default function ImageMultipleChoice({ question, onSubmit, hasSubmitted, correctAnswer }) {
  return (
    <div className="w-full px-2 space-y-4">
      {question.imageUrl && (
        <div className="rounded-2xl overflow-hidden bg-black/40">
          <img
            src={question.imageUrl}
            alt="퀴즈 이미지"
            className="w-full max-h-52 object-contain"
          />
        </div>
      )}
      <MultipleChoice
        question={question}
        onSubmit={onSubmit}
        hasSubmitted={hasSubmitted}
        correctAnswer={correctAnswer}
      />
    </div>
  );
}
