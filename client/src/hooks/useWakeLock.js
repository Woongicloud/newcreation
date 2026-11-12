import { useEffect } from 'react';

// 화면이 꺼지지 않게 한다 (진행자 리모트·Display). 지원하지 않는 브라우저에서는 아무 일도 하지 않는다.
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release();
      } catch { /* 탭이 보이지 않을 때 등 — 다시 보이면 재시도 */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}
