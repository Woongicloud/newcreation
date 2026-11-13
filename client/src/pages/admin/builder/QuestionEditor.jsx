import { useState } from 'react';
import { GAME_MODES as M } from '@shared/protocol.js';
import { CHOICE_LABELS } from '../../../lib/choiceColors.js';
import { MODE_FIELDS, HAS_ANSWER, CHOICE_MODES, chosung } from './model.js';
import { btn, input } from '../ui.jsx';

const label = 'block text-xs text-slate-400 mb-1';
const box = `${input} w-full`;

// 이미지·오디오 주소 입력 + 미리보기 + 올린 파일에서 고르기
export function MediaField({ title, value, onChange, files, kind = 'image', placeholder }) {
  const [picking, setPicking] = useState(false);
  const url = value?.trim();
  const preview = url && (url.startsWith('http') || url.startsWith('/')) ? url : url ? `/media/${url}` : null;
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex gap-2 items-start">
        <input className={`${box} flex-1`} value={value || ''} placeholder={placeholder || '파일명(media 폴더) 또는 https:// 주소'}
          onChange={(e) => onChange(e.target.value)} />
        {files?.length > 0 && kind === 'image' && <button type="button" className={btn} onClick={() => setPicking((v) => !v)}>올린 이미지</button>}
      </div>
      {picking && (
        <div className="mt-2 grid grid-cols-4 md:grid-cols-8 gap-1 max-h-40 overflow-y-auto rounded-lg bg-slate-950 p-1">
          {files.map((f) => (
            <button type="button" key={f.path} onClick={() => { onChange(f.publicUrl); setPicking(false); }}
              className="h-14 rounded overflow-hidden border border-slate-700 hover:border-sky-400">
              <img src={f.publicUrl} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {preview && kind === 'image' && <img src={preview} alt="" className="mt-2 h-20 rounded border border-slate-700 object-contain bg-slate-950" />}
      {preview && kind === 'audio' && <audio src={preview} controls className="mt-2 h-8 w-full" />}
    </div>
  );
}

export default function QuestionEditor({ uid, mode, q, index, total, errors = [], files, onChange, onMove, onDuplicate, onDelete }) {
  const fields = MODE_FIELDS[mode] || [];
  const set = (patch) => onChange({ ...q, ...patch });
  const num = (v) => (v === '' ? undefined : Number(v));
  const errFor = (name) => errors.filter((e) => e.field === name || e.field.startsWith(`${name}[`) || e.field.startsWith(`${name}.`));
  const ErrorText = ({ name }) => errFor(name).map((e, i) => <p key={i} className="text-xs text-red-400 mt-1">{e.message}</p>);
  const [extra, setExtra] = useState(Boolean(q.answerImage || q.answerNote || q.points !== undefined || q.penalty !== undefined));

  return (
    <div className={`rounded-xl border p-3 space-y-3 ${errors.length ? 'border-red-700 bg-red-950/20' : 'border-slate-800 bg-slate-950'}`}>
      <div className="flex items-center gap-2">
        <span className="font-bold text-sky-300">Q{index + 1}</span>
        {errors.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-800">오류 {errors.length}</span>}
        <span className="flex-1" />
        <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(-1)} title="위로">↑</button>
        <button type="button" className={btn} disabled={index === total - 1} onClick={() => onMove(1)} title="아래로">↓</button>
        <button type="button" className={btn} onClick={onDuplicate} title="복제">복제</button>
        <button type="button" className={`${btn} !text-red-300`} onClick={onDelete} disabled={total === 1} title="삭제">삭제</button>
      </div>

      <div>
        <span className={label}>{mode === M.WORD_GUESS ? '문제 (빈칸은 _ 로)' : '문제'}</span>
        <textarea className={`${box} min-h-[3rem]`} rows={2} value={q.content || ''} onChange={(e) => set({ content: e.target.value })} />
        <ErrorText name="content" />
      </div>

      {fields.includes('imageUrl') && (
        <div><MediaField title="문제 이미지" value={q.imageUrl} files={files} onChange={(v) => set({ imageUrl: v })} /><ErrorText name="imageUrl" /></div>
      )}

      {fields.includes('imageUrls') && (
        <div className="space-y-2">
          {(q.imageUrls || ['']).map((u, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <MediaField title={`이미지 ${i + 1}`} value={u} files={files}
                  onChange={(v) => set({ imageUrls: (q.imageUrls || ['']).map((x, j) => (j === i ? v : x)) })} />
              </div>
              {(q.imageUrls || []).length > 1 && (
                <button type="button" className={btn} onClick={() => set({ imageUrls: q.imageUrls.filter((_, j) => j !== i) })}>빼기</button>
              )}
            </div>
          ))}
          <button type="button" className={btn} onClick={() => set({ imageUrls: [...(q.imageUrls || []), ''] })}>+ 이미지 추가</button>
          <ErrorText name="imageUrl" />
        </div>
      )}

      {fields.includes('audioUrl') && (
        <div><MediaField title="오디오 파일" kind="audio" value={q.audioUrl} files={files} onChange={(v) => set({ audioUrl: v })} placeholder="파일명(media 폴더) 또는 https:// 주소 (mp3 등)" /><ErrorText name="audioUrl" /></div>
      )}

      {CHOICE_MODES.has(mode) && (
        <div>
          <span className={label}>보기 — 정답에 체크</span>
          <div className="grid md:grid-cols-2 gap-2">
            {(q.choices || []).map((c, i) => (
              <label key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 border ${c && c === q.correctAnswer ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800'}`}>
                <input type="radio" name={`ans-${uid}`} checked={!!c && c === q.correctAnswer} disabled={!c}
                  onChange={() => set({ correctAnswer: c })} className="accent-emerald-500" />
                <span className="text-slate-400 w-5">{CHOICE_LABELS[i] || i + 1}</span>
                <input className={`${input} flex-1`} value={c} placeholder={`보기 ${i + 1}`}
                  onChange={(e) => {
                    const choices = q.choices.map((x, j) => (j === i ? e.target.value : x));
                    set({ choices, correctAnswer: q.correctAnswer === c ? e.target.value : q.correctAnswer });
                  }} />
                {q.choices.length > 2 && (
                  <button type="button" className="text-slate-500 hover:text-red-300 px-1" title="보기 빼기"
                    onClick={() => set({ choices: q.choices.filter((_, j) => j !== i), correctAnswer: q.correctAnswer === c ? '' : q.correctAnswer })}>✕</button>
                )}
              </label>
            ))}
          </div>
          {(q.choices || []).length < 6 && <button type="button" className={`${btn} mt-2`} onClick={() => set({ choices: [...q.choices, ''] })}>+ 보기 추가</button>}
          <ErrorText name="choices" /><ErrorText name="correctAnswer" />
        </div>
      )}

      {fields.includes('correctAnswer') && (
        <div>
          <span className={label}>정답</span>
          <input className={box} value={q.correctAnswer || ''} onChange={(e) => set({ correctAnswer: e.target.value })} />
          <ErrorText name="correctAnswer" />
        </div>
      )}

      {fields.includes('consonantHint') && (
        <div>
          <span className={label}>초성 힌트</span>
          <div className="flex gap-2">
            <input className={`${box} flex-1 tracking-widest`} value={q.consonantHint || ''} onChange={(e) => set({ consonantHint: e.target.value })} />
            <button type="button" className={btn} disabled={!q.correctAnswer} onClick={() => set({ consonantHint: chosung(q.correctAnswer) })}>초성 자동</button>
          </div>
          <ErrorText name="consonantHint" />
        </div>
      )}

      {fields.includes('targetText') && (
        <div>
          <span className={label}>원문 (참가자가 따라 칠 글 — 프로젝터에만 표시)</span>
          <textarea className={`${box} min-h-[4rem]`} rows={3} value={q.correctAnswer || ''} onChange={(e) => set({ correctAnswer: e.target.value })} />
          <ErrorText name="correctAnswer" />
        </div>
      )}

      {fields.includes('passAccuracy') && (
        <label className="block">
          <span className={label}>통과 정확도 (%) — 이 이상이면 정답</span>
          <input type="number" min={1} max={100} className={`${input} w-28`} value={q.passAccuracy !== undefined ? Math.round(q.passAccuracy * 100) : ''} placeholder="90"
            onChange={(e) => set({ passAccuracy: e.target.value === '' ? undefined : Number(e.target.value) / 100 })} />
        </label>
      )}

      {fields.includes('emoji') && (
        <div className="grid md:grid-cols-3 gap-2">
          <label><span className={label}>세트당 이모지 수</span>
            <input type="number" min={2} className={`${input} w-full`} value={q.setSize ?? ''} onChange={(e) => set({ setSize: num(e.target.value) })} /></label>
          <label><span className={label}>같은 세트 인원</span>
            <input type="number" min={2} className={`${input} w-full`} value={q.groupSize ?? ''} onChange={(e) => set({ groupSize: num(e.target.value) })} /></label>
          <label className="md:col-span-3"><span className={label}>이모지 목록 (비우면 기본 목록, 띄어쓰기로 구분)</span>
            <input className={box} value={(q.emojiPool || []).join(' ')} placeholder="🐶 🐱 🦁 🐰 🐻 …"
              onChange={(e) => set({ emojiPool: e.target.value.split(/\s+/).filter(Boolean) })} /></label>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label><span className={label}>제한 시간(초)</span>
          <input type="number" min={1} className={`${input} w-24`} value={q.timeLimit ?? ''} onChange={(e) => set({ timeLimit: num(e.target.value) })} /></label>
        <button type="button" className="text-xs text-sky-300 underline pb-2" onClick={() => setExtra((v) => !v)}>
          {extra ? '추가 설정 접기' : '점수·정답 사진 설정'}
        </button>
        <ErrorText name="timeLimit" />
      </div>

      {extra && (
        <div className="grid md:grid-cols-2 gap-3 rounded-lg border border-slate-800 p-3">
          <label><span className={label}>이 문제 점수 (비우면 라운드·세트 기본)</span>
            <input type="number" min={0} className={`${input} w-28`} value={q.points ?? ''} onChange={(e) => set({ points: num(e.target.value) })} /></label>
          {HAS_ANSWER(mode) && (
            <label><span className={label}>이 문제 감점 (비우면 기본)</span>
              <input type="number" min={0} className={`${input} w-28`} value={q.penalty ?? ''} onChange={(e) => set({ penalty: num(e.target.value) })} /></label>
          )}
          {HAS_ANSWER(mode) && (
            <>
              <div className="md:col-span-2">
                <MediaField title="정답 공개 때 보여줄 사진 (선택)" value={q.answerImage} files={files} onChange={(v) => set({ answerImage: v })} />
                <ErrorText name="answerImage" />
              </div>
              <label className="md:col-span-2"><span className={label}>정답 아래 한 줄 설명 (선택)</span>
                <input className={box} maxLength={200} value={q.answerNote || ''} onChange={(e) => set({ answerNote: e.target.value })} /></label>
            </>
          )}
          <ErrorText name="points" /><ErrorText name="penalty" />
        </div>
      )}
    </div>
  );
}
