당신은 풀스택 웹 개발자입니다. 아래 스펙에 따라 실시간 멀티플레이어 레크레이션 게임 시스템을 처음부터 구축해주세요. 먼저 전체 파일 구조와 구현 계획을 plan으로 제시하고, 승인 후 단계별로 구현하세요.

---

## 프로젝트 개요

교회/단체 행사에서 스마트폰으로 100명이 동시 참여하는 실시간 레크레이션 게임 시스템.
진행자(호스트)는 PC/태블릿으로 게임을 컨트롤하고, 참가자는 스마트폰으로 접속해 플레이한다.

---

## 기술 스택

### 프론트엔드
- React 18 + Vite
- Tailwind CSS (모바일 퍼스트)
- Socket.io-client
- Zustand (전역 상태)
- React Router v6
- Framer Motion (애니메이션)

### 백엔드
- Node.js + Express
- Socket.io (WebSocket 실시간 통신)
- Supabase JS Client (DB 연동)

### 데이터베이스
- Supabase (PostgreSQL)

### 배포
- Frontend: Vercel
- Backend: Railway
- DB: Supabase Cloud (무료 티어)

---

## 디렉토리 구조

```
/
├── client/                    # React 프론트엔드
│   ├── src/
│   │   ├── pages/
│   │   │   ├── RegisterPage.jsx       # 참가자 이름/반 등록
│   │   │   ├── LobbyPage.jsx          # 대기실
│   │   │   ├── GamePage.jsx           # 게임 플레이 (모바일)
│   │   │   ├── AdminPage.jsx          # 호스트 컨트롤 패널
│   │   │   └── DisplayPage.jsx        # 프로젝터용 점수판+채팅
│   │   ├── components/
│   │   │   ├── game-modes/
│   │   │   │   ├── MultipleChoice.jsx # 객관식 (4지선다)
│   │   │   │   ├── ShortAnswer.jsx    # 주관식 텍스트 입력
│   │   │   │   ├── ConsonantQuiz.jsx  # 초성 퀴즈
│   │   │   │   ├── WordGuess.jsx      # 단어 맞추기
│   │   │   │   ├── ImageQuiz.jsx      # 그림 보고 정답 입력
│   │   │   │   └── ReactionGame.jsx   # 반응형 원투스위치 게임
│   │   │   ├── chat/
│   │   │   │   ├── ChatInput.jsx      # 모바일 채팅 입력창
│   │   │   │   └── ChatOverlay.jsx    # Display용 흐르는 채팅
│   │   │   ├── Scoreboard.jsx         # 실시간 순위표
│   │   │   ├── Timer.jsx              # 카운트다운 타이머
│   │   │   └── ResultModal.jsx        # 정답/오답 결과 모달
│   │   ├── store/
│   │   │   └── gameStore.js           # Zustand 전역 상태
│   │   ├── hooks/
│   │   │   └── useSocket.js           # Socket.io 커스텀 훅
│   │   └── lib/
│   │       └── socket.js              # Socket.io 클라이언트 설정
│
├── server/                    # Node.js 백엔드
│   ├── index.js               # Express + Socket.io 서버
│   ├── gameEngine.js          # 게임 상태 머신
│   ├── scoringEngine.js       # 채점 로직
│   ├── chatHandler.js         # 채팅 처리
│   └── supabase.js            # Supabase 클라이언트
│
└── shared/
    └── constants.js           # 게임 모드, 이벤트 상수 공유
```

---

## 데이터베이스 스키마 (Supabase)

```sql
-- 게임 세션
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) UNIQUE NOT NULL,  -- 참가자가 입력하는 6자리 코드
  status VARCHAR(20) DEFAULT 'waiting',  -- waiting | playing | finished
  current_round INT DEFAULT 0,
  current_question INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 참가자
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  name VARCHAR(20) NOT NULL,
  class_name VARCHAR(10) NOT NULL,  -- 반 (예: "1반", "청소년부")
  score INT DEFAULT 0,
  socket_id VARCHAR(50),
  is_online BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- 라운드
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  round_number INT NOT NULL,
  theme VARCHAR(50),             -- 라운드 테마 이름
  game_mode VARCHAR(30) NOT NULL -- multiple_choice | short_answer | consonant | word_guess | image_quiz | reaction
);

-- 문제
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES rounds(id),
  question_number INT NOT NULL,
  content TEXT NOT NULL,           -- 문제 내용
  image_url TEXT,                  -- 이미지 퀴즈용 URL
  consonant_hint VARCHAR(20),      -- 초성 힌트 (예: "ㅅㄱ")
  correct_answer TEXT NOT NULL,
  choices JSONB,                   -- 객관식 선택지 배열 ["①A","②B","③C","④D"]
  time_limit INT DEFAULT 20,       -- 제한 시간 (초)
  max_score INT DEFAULT 1000,
  penalty INT DEFAULT 200          -- 오답 페널티
);

-- 응답
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id),
  player_id UUID REFERENCES players(id),
  answer TEXT NOT NULL,
  is_correct BOOLEAN,
  response_time_ms INT,            -- 응답까지 걸린 시간 (ms)
  score_delta INT,                 -- 이번 문제에서 얻은/잃은 점수
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 채팅
CREATE TABLE chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 핵심 게임 로직

### 채점 공식

```javascript
// scoringEngine.js
function calculateScore(isCorrect, responseTimeMs, timeLimitMs, maxScore, penalty) {
  if (!isCorrect) {
    // 빠르게 틀릴수록 큰 페널티
    const speedRatio = 1 - (responseTimeMs / timeLimitMs);
    return -Math.round(penalty * (0.5 + speedRatio * 0.5));
  }
  // 빠르게 맞출수록 높은 점수
  const timeBonus = Math.max(0, 1 - (responseTimeMs / timeLimitMs));
  return Math.round(maxScore * (0.3 + timeBonus * 0.7));
}
```

### Socket.io 이벤트 설계

```javascript
// 클라이언트 → 서버
'player:register'      // { name, className, roomCode }
'player:submit_answer' // { questionId, answer, responseTimeMs }
'player:reaction'      // { reactionTimeMs } — 반응게임용
'chat:send'            // { message }

// 서버 → 클라이언트 (브로드캐스트)
'game:player_joined'   // { players[] }
'game:question_start'  // { question, timeLimit, questionNumber }
'game:timer_tick'      // { remaining }
'game:question_end'    // { correctAnswer, scores[] }
'game:round_end'       // { leaderboard[] }
'game:reaction_start'  // { signal } — 반응게임 신호
'game:reaction_end'    // { results[] }
'chat:message'         // { message, position: { y: 0-90 }, speed }
'game:show_result'     // { playerId, isCorrect, scoreDelta }
```

### 반응형 게임 (원투스위치 스타일)

```javascript
// 구현 방식:
// 1. 호스트가 반응게임 라운드 시작
// 2. 서버에서 랜덤 딜레이(1~4초) 후 'game:reaction_start' 이벤트 발송
// 3. 모든 참가자 화면에 동시에 신호 표시 (화면 전체가 색 변함 + 큰 버튼)
// 4. 참가자가 버튼 누르면 'player:reaction' 이벤트 → responseTimeMs 기록
// 5. 빠른 순서대로 점수 차등 지급
// 6. 결과 Display 화면에 순위별 표시
```

---

## 페이지별 상세 스펙

### RegisterPage (참가자 등록)
- URL: `/`
- 방 코드 6자리 입력 필드
- 이름 입력 (최대 10자)
- 반 선택 드롭다운 또는 입력
  - 기본 선택지: ["중1", "중2", "중3", "고1", "고2", "고3", "기타"]
  - 커스텀 입력도 허용
- 큰 "참가하기" 버튼 (모바일 탭하기 좋게)
- 등록 완료 → LobbyPage 이동

### LobbyPage (대기실)
- 현재 접속 인원 실시간 표시
- 자신의 이름과 반 확인
- "게임 시작 대기 중..." 애니메이션
- 호스트가 시작하면 자동으로 GamePage 이동

### GamePage (모바일 게임화면)
- 상단: 현재 라운드/문제 번호, 내 점수
- 중앙: 게임 컴포넌트 (게임 모드별 다름)
- 하단: 채팅 입력창 (항상 표시)
- 정답 제출 후 결과 표시 (맞음/틀림 + 획득/잃은 점수)

### AdminPage (호스트 컨트롤)
- URL: `/admin` (비밀번호 보호: 환경변수 ADMIN_PASSWORD)
- 방 코드 생성/표시
- 문제 업로드 (JSON 파일 import 또는 직접 입력)
- 라운드/문제 순서 관리
- 현재 접속자 목록 (이름, 반, 점수)
- 게임 시작/다음 문제/강제 종료 버튼
- 실시간 응답 현황 (몇 명 제출했는지 퍼센트바)

### DisplayPage (프로젝터 화면)
- URL: `/display`
- 큰 화면에 최적화된 레이아웃
- 브라우저의 전체화면 모드 지원
- 화면 비율 조정 유동적 조정 선택가능 (극단적인 와일드 디스플레이 3.3:1도 지원하도록)
- 문제 표시 (크고 선명하게)
- 타이머 원형 프로그레스바
- 흐르는 익명 채팅 오버레이 (우→좌, 랜덤 Y위치, 랜덤 속도)
- 라운드 종료 후 상위 5명 순위표 애니메이션

---

## 흐르는 채팅 구현 스펙

```javascript
// ChatOverlay.jsx
// - 채팅 메시지가 서버에서 오면 화면 오른쪽 밖에서 시작
// - CSS animation: translateX(110vw → -100%) 으로 이동
// - top: Math.random() * 80 + 5 + '%' (5%~85% 랜덤)
// - duration: 5초~9초 랜덤
// - 폰트 사이즈: 1.4rem~2rem 랜덤
// - 동시 최대 15개 표시 (초과 시 오래된 것 제거)
// - 배경: 반투명 검정 pill (가독성 확보)
```

---

## 환경 변수

```env
# server/.env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
ADMIN_PASSWORD=your_admin_password
CLIENT_URL=https://your-vercel-app.vercel.app

# client/.env
VITE_SERVER_URL=https://your-railway-app.up.railway.app
VITE_ADMIN_PASSWORD=your_admin_password
```

---

## 게임 모드별 UI 상세

### 객관식 (MultipleChoice)
- 4개 버튼 (2×2 그리드, 각 버튼 색상 다름: 빨강/파랑/노랑/초록)
- 제출 후 잠금 (재제출 불가)
- 정답 공개 시 맞은 버튼 초록, 틀린 버튼 회색으로 변경

### 주관식 (ShortAnswer)
- 큰 텍스트 입력 필드 (모바일 키보드 대응)
- "제출" 버튼
- 서버에서 정규화된 정답 비교 (공백 무시, 대소문자 무시)

### 초성 퀴즈 (ConsonantQuiz)
- 화면 상단에 큰 초성 힌트 표시 (예: "ㅅㄱ")
- 텍스트 입력 + 제출

### 단어 맞추기 (WordGuess)
- 빈칸이 있는 단어 표시 (예: "사 _ 나 무")
- 텍스트 입력 + 제출

### 그림 퀴즈 (ImageQuiz)
- 이미지 크게 표시
- 텍스트 입력 + 제출
- 주관식과 동일한 입력 방식

### 반응형 게임 (ReactionGame)
- 대기 상태: 회색 화면 + "준비하세요!" 텍스트
- 신호 발생: 화면 전체가 노란색으로 변하며 큰 버튼 등장
- 버튼: "지금 누르세요!" (전체 화면 크기의 탭 영역)
- 완료 후: "n번째로 눌렀습니다!" 표시

---

## 구현 순서 (Phase)

### Phase 1: 기반 설정
1. 프로젝트 초기화 (Vite + Express 모노레포 or 분리)
2. Supabase 테이블 생성 및 연결
3. Socket.io 서버 기본 구조 + 클라이언트 연결
4. 환경변수 설정

### Phase 2: 핵심 플로우
5. RegisterPage + 방 입장 로직
6. LobbyPage + 인원 실시간 표시
7. AdminPage 기본 (방 생성, 시작 버튼)
8. 게임 상태 머신 (waiting→playing→question→result→leaderboard)

### Phase 3: 게임 모드
9. 객관식 (MultipleChoice) — 가장 먼저
10. 주관식 (ShortAnswer) + 채점 엔진
11. 초성 퀴즈 (ConsonantQuiz)
12. 단어 맞추기 (WordGuess)
13. 그림 퀴즈 (ImageQuiz)
14. 반응형 게임 (ReactionGame)

### Phase 4: Display + 채팅
15. DisplayPage 기본 (문제 표시, 타이머)
16. 흐르는 채팅 오버레이
17. 순위표 애니메이션

### Phase 5: 마무리
18. 모바일 반응형 최적화
19. 에러 처리 및 재연결 로직
20. 배포 설정 (Vercel + Railway)

---

## 중요 구현 주의사항

1. **타이머 동기화**: 클라이언트 타이머는 표시용만. 실제 마감은 서버가 관리.
2. **재연결 처리**: Socket.io reconnect 시 기존 플레이어 상태 복원.
3. **모바일 UW**: 버튼 최소 44px×44px, 폰트 최소 16px, 터치 피드백 필수.
4. **한글 정답 비교**: 공백/자모 분리 이슈 → normalize() 처리 필요.
5. **방 코드**: 6자리 대문자 영숫자 (O, I, 0 제외로 혼동 방지).
6. **관리자 보호**: AdminPage는 URL + 비밀번호 이중 보호.

---

## 시작 명령

```
위 스펙을 바탕으로 전체 파일 구조와 구현 계획을 plan으로 먼저 보여주세요.
각 Phase별 예상 소요 시간과 의존성도 함께 정리해주세요.
계획 확인 후 Phase 1부터 순서대로 구현을 시작하겠습니다.
```

---

## 🗂 문제 데이터 JSON 형식 (호스트가 업로드)

```json
{
  "sessionName": "2025 여름 수련회",
  "rounds": [
    {
      "roundNumber": 1,
      "theme": "성경 초성 퀴즈",
      "gameMode": "consonant",
      "questions": [
        {
          "content": "모세가 홍해를 건넌 사건",
          "consonantHint": "ㅎㅎㅂㄴ",
          "correctAnswer": "홍해바다 건넘",
          "timeLimit": 20
        }
      ]
    },
    {
      "roundNumber": 2,
      "theme": "반응 속도 게임",
      "gameMode": "reaction",
      "questions": [
        {
          "content": "신호가 뜨면 바로 누르세요!",
          "correctAnswer": "__reaction__",
          "timeLimit": 5
        }
      ]
    },
    {
      "roundNumber": 3,
      "theme": "사진 맞추기",
      "gameMode": "image_quiz",
      "questions": [
        {
          "content": "이 장소는 어디일까요?",
          "imageUrl": "https://...",
          "correctAnswer": "예루살렘",
          "timeLimit": 15
        }
      ]
    }
  ]
}
```

---

## 💰 예상 비용 요약

| 서비스 | 플랜 | 월 비용 |
|--------|------|---------|
| Vercel | Hobby (무료) | ₩0 |
| Railway | Starter $5 | ~₩7,000 |
| Supabase | Free tier | ₩0 |
| 도메인 | 선택 사항 | ₩1,000~1,500/월 환산 |
| **합계** | | **₩7,000~8,500/월** |

> Railway $5 크레딧은 소규모 서버 충분히 운영 가능.
> 100명 동시 접속 + Socket.io는 약 50~100MB RAM 사용 예상.
