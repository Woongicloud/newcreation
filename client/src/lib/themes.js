// Display 테마 — 색을 CSS 변수로 정의한다. 관리자 표시 설정에서 고른다.
export const THEMES = {
  default: {
    label: '딥 네온',
    vars: {
      '--d-bg': 'linear-gradient(135deg,#0b1220 0%,#0c1f2b 55%,#0b2622 100%)',
      '--d-frame': 'linear-gradient(135deg,#ADD8E6,#7fd8c8 50%,#ADFF2F)',
      '--d-fg': '#ffffff',
      '--d-muted': '#cbd5e1',
      '--d-accent': '#ADFF2F',
      '--d-accent2': '#ADD8E6',
      '--d-panel': 'rgba(255,255,255,0.06)',
      '--d-border': 'rgba(173,216,230,0.35)',
      '--d-on-accent': '#0b1220',
    },
  },
  pastel: {
    label: '파스텔',
    vars: {
      '--d-bg': 'linear-gradient(135deg,#fdf2f8 0%,#eef2ff 50%,#ecfeff 100%)',
      '--d-frame': 'linear-gradient(135deg,#f9a8d4,#a5b4fc 50%,#67e8f9)',
      '--d-fg': '#1e293b',
      '--d-muted': '#64748b',
      '--d-accent': '#7c3aed',
      '--d-accent2': '#db2777',
      '--d-panel': 'rgba(255,255,255,0.75)',
      '--d-border': 'rgba(124,58,237,0.25)',
      '--d-on-accent': '#ffffff',
    },
  },
  light: {
    label: '라이트',
    vars: {
      '--d-bg': '#f8fafc',
      '--d-frame': 'linear-gradient(135deg,#0ea5e9,#22c55e)',
      '--d-fg': '#0f172a',
      '--d-muted': '#475569',
      '--d-accent': '#0284c7',
      '--d-accent2': '#16a34a',
      '--d-panel': '#ffffff',
      '--d-border': 'rgba(15,23,42,0.15)',
      '--d-on-accent': '#ffffff',
    },
  },
  midnight: {
    label: '미드나잇',
    vars: {
      '--d-bg': 'radial-gradient(circle at 30% 20%,#312e81 0%,#0f172a 60%,#020617 100%)',
      '--d-frame': 'linear-gradient(135deg,#fbbf24,#f472b6 50%,#818cf8)',
      '--d-fg': '#f8fafc',
      '--d-muted': '#c7d2fe',
      '--d-accent': '#fbbf24',
      '--d-accent2': '#f472b6',
      '--d-panel': 'rgba(255,255,255,0.08)',
      '--d-border': 'rgba(251,191,36,0.35)',
      '--d-on-accent': '#0f172a',
    },
  },
};

export const themeOf = (name) => THEMES[name] || THEMES.default;
