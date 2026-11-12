import { useEffect, useRef, useState } from 'react';
import { api, request, EVENTS } from '../../lib/connection.js';
import { THEMES } from '../../lib/themes.js';
import { Panel, btn, btnPrimary, input } from './ui.jsx';

// 놓을 때 반영하는 슬라이더 — 끄는 동안 매번 전체 화면에 상태를 뿌리지 않게 한다
function Slider({ label, value, min, max, step, format, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <label className="block text-sm">
      <div className="flex justify-between mb-1">
        <span>{label}</span>
        <span className="font-mono text-sky-300">{format(draft)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={draft} className="w-full accent-sky-500"
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

const pct = (v) => `${Math.round(v * 100)}%`;
const times = (v) => `${v.toFixed(2).replace(/\.?0+$/, '')}×`;
const COLORS = ['#0b1220', '#1e1b4b', '#052e16', '#7f1d1d', '#f8fafc'];
const GRADIENTS = [
  'linear-gradient(135deg,#1e3a8a,#7c3aed)',
  'linear-gradient(135deg,#065f46,#0ea5e9)',
  'linear-gradient(135deg,#9d174d,#f59e0b)',
  'linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)',
];

export default function SettingsTab({ state, token, flash }) {
  const s = state.settings;
  const fileRef = useRef(null);
  const [files, setFiles] = useState(null);     // null: 스토리지 없음/미조회
  const [storage, setStorage] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState('');

  async function patch(p) {
    const res = await request(EVENTS.ADMIN_SETTINGS, { roomCode: state.roomCode, patch: p });
    if (!res.ok) flash(res.message || '설정을 바꾸지 못했습니다.');
  }

  async function loadFiles() {
    const res = await api('/api/media?kind=background', { token });
    if (res.status === 503) return setStorage(false);
    if (res.ok) setFiles(res.files);
  }
  useEffect(() => { loadFiles(); }, []);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const ticket = await api('/api/media/upload-url', { method: 'POST', token, body: { filename: file.name, kind: 'background' } });
    if (!ticket.ok) { setUploading(false); return flash(ticket.message || '업로드하지 못했습니다.'); }
    // 파일은 서버를 거치지 않고 스토리지로 직접 올린다
    const put = await fetch(ticket.signedUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }).catch(() => null);
    setUploading(false);
    if (!put?.ok) return flash('스토리지에 올리지 못했습니다.');
    await patch({ background: { type: file.type.startsWith('video/') ? 'video' : 'image', value: ticket.publicUrl } });
    loadFiles();
  }

  const isVideo = (name) => /\.(mp4|webm)$/i.test(name);
  const bg = s.background;
  const previewUrl = `/display?room=${state.roomCode}&preview=1`;

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
        <Panel title="채팅">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.chatEnabled} onChange={(e) => patch({ chatEnabled: e.target.checked })} className="w-4 h-4 accent-sky-500" />
            화면에 채팅 표시
          </label>
          <Slider label="글자 크기" value={s.chatFontScale} min={0.5} max={3} step={0.1} format={pct} onCommit={(v) => patch({ chatFontScale: v })} />
          <Slider label="투명도" value={s.chatOpacity} min={0.2} max={1} step={0.05} format={pct} onCommit={(v) => patch({ chatOpacity: v })} />
          <Slider label="흐르는 속도" value={s.chatSpeed} min={0.5} max={2} step={0.1} format={times} onCommit={(v) => patch({ chatSpeed: v })} />
        </Panel>

        <Panel title="테마">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(THEMES).map(([id, t]) => (
              <button key={id} onClick={() => patch({ theme: id })}
                className={`rounded-xl p-1 border-2 ${s.theme === id ? 'border-sky-400' : 'border-transparent'}`}>
                <div className="rounded-lg h-16 flex items-center justify-center font-bold" style={{ background: t.vars['--d-bg'], color: t.vars['--d-fg'] }}>
                  <span style={{ color: t.vars['--d-accent'] }}>●</span>&nbsp;{t.label}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="배경" action={bg && <button className={btn} onClick={() => patch({ background: null })}>테마 기본으로</button>}>
          <p className="text-xs text-slate-400">지정하지 않으면 테마의 기본 배경을 씁니다.</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => patch({ background: { type: 'color', value: c } })} title={c}
                className={`w-10 h-10 rounded-lg border-2 ${bg?.value === c ? 'border-sky-400' : 'border-slate-700'}`} style={{ background: c }} />
            ))}
            {GRADIENTS.map((g) => (
              <button key={g} onClick={() => patch({ background: { type: 'gradient', value: g } })}
                className={`w-16 h-10 rounded-lg border-2 ${bg?.value === g ? 'border-sky-400' : 'border-slate-700'}`} style={{ background: g }} />
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) patch({ background: { type: isVideo(url) ? 'video' : 'image', value: url.trim() } }); }}>
            <input className={`${input} flex-1`} placeholder="이미지·영상 주소 (https://… 또는 /media/파일명)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className={btn}>적용</button>
          </form>
          {storage ? (
            <>
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={upload} />
              <button className={btnPrimary} disabled={uploading} onClick={() => fileRef.current.click()}>
                {uploading ? '올리는 중…' : '⬆ 이미지·영상 올리기'}
              </button>
              {files?.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {files.map((f) => (
                    <button key={f.path} onClick={() => patch({ background: { type: isVideo(f.name) ? 'video' : 'image', value: f.publicUrl } })}
                      className={`h-16 rounded-lg border-2 overflow-hidden bg-slate-950 ${bg?.value === f.publicUrl ? 'border-sky-400' : 'border-slate-700'}`}>
                      {isVideo(f.name) ? <span className="text-xs">🎞 영상</span> : <img src={f.publicUrl} alt="" className="w-full h-full object-cover" />}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-amber-400">서버에 스토리지(Supabase)가 연결되지 않아 파일 올리기를 쓸 수 없습니다. 주소 지정은 가능합니다.</p>
          )}
        </Panel>

        <Panel title="집계">
          <Slider label="스크롤 속도" value={s.standingsSpeed} min={0.5} max={2} step={0.1} format={times} onCommit={(v) => patch({ standingsSpeed: v })} />
        </Panel>
      </div>

      <Panel title="미리보기" className="lg:sticky lg:top-20"
        action={<a className={btn} href={`/display?room=${state.roomCode}`} target="_blank" rel="noreferrer">새 창으로 열기</a>}>
        <div className="relative w-full overflow-hidden rounded-lg border border-slate-700" style={{ aspectRatio: '16 / 9' }}>
          <iframe title="Display 미리보기" src={previewUrl} className="absolute inset-0 w-full h-full border-0 pointer-events-none" />
        </div>
        <p className="text-xs text-slate-400">프로젝터에 나가는 화면과 같은 내용입니다. 설정을 바꾸면 바로 반영됩니다.</p>
      </Panel>
    </div>
  );
}
