import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/connection.js';
import { Panel, btn, btnPrimary } from './ui.jsx';

// 문제·정답용 이미지 올리기. 올린 파일의 주소를 복사해 세트 JSON 의
// imageUrl / answerImage 에 붙여 넣는다 (리포에 넣고 다시 배포하지 않아도 된다).
export default function QuestionMedia({ token, flash }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function load() {
    const res = await api('/api/media?kind=question', { token });
    if (res.status === 503) return setAvailable(false);
    if (res.ok) setFiles(res.files);
  }
  useEffect(() => { load(); }, []);

  async function upload(e) {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    setBusy(true);
    let failed = 0;
    for (const file of list) {
      const ticket = await api('/api/media/upload-url', { method: 'POST', token, body: { filename: file.name, kind: 'question' } });
      const put = ticket.ok
        ? await fetch(ticket.signedUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }).catch(() => null)
        : null;
      if (!put?.ok) failed += 1;
    }
    setBusy(false);
    if (failed) flash(`${failed}개 파일을 올리지 못했습니다.`);
    load();
  }

  function copy(url) {
    navigator.clipboard?.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(''), 1500); });
  }

  return (
    <Panel title="문제·정답 이미지" className="lg:col-span-2"
      action={available && <button className={btn} onClick={load}>새로고침</button>}>
      <p className="text-sm text-slate-400">
        이미지를 올리고 주소를 복사해 세트 JSON에 넣으세요. 문제 이미지는 <code>imageUrl</code>, 정답 공개 때 보여줄 사진은 <code>answerImage</code>.
        예: <code>{'{ "correctAnswer": "서울", "answerImage": "https://…" }'}</code>
      </p>
      {available ? (
        <>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={upload} />
          <button className={btnPrimary} disabled={busy} onClick={() => fileRef.current.click()}>{busy ? '올리는 중…' : '⬆ 이미지 올리기 (여러 장 가능)'}</button>
          {files?.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {files.map((f) => (
                <button key={f.path} onClick={() => copy(f.publicUrl)} title="주소 복사"
                  className="relative h-24 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 group">
                  <img src={f.publicUrl} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 text-xs py-1">{copied === f.publicUrl ? '복사됨' : '주소 복사'}</span>
                </button>
              ))}
            </div>
          )}
          {files?.length === 0 && <p className="text-xs text-slate-500">아직 올린 이미지가 없습니다.</p>}
        </>
      ) : (
        <p className="text-xs text-amber-400">
          서버에 스토리지(Supabase)가 연결되지 않아 올리기를 쓸 수 없습니다. 이미지를 <code>client/public/media/</code>에 넣고 파일명만 적거나, https:// 주소를 직접 적으세요.
        </p>
      )}
    </Panel>
  );
}
