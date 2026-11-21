import { api } from './connection.js';

// 큰 사진은 올리기 전에 줄인다 — 폰 사진(3~10MB)을 그대로 올리면 프로젝터·참가자 폰에서 늦게 뜬다.
// 긴 변 2400px, JPEG 85% (투명한 PNG 는 PNG 유지). 줄인 게 더 크면 원본을 쓴다. 실패해도 원본으로 올린다.
const SHRINK = /^image\/(jpeg|png|webp)$/;
export async function shrinkImage(file, { maxSide = 2400, minBytes = 1.5 * 1024 * 1024, quality = 0.85 } = {}) {
  if (!SHRINK.test(file.type) || file.size < minBytes || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file); // 사진의 회전 정보(EXIF)를 반영해 읽는다
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    let type = 'image/jpeg';
    if (file.type === 'image/png') {
      const { data } = ctx.getImageData(0, 0, w, h);
      for (let i = 3; i < data.length; i += 16) if (data[i] < 255) { type = 'image/png'; break; }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const name = type === 'image/jpeg' ? file.name.replace(/\.(png|webp|jpe?g)$/i, '.jpg') : file.name;
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}

// 파일 한 개 올리기: (큰 사진 줄이기) → 서버에서 서명 주소 받기 → 스토리지로 직접 올리기 → 원래 이름 기록
// kind: 'question'(문제·정답용 사진·음원) | 'background'
export async function uploadFile(token, original, kind = 'question', onStep = () => {}) {
  onStep(SHRINK.test(original.type) && original.size >= 1.5 * 1024 * 1024 ? '사진 줄이는 중' : '올리는 중');
  const file = await shrinkImage(original);
  onStep('올리는 중');
  const ticket = await api('/api/media/upload-url', { method: 'POST', token, body: { filename: file.name, kind } });
  if (!ticket.ok) return { ok: false, message: ticket.message || '업로드 주소를 받지 못했습니다.' };
  const put = await fetch(ticket.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null);
  if (!put?.ok) {
    // 실패 이유를 알 수 있게 (용량 초과·형식 제한·버킷 설정 등)
    const detail = put ? await put.json().then((d) => d.message || d.error || '').catch(() => '') : '';
    const reason = !put ? '연결 실패'
      : put.status === 413 || /maximum|size|too large/i.test(detail) ? `파일이 너무 큽니다 (${formatSize(file.size)}) — Supabase 무료 요금제는 파일당 50MB까지입니다`
        : /mime|type/i.test(detail) ? `이 형식(${file.type || '알 수 없음'})은 저장소에서 허용되지 않습니다 — Supabase media 버킷의 허용 형식을 확인하세요`
          : `응답 ${put.status}${detail ? ` · ${detail}` : ''}`;
    return { ok: false, message: `${original.name}: 스토리지에 올리지 못했습니다 (${reason})` };
  }
  // 표시 이름은 원래 이름 그대로 (문제 세트에 원래 파일 이름을 적어도 찾을 수 있게)
  await api('/api/media/complete', { method: 'POST', token, body: { path: ticket.path, name: original.name, size: file.size } });
  return { ok: true, path: ticket.path, publicUrl: ticket.publicUrl, shrunk: file !== original };
}

export const formatSize = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
