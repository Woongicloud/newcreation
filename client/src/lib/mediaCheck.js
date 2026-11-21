// 사진·음원 미리보기가 안 될 때 원인을 사람이 알아들을 말로 알려준다.
// 웹페이지 링크 → 바로 안내 / 앱 기본 폴더(/media) → 직접 확인 / 그 밖의 주소 → 서버가 가 보고(앞부분 몇 바이트) 판단
import { isPageLink } from '@shared/protocol.js';
import { api } from './connection.js';
import { adminSession } from './session.js';
import { formatSize } from './upload.js';

const AUDIO = new Set(['mp3', 'm4a', 'mp4', 'wav', 'ogg', 'webm', 'flac', 'mov']);
const IMAGE = new Set(['jpeg', 'png', 'gif', 'webp', 'svg']);
const KIND_LABEL = { mp3: 'mp3', m4a: 'm4a', mp4: 'mp4 영상', wav: 'wav', ogg: 'ogg', webm: 'webm', flac: 'flac', mov: '아이폰 동영상(mov)', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', svg: 'svg' };

export const PAGE_LINK_MESSAGE = '🔗 웹페이지 링크(사운드클라우드·유튜브·구글 드라이브 등)는 파일이 아니라서 재생·표시할 수 없습니다. 파일(mp3·m4a·mp4 / jpg·png)을 내려받아 ⑥ 파일에 올린 뒤 "올린 음원·사진"에서 골라 주세요.';

export { isPageLink };

// kind: 'audio' | 'image', mediaError: <audio>.error.code (1 중단 2 네트워크 3 해독 실패 4 지원 안 함)
export async function diagnoseMedia(url, { kind = 'audio', mediaError = null } = {}) {
  if (!url) return null;
  if (isPageLink(url)) return PAGE_LINK_MESSAGE;

  let probe;
  if (url.startsWith('/')) {
    // 앱 기본 폴더: 없는 파일이면 앱 화면(html)이 대신 온다
    try {
      const res = await fetch(url, { headers: { range: 'bytes=0-0' } });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.includes('text/html')) {
        return '📁 이 이름의 파일이 없습니다. ⑥ 파일에 올린 파일을 고르거나, ⑥ 파일에 보이는 이름을 그대로 적어 주세요 (방에 적용할 때 자동으로 연결됩니다).';
      }
      probe = { reachable: true, status: res.status, kind: null, contentType: type };
    } catch {
      return '주소에 연결하지 못했습니다.';
    }
  } else {
    const res = await api('/api/media/probe', { method: 'POST', token: adminSession.get()?.token, body: { url } });
    if (!res.ok) return res.message || '원인을 확인하지 못했습니다.';
    probe = res;
  }

  if (!probe.reachable) return probe.error === 'timeout' ? '⏱ 주소가 응답하지 않습니다 (시간 초과).' : '🌐 주소에 연결하지 못했습니다. 주소가 맞는지 확인하세요.';
  if (probe.status === 404) return '❌ 파일이 없습니다 (응답 404) — 지워졌거나 주소가 틀렸습니다.';
  if (probe.status >= 400) {
    const text = probe.errorText || '';
    if (/bucket not found/i.test(text)) {
      return '🔒 media 저장 공간(버킷)이 비공개라서 파일을 내주지 않습니다. ⑥ 파일 탭 위쪽의 [공개로 바꾸기] 버튼을 눌러 주세요.';
    }
    if (/object not found|not_found|not found/i.test(text)) {
      return '❌ 저장소에 이 파일이 없습니다 — 올리기가 끝나지 않았거나 지워졌습니다. ⑥ 파일에서 다시 올려 주세요.';
    }
    if (/supabase\.co$/.test(probe.host || '')) {
      return `🔒 스토리지가 파일을 내주지 않습니다 (응답 ${probe.status}${text ? ` · ${text.slice(0, 80)}` : ''}). ⑥ 파일 탭 위쪽의 저장소 점검을 확인하세요.`;
    }
    return `❌ 주소가 오류를 돌려줬습니다 (응답 ${probe.status}).`;
  }
  if (probe.kind === 'html') return PAGE_LINK_MESSAGE.replace('웹페이지 링크(사운드클라우드·유튜브·구글 드라이브 등)는', '이 주소는 파일이 아니라 웹페이지라서');
  if (kind === 'audio' && IMAGE.has(probe.kind)) return '🖼 이 주소는 사진 파일입니다. 음원 파일을 골라 주세요.';
  if (kind === 'image' && AUDIO.has(probe.kind)) return '🎵 이 주소는 음원·영상 파일입니다. 사진 파일을 골라 주세요.';

  const label = KIND_LABEL[probe.kind] || probe.contentType || '알 수 없는 형식';
  const size = probe.size ? `, ${formatSize(probe.size)}` : '';
  if (probe.kind === 'mov') return `🎞 파일은 있지만(${label}${size}) 크롬·엣지에서 재생되지 않는 형식일 수 있습니다. mp3·m4a 또는 일반 mp4로 바꿔 올려 주세요.`;
  if (mediaError === 3 || mediaError === 4) {
    return `🔇 파일은 정상(${label}${size})이지만 이 브라우저가 재생하지 못합니다.${probe.kind === 'mp4' ? ' 영상의 압축 방식(HEVC 등) 때문일 수 있습니다.' : ''} 소리만 mp3·m4a로 바꿔 올려 주세요. (크롬·엣지 최신 버전 권장)`;
  }
  if (mediaError === 2) return `📶 파일은 정상(${label}${size})인데 불러오다 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 보세요.`;
  if (probe.kind === 'unknown' || probe.kind === 'empty') return `❓ 알 수 없는 형식의 파일입니다${probe.contentType ? ` (${probe.contentType})` : ''}.`;
  return `파일은 정상(${label}${size})으로 보입니다. 새로고침 후 다시 확인해 보세요.`;
}
