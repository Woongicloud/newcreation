import { api } from './connection.js';

// 파일 한 개 올리기: 서버에서 서명 주소 받기 → 스토리지로 직접 올리기 → 원래 이름 기록
// kind: 'question'(문제·정답용 사진·음원) | 'background'
export async function uploadFile(token, file, kind = 'question') {
  const ticket = await api('/api/media/upload-url', { method: 'POST', token, body: { filename: file.name, kind } });
  if (!ticket.ok) return { ok: false, message: ticket.message || '업로드 주소를 받지 못했습니다.' };
  const put = await fetch(ticket.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null);
  if (!put?.ok) return { ok: false, message: `${file.name}: 스토리지에 올리지 못했습니다.` };
  await api('/api/media/complete', { method: 'POST', token, body: { path: ticket.path, name: file.name, size: file.size } });
  return { ok: true, path: ticket.path, publicUrl: ticket.publicUrl };
}

export const formatSize = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
