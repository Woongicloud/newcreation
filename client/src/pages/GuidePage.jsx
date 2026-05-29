import { Link } from 'react-router-dom';
import GuideContent from '../components/GuideContent.jsx';

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-pinwheel px-4 py-8">
      <div className="max-w-lg mx-auto">
        <Link to="/" className="text-purple-700 text-sm mb-6 inline-block hover:text-purple-900 font-semibold">
          ← 돌아가기
        </Link>
        <h1 className="text-3xl font-bold text-slate-800 mb-2 text-center">게임 모드 안내</h1>
        <p className="text-slate-500 text-center text-sm mb-8">각 게임 모드의 규칙을 확인하세요</p>

        <GuideContent />

        <Link
          to="/"
          className="block w-full mt-6 py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-center font-bold text-lg shadow-lg"
        >
          참가하러 가기 🚀
        </Link>
      </div>
    </div>
  );
}
