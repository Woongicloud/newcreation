// 문제 사진·음원 미리 받기.
// 서버가 "다음에 나올 미디어"(state.preload)를 알려주면 미리 받아 둔다.
//   사진: 브라우저 캐시에 올려 둔다 (같은 주소의 <img> 가 바로 뜬다)
//   음원: 파일 전체를 받아 메모리에 둔다 → 재생 버튼을 누르는 순간 끊김 없이 나온다
//         (mp4 영상 파일도 소리만 재생된다). 받기 전이거나 실패하면 원래 주소로 재생한다.
import { useEffect } from 'react';

const images = new Map(); // url → Image (참조를 잡아 두어야 받기가 취소되지 않는다)
const sounds = new Map(); // url → { objectUrl?, promise }
const MAX_SOUNDS = 6;

export function preloadImage(url) {
  if (!url || images.has(url)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  images.set(url, img);
  if (images.size > 40) images.delete(images.keys().next().value);
}

export function preloadAudio(url) {
  if (!url || sounds.has(url)) return;
  const entry = { objectUrl: null };
  entry.promise = fetch(url)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
    .then((blob) => { entry.objectUrl = URL.createObjectURL(blob); })
    .catch(() => { sounds.delete(url); }); // CORS·네트워크 문제면 재생 때 원래 주소로
  sounds.set(url, entry);
  // 오래된 것부터 정리 (지난 문제의 음원)
  while (sounds.size > MAX_SOUNDS) {
    const [oldUrl, old] = sounds.entries().next().value;
    if (old.objectUrl) URL.revokeObjectURL(old.objectUrl);
    sounds.delete(oldUrl);
  }
}

// 재생할 주소: 미리 받아 둔 것이 있으면 그것, 아니면 원래 주소
export function playableAudio(url) {
  return (url && sounds.get(url)?.objectUrl) || url;
}

export function usePreload(preload) {
  const key = preload ? JSON.stringify(preload) : '';
  useEffect(() => {
    if (!preload) return;
    (preload.images || []).forEach(preloadImage);
    (preload.audio || []).forEach(preloadAudio);
  }, [key]);
}
