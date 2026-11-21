import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/connection.js';
import { uploadFile, formatSize } from '../../lib/upload.js';
import { Panel, btn, btnPrimary, input } from './ui.jsx';

const FILTERS = [
  ['all', '전체'],
  ['image', '사진'],
  ['audio', '음원'],
  ['video', '영상'],
  ['background', '배경'],
];
const TYPE_ICON = { image: '🖼', audio: '🎵', video: '🎞', other: '📄' };
// 이보다 크면 로딩이 느릴 수 있다고 알린다
const BIG = { image: 5 * 1024 * 1024, audio: 25 * 1024 * 1024, video: 60 * 1024 * 1024, other: Infinity };

function FileRow({ file, token, flash, onChanged, catalog }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(file.name);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    if (!name.trim() || name.trim() === file.name) { setEditing(false); setName(file.name); return; }
    setBusy(true);
    const res = await api('/api/media', { method: 'PATCH', token, body: { path: file.path, name } });
    setBusy(false);
    if (!res.ok) return flash(res.message || '이름을 바꾸지 못했습니다.');
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`"${file.name}" 을(를) 삭제합니다.\n이 파일을 쓰는 문제·배경에서는 더 이상 보이거나 들리지 않습니다. 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    const res = await api('/api/media', { method: 'DELETE', token, body: { path: file.path } });
    setBusy(false);
    if (!res.ok) return flash(res.message || '삭제하지 못했습니다.');
    onChanged();
  }

  function copy() {
    navigator.clipboard?.writeText(file.publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-950 border border-slate-800 p-2">
      <div className="w-20 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center text-2xl">
        {file.type === 'image' ? <img src={file.publicUrl} alt="" className="w-full h-full object-cover" /> : TYPE_ICON[file.type]}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {editing ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className={`${input} flex-1`} autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setName(file.name); } }} />
            <button className={btnPrimary} disabled={busy}>저장</button>
            <button type="button" className={btn} onClick={() => { setEditing(false); setName(file.name); }}>취소</button>
          </form>
        ) : (
          <p className="font-semibold truncate" title={file.name}>{file.name}</p>
        )}
        <p className="text-xs text-slate-500">
          {file.folder === 'backgrounds' ? '배경' : '문제·정답용'} · {formatSize(file.size) || '크기 정보 없음'}
          {file.createdAt ? ` · ${new Date(file.createdAt).toLocaleDateString('ko-KR')}` : ''}
        </p>
        {/* 영상(mp4·webm)도 음원 칸에 넣으면 소리만 재생된다 — 여기서 소리를 미리 들어볼 수 있다 */}
        {(file.type === 'audio' || file.type === 'video') && <audio src={file.publicUrl} controls preload="none" className="h-8 w-full max-w-sm" />}
        {file.type === 'video' && <p className="text-xs text-sky-300">🎵 음원으로도 쓸 수 있습니다 (소리만 재생)</p>}
        {file.size > BIG[file.type] && (
          <p className="text-xs text-amber-400">⚠️ 용량이 커서({formatSize(file.size)}) 프로젝터에서 늦게 뜰 수 있습니다. 가능하면 더 작은 파일로 올려주세요.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1 justify-end shrink-0">
        <button className={btn} onClick={copy}>{copied ? '복사됨' : '주소 복사'}</button>
        {!editing && <button className={btn} disabled={!catalog} title={catalog ? '' : '이름 저장 테이블이 필요합니다'} onClick={() => setEditing(true)}>이름 변경</button>}
        <button className={`${btn} !text-red-300`} disabled={busy} onClick={remove}>삭제</button>
      </div>
    </div>
  );
}

// ⑥ 파일 — 레크레이션용으로 올린 사진·음원·영상·배경 관리
export default function MediaTab({ token, flash }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState(null);
  const [state, setState] = useState({ available: true, catalog: true, error: '' });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('question');
  const [progress, setProgress] = useState('');

  async function load() {
    const res = await api('/api/media?kind=all', { token });
    if (res.status === 503) return setState({ available: false, catalog: false, error: '' });
    if (!res.ok) return setState((s) => ({ ...s, error: res.message || '목록을 불러오지 못했습니다.' }));
    setFiles(res.files);
    setState({ available: true, catalog: res.catalog !== false, error: '' });
  }
  useEffect(() => { load(); }, []);

  async function upload(e) {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    const failed = [];
    for (const [i, file] of list.entries()) {
      const res = await uploadFile(token, file, folder, (step) => setProgress(`${step} ${i + 1}/${list.length} — ${file.name}`));
      if (!res.ok) failed.push(res.message);
    }
    setProgress('');
    if (failed.length) flash(failed.join(' / '));
    load();
  }

  const shown = useMemo(() => (files || []).filter((f) => {
    if (filter === 'background') { if (f.folder !== 'backgrounds') return false; }
    else if (filter === 'audio') { if (f.type !== 'audio' && f.type !== 'video') return false; } // 음원: 영상의 소리도 쓸 수 있다
    else if (filter !== 'all' && f.type !== filter) return false;
    return !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase());
  }), [files, filter, query]);

  const counts = useMemo(() => {
    const c = { all: 0, image: 0, audio: 0, video: 0, background: 0 };
    for (const f of files || []) {
      c.all += 1;
      if (c[f.type] !== undefined) c[f.type] += 1;
      if (f.type === 'video') c.audio += 1;
      if (f.folder === 'backgrounds') c.background += 1;
    }
    return c;
  }, [files]);

  if (!state.available) {
    return (
      <Panel title="파일">
        <p className="text-sm text-amber-400">
          서버에 스토리지(Supabase)가 연결되지 않아 파일을 올리거나 관리할 수 없습니다. 파일을 <code>client/public/media/</code>에 넣고 파일명만 적거나, https:// 주소를 직접 적어 쓰세요.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="파일 올리기" action={<button className={btn} onClick={load}>새로고침</button>}>
        <p className="text-sm text-slate-400">
          사진(png·jpg·gif·webp·svg), 음원(mp3·wav·m4a·ogg·aac), 영상(mp4·webm)을 올릴 수 있습니다. 여러 개를 한 번에 골라도 됩니다.
          <b className="text-slate-300"> mp4 영상도 음원으로 쓸 수 있습니다</b>(소리만 재생). 큰 사진(1.5MB 이상)은 올릴 때 자동으로 줄여 빨리 뜨게 합니다.
          올린 뒤 "주소 복사"로 받은 주소를 문제 세트의 <code>imageUrl</code>·<code>audioUrl</code>·<code>answerImage</code>·<code>answerAudio</code>에 넣거나,
          ⑤ 문제 만들기에서 "올린 파일"로 고르세요. 문제 세트에 <b className="text-slate-300">여기 보이는 파일 이름만 적어도</b> 방에 적용할 때 자동으로 연결됩니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select className={input} value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="question">문제·정답용</option>
            <option value="background">Display 배경용</option>
          </select>
          <input ref={fileRef} type="file" multiple accept="image/*,audio/*,video/mp4,video/webm,.mp3,.m4a,.aac,.wav,.ogg,.mp4,.webm" className="hidden" onChange={upload} />
          <button className={btnPrimary} disabled={!!progress} onClick={() => fileRef.current.click()}>⬆ 파일 올리기</button>
          {progress && <span className="text-sm text-sky-300">{progress}</span>}
        </div>
        {!state.catalog && (
          <p className="text-xs text-amber-400">
            파일 이름을 저장할 테이블이 아직 없어 원래 이름 대신 저장 이름이 보이고, 이름 변경을 할 수 없습니다.
            Supabase SQL Editor에서 <code>supabase/migrations/002_media_files.sql</code>을 한 번 실행해주세요. (올리기·삭제는 지금도 됩니다)
          </p>
        )}
        {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      </Panel>

      <Panel title={`올린 파일 ${files ? files.length : ''}개`}
        action={<input className={input} placeholder="이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />}>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold ${filter === id ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
              {label} {counts[id]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">이름을 바꿔도 파일 주소는 그대로라, 이미 문제 세트에 넣은 주소는 계속 작동합니다.</p>
        {files === null && <p className="text-sm text-slate-400">불러오는 중…</p>}
        {files && shown.length === 0 && <p className="text-sm text-slate-400">파일이 없습니다.</p>}
        <div className="space-y-2">
          {shown.map((f) => <FileRow key={f.path} file={f} token={token} flash={flash} onChanged={load} catalog={state.catalog} />)}
        </div>
      </Panel>
    </div>
  );
}
