import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
// 문제·정답 글꼴 (SIL OFL 1.1) — 파일을 앱에 함께 묶어 인터넷 없이도 나온다
import '@fontsource/do-hyeon/400.css';
import '@fontsource/black-han-sans/400.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
