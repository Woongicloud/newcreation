import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RegisterPage from './pages/player/RegisterPage.jsx';
import PlayPage from './pages/player/PlayPage.jsx';
import DisplayPage from './pages/display/DisplayPage.jsx';
import HostPage from './pages/host/HostPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';
import GuidePage from './pages/GuidePage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RegisterPage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/guide" element={<GuidePage />} />
        {/* 예전 주소 */}
        <Route path="/lobby" element={<Navigate to="/play" replace />} />
        <Route path="/game" element={<Navigate to="/play" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
