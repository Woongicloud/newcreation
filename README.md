# 레크레이션 게임 시스템

교회·단체 행사용 실시간 멀티플레이어 퀴즈 게임.  
스마트폰 참가자 + PC 진행자 + 프로젝터 Display 3-way 구조.

> **v2 개편 진행 중** — 계획은 [docs/REVAMP_PLAN.md](docs/REVAMP_PLAN.md), 프로토콜은 [docs/PROTOCOL.md](docs/PROTOCOL.md).
> 새 서버는 `server/src/`에 있고(`npm run dev:server:v2`, 테스트는 `npm test`), 화면은 아직 기존 서버(`server/index.js`)에 붙어 있다.
> `supabase/schema.sql`은 v2 스키마로 바뀌었다. 기존 서버용 스키마는 `supabase/legacy/schema_v1.sql`.

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Socket.io-client, Zustand, Framer Motion |
| Backend | Node.js, Express, Socket.io |
| Database | Supabase (PostgreSQL) |
| 배포 | Vercel (client), Railway (server) |

---

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm run install:all
```

### 2. Supabase 스키마 적용

[Supabase Dashboard](https://supabase.com) → SQL Editor에서 스키마 실행. v2 서버는 `supabase/schema.sql`, 기존 서버는 `supabase/legacy/schema_v1.sql`. (v2 스키마는 기존 테이블을 지우고 새로 만든다)

### 3. 환경 변수 설정

**server/.env** (server/.env.example 참고)
```
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...    # Settings → API → service_role
ADMIN_PASSWORD=your-password
CLIENT_URL=http://localhost:5173
```

**client/.env** (client/.env.example 참고)
```
VITE_SERVER_URL=http://localhost:3001
VITE_ADMIN_PASSWORD=your-password    # server의 ADMIN_PASSWORD와 동일해야 함
```

### 4. 개발 서버 실행

```bash
npm run dev          # 서버 + 클라이언트 동시 실행
# 또는
npm run dev:server   # 서버만
npm run dev:client   # 클라이언트만
```

| URL | 설명 |
|---|---|
| http://localhost:5173 | 참가자 등록 화면 |
| http://localhost:5173/admin | 진행자 패널 |
| http://localhost:5173/display | 프로젝터 화면 |

---

## 문제 JSON 포맷

`test-questions.json` 참고.

```json
{
  "rounds": [
    {
      "roundNumber": 1,
      "theme": "라운드 이름",
      "gameMode": "multiple_choice",
      "questions": [
        {
          "content": "문제 텍스트",
          "choices": ["보기1", "보기2", "보기3", "보기4"],
          "correctAnswer": "보기1",
          "timeLimit": 15,
          "maxScore": 1000,
          "penalty": 200
        }
      ]
    }
  ]
}
```

**지원 게임 모드**

| gameMode | 설명 |
|---|---|
| `multiple_choice` | 4지선다 객관식 |
| `short_answer` | 단답형 주관식 |
| `consonant` | 초성 퀴즈 (consonantHint 필드 추가) |
| `word_guess` | 빈칸 채우기 |
| `image_quiz` | 이미지 + 텍스트 입력 (imageUrl 필드 추가) |
| `reaction` | 반응속도 게임 |

---

## 게임 진행 순서

1. **진행자**: `/admin` → 방 만들기 → JSON 업로드 → 게임 시작
2. **참가자**: `/` → 방코드 + 이름 + 반 입력 → 대기실
3. **Display**: `/display` → 방코드 입력 (QR코드 자동 표시)
4. 진행자가 "다음 문제" 클릭 → 라운드 종료 후 "다음 라운드" 클릭

---

## 배포

### Client → Vercel

> 루트 디렉터리 전체를 Vercel에 연결해야 합니다. (`client/` 하위 폴더가 아닌 **repo root**)  
> `vercel.json`이 루트에 있으므로 자동으로 client만 빌드합니다.

1. GitHub에 push
2. [Vercel](https://vercel.com) → New Project → GitHub repo 선택
3. **Root Directory**: 비워두기 (repo root 사용)
4. **Framework Preset**: Other (vercel.json이 자동 처리)
5. Environment Variables 추가:
   - `VITE_SERVER_URL` = Railway 서버 URL (예: `https://xxx.railway.app`)
   - `VITE_ADMIN_PASSWORD` = 관리자 비밀번호
6. Deploy

### Server → Railway

> `Dockerfile`이 repo root에 있으므로 Railway가 자동 감지합니다.

1. [Railway](https://railway.app) → New Project → GitHub repo 연결
2. **Root Directory**: 비워두기 (repo root 사용)
3. Railway가 루트의 `Dockerfile` 자동 감지 → Docker 빌드
4. Environment Variables 추가:
   - `PORT` = `3001`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ADMIN_PASSWORD`
   - `CLIENT_URL` = Vercel 배포 URL (예: `https://your-app.vercel.app`)
5. Deploy → 생성된 URL을 Vercel의 `VITE_SERVER_URL`에 설정 후 Vercel 재배포

> **주의**: `CLIENT_URL`은 서버의 CORS 허용 오리진. Vercel URL과 반드시 일치해야 함.

---

## 프로젝트 구조

```
newcreation/
├── shared/constants.js      # 이벤트 상수 공유
├── supabase/schema.sql      # DB 스키마
├── server/
│   ├── index.js             # Express + Socket.io 진입점
│   ├── gameEngine.js        # 게임 상태 머신
│   ├── scoringEngine.js     # 채점 로직
│   ├── chatHandler.js       # 채팅 처리
│   └── Dockerfile           # Railway 배포용
└── client/
    ├── vercel.json          # Vercel SPA 라우팅
    └── src/
        ├── pages/           # RegisterPage, LobbyPage, GamePage, AdminPage, DisplayPage
        ├── components/      # Timer, ResultModal, Scoreboard, 게임모드 컴포넌트, 채팅
        ├── store/           # Zustand 전역 상태
        └── lib/socket.js    # Socket.io 싱글톤
```
