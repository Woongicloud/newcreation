import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PHASES } from '@shared/protocol.js';
import { request, EVENTS } from '../../lib/connection.js';
import { appUrl } from '../../lib/session.js';
import { PHASE_LABEL, AWARD_TYPE_LABEL } from '../../lib/labels.js';
import { ALL_PRACTICE } from '../../data/practice/index.js';
import { Panel, btn, btnPrimary } from './ui.jsx';

function CopyLink({ label, url }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 w-16 shrink-0">{label}</span>
      <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sky-300 underline">{url.replace(/t=.*/, 't=…')}</a>
      <button className={btn} onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

export default function PrepareTab({ state, rooms, refreshRooms, createRoom, openRoom, closeRoom, flash, setTab }) {
  const fileRef = useRef(null);
  const [report, setReport] = useState(null); // 세트 검증 결과
  const [hostUrl, setHostUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadSet(set, name) {
    setBusy(true);
    const res = await request(EVENTS.ADMIN_LOAD_SET, { roomCode: state.roomCode, set });
    setBusy(false);
    setReport({ name, ...res });
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let set;
      try { set = JSON.parse(reader.result); } catch (err) {
        return setReport({ name: file.name, ok: false, message: 'JSON 형식이 올바르지 않습니다.', errors: [{ path: '', message: err.message }] });
      }
      loadSet(set, file.name);
    };
    reader.readAsText(file);
  }

  async function makeHostLink() {
    const res = await request(EVENTS.ADMIN_HOST_TOKEN, { roomCode: state.roomCode });
    if (!res.ok) return flash(res.message || '링크를 만들지 못했습니다.');
    setHostUrl(`${appUrl()}/host?room=${res.roomCode}&t=${encodeURIComponent(res.token)}`);
  }

  const inLobby = state?.phase === PHASES.LOBBY;
  const joinUrl = state ? `${appUrl()}/?roomCode=${state.roomCode}` : '';

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="방" action={<div className="flex gap-2"><button className={btn} onClick={refreshRooms}>새로고침</button><button className={btnPrimary} onClick={createRoom}>+ 새 방</button></div>}>
        {rooms.length === 0 && <p className="text-sm text-slate-400">열려 있는 방이 없습니다. 새 방을 만드세요.</p>}
        {rooms.map((r) => (
          <div key={r.roomCode} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${state?.roomCode === r.roomCode ? 'bg-sky-900/50 border border-sky-700' : 'bg-slate-950'}`}>
            <span className="font-mono font-bold text-base">{r.roomCode}</span>
            <span className="flex-1 truncate text-slate-400">{r.sessionName || '세트 없음'} · {PHASE_LABEL[r.phase]} · {r.onlineCount}/{r.playerCount}명</span>
            {state?.roomCode !== r.roomCode && <button className={btn} onClick={() => openRoom(r.roomCode)}>열기</button>}
            <button className={`${btn} !text-red-300`} onClick={() => closeRoom(r.roomCode)}>닫기</button>
          </div>
        ))}
      </Panel>

      {state && (
        <Panel title="문제 세트">
          <p className="text-sm text-slate-400">
            {state.hasSet ? `현재: ${state.sessionName}` : '세트를 올려야 참가자가 입장할 수 있습니다 (학년·브릿지 목록이 세트에 들어 있습니다).'}
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
            <button className={btnPrimary} disabled={!inLobby || busy} onClick={() => fileRef.current.click()}>📁 JSON 올리기</button>
            <button className={btn} disabled={!inLobby || busy} onClick={() => loadSet(ALL_PRACTICE, '연습 세트')}>🎯 연습 세트</button>
          </div>
          {!inLobby && <p className="text-xs text-amber-400">게임이 시작된 뒤에는 세트를 바꿀 수 없습니다.</p>}
          {report && (
            <div className={`rounded-lg p-3 text-sm space-y-1 ${report.ok ? 'bg-emerald-950 border border-emerald-800' : 'bg-red-950 border border-red-800'}`}>
              <p className="font-bold">{report.ok ? `✅ ${report.name} 적용됨` : `❌ ${report.name}: ${report.message}`}</p>
              {report.summary && (
                <p className="text-slate-300">
                  라운드 {report.summary.rounds}개 · 문제 {report.summary.questions}개 · 학년 {report.summary.groups}개 · 시상: {report.summary.awards.join(' → ') || '없음'}
                </p>
              )}
              {report.errors?.map((e, i) => <p key={i} className="text-red-300"><code>{e.path || '(전체)'}</code> — {e.message}</p>)}
              {report.warnings?.map((w, i) => <p key={i} className="text-amber-300"><code>{w.path}</code> — {w.message}</p>)}
            </div>
          )}
          {state.teams && (
            <div className="text-sm text-slate-300 space-y-1">
              {state.teams.groups.map((g) => (
                <p key={g.name}><span className="font-bold">{g.name}</span> <span className="text-slate-400">— {g.units.join(', ')}</span></p>
              ))}
            </div>
          )}
          {state.awardConfig?.length > 0 && (
            <p className="text-sm text-slate-400">
              시상: {state.awardConfig.map((a) => `${a.title}(${AWARD_TYPE_LABEL[a.type]})`).join(' → ')}{' '}
              <button className="underline text-sky-300" onClick={() => setTab('awards')}>편집</button>
            </p>
          )}
        </Panel>
      )}

      {state && (
        <Panel title="접속 링크" className="lg:col-span-2">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-bold">📱 참가자</p>
              {state.hasSet ? (
                <>
                  <div className="bg-white p-2 rounded-lg inline-block"><QRCodeSVG value={joinUrl} size={140} /></div>
                  <CopyLink label="주소" url={joinUrl} />
                </>
              ) : <p className="text-sm text-slate-400">세트를 올리면 QR이 나옵니다.</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold">🎤 진행자 리모트</p>
              {hostUrl ? (
                <>
                  <div className="bg-white p-2 rounded-lg inline-block"><QRCodeSVG value={hostUrl} size={140} /></div>
                  <CopyLink label="주소" url={hostUrl} />
                  <p className="text-xs text-amber-400">이 QR을 가진 사람은 게임을 진행할 수 있습니다. 진행자에게만 보여주세요. (24시간 유효)</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-400">진행자 폰으로 찍을 QR을 만듭니다.</p>
                  <button className={btnPrimary} onClick={makeHostLink}>진행자 QR 만들기</button>
                </>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold">📺 프로젝터 (Display)</p>
              <CopyLink label="주소" url={`${appUrl()}/display?room=${state.roomCode}`} />
              <p className="text-xs text-slate-400">프로젝터에 연결된 PC에서 열고 전체화면으로 전환하세요.</p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
