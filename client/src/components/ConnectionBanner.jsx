import { useRoom } from '../lib/connection.js';

// 연결이 끊기면 화면 위에 알린다 (자동 재접속 중)
export default function ConnectionBanner() {
  const connected = useRoom((s) => s.connected);
  if (connected) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[200] bg-red-600 text-white text-center text-sm font-bold py-2">
      연결이 끊겼습니다. 다시 연결하는 중…
    </div>
  );
}
