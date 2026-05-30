import MultipleChoice from './MultipleChoice.jsx';

// 이미지 기억력 — 제한시간 동안 이미지(세트)를 보면서 객관식으로 답변.
// imageUrls(여러 장) 우선, 없으면 단일 imageUrl 을 사용.
export default function ImageMemory({ question, onSubmit, hasSubmitted, correctAnswer }) {
  const images = question.imageUrls?.length
    ? question.imageUrls
    : (question.imageUrl ? [question.imageUrl] : []);

  return (
    <div className="w-full px-2 space-y-4">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {images.map((src, i) => (
            <div key={i} className="rounded-2xl overflow-hidden bg-black/40">
              <img src={src} alt="" className="w-full max-h-56 object-contain" />
            </div>
          ))}
        </div>
      )}
      <MultipleChoice
        question={question}
        onSubmit={onSubmit}
        hasSubmitted={hasSubmitted}
        correctAnswer={correctAnswer}
        compact
      />
    </div>
  );
}
