# 레크레이션 게임 시스템 (NewCreation)

교회·단체 행사용 실시간 퀴즈 게임. 네 가지 화면으로 운영한다.

| 화면 | 주소 | 기기 | 역할 |
|---|---|---|---|
| 참가자 | `/` | 개인 폰 | 이름·학년·브릿지 등록, 답안 입력, 채팅, 내 점수·순위 |
| Display | `/display?room=코드` | 프로젝터 | 문제·타이머·집계·시상 송출 |
| 진행자 리모트 | `/host` (관리자가 만든 QR로 접속) | 진행자 폰 | 게임 순서 진행, 정답 공개, 집계·시상 |
| 관리자 | `/admin` | PC | 방 생성, 문제 세트, 표시 설정, 참가자 관리, 시상 세트 |

- 설계와 결정 사항: [docs/REVAMP_PLAN.md](docs/REVAMP_PLAN.md)
- 서버·화면 사이 프로토콜: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- 문제 세트 작성법: [quiz_set_guide.md](quiz_set_guide.md) · 예시 [sample_quiz_set_v2.json](sample_quiz_set_v2.json)

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Socket.io-client, Zustand, Framer Motion |
| Backend | Node.js 22, Express, Socket.io |
| Database | Supabase (PostgreSQL + Storage) |
| 배포 | Vercel (client), Railway (server) |

## 로컬 실행

```bash
npm install
```

```bash
npm run dev
```

| 주소 | 설명 |
|---|---|
| http://localhost:5173 | 참가자 등록 |
| http://localhost:5173/admin | 관리자 |
| http://localhost:5173/display | Display |

Supabase 설정 없이도 뜬다 — 이때는 메모리 저장소를 쓰므로 서버를 끄면 기록이 사라진다.
관리자 로그인을 하려면 `server/.env`에 `ADMIN_PASSWORD`가 있어야 한다.

### 환경 변수

**server/.env** (`server/.env.example` 참고)

| 이름 | 설명 |
|---|---|
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호. 서버에서만 확인한다 |
| `TOKEN_SECRET` | 토큰 서명 키. 길고 무작위인 값 (`openssl rand -hex 32`). 없으면 재시작할 때마다 모두 다시 접속해야 한다 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase 프로젝트 주소와 service_role 키 |
| `CLIENT_URL` | 클라이언트 주소 (CORS 허용) |
| `PORT` | 기본 3001 |

**client/.env** (`client/.env.example` 참고)

| 이름 | 설명 |
|---|---|
| `VITE_SERVER_URL` | 서버 주소 |
| `VITE_APP_URL` | QR 코드에 넣을 클라이언트 주소 (생략하면 현재 접속 주소) |

클라이언트에는 비밀번호를 두지 않는다. 예전의 `VITE_ADMIN_PASSWORD`는 더 이상 쓰지 않으니 지운다.

### Supabase

[Supabase Dashboard](https://supabase.com) → SQL Editor에서 `supabase/schema.sql`을 실행한다.

> 이 스크립트는 **기존 테이블(v1)을 지우고** 새로 만든다. 미디어용 Storage 버킷 `media`도 함께 만든다.

## 행사 진행 순서

1. **관리자 PC** `/admin` 로그인 → **① 준비** 탭에서 새 방 → 문제 세트 JSON 올리기
   - 세트에 오류가 있으면 위치와 함께 알려준다. 세트를 올려야 참가자 QR이 나온다 (학년·브릿지 목록이 세트에 있다).
2. **프로젝터 PC**에서 Display 주소를 열고 전체화면
3. **진행자 폰**으로 "진행자 QR"을 찍는다 — 이 QR을 가진 사람은 게임을 진행할 수 있으니 진행자에게만 보여준다
4. **참가자**가 Display의 QR로 접속 → 이름 + 학년 + 브릿지 선택
5. 진행자가 리모트의 큰 버튼으로 진행: 게임 시작 → 문제 시작 → 정답 공개 → 다음 문제 → …
   - `개인 집계`로 상위 10명 순위를 언제든 띄운다 (문제 접수 중 제외)
   - 관리자 PC의 **② 진행** 탭에도 같은 패널이 있어 폰 없이도 진행할 수 있다. 두 곳에서 동시에 눌러도 한 번만 처리된다
6. 게임이 끝나면 같은 버튼으로 시상: 다음 시상 → 공개 → … → `메인 화면 띄우기`

행사 중에 관리자 PC에서 할 수 있는 것: 채팅 글자 크기·테마·배경 변경(**③ 표시 설정**), 참가자 소속 수정·내보내기(**② 진행**), 시상 순서·연출 변경(**④ 시상**, 시상 시작 전까지).

## 점수

- 정답이면 문제에 정해진 점수, 오답이면 정해진 감점. **시간은 점수에 영향이 없다** (동점일 때만 빨리 낸 사람이 위).
- 한 라운드에서 깎이는 점수는 그 라운드 문제 감점 합의 50%까지.
- 브릿지·학년 점수는 보정 평균: `(팀원 점수 합 + 3 × 전체 평균) ÷ (인원 + 3)`. 한 번도 제출하지 않은 사람은 뺀다.

## 테스트

```bash
npm test
```

점수 규칙, 세트 검증, 진행 상태 머신, 시상, 실제 소켓 연결과 재시작 복구를 확인한다.

```bash
npm run loadtest
```

가상 참가자 100명으로 한 판을 돌려 응답 시간을 잰다. `PLAYERS=150`으로 인원을, `TARGET=https://… ADMIN_PASSWORD=…`로 떠 있는 서버를 지정할 수 있다.

## 배포

### Client → Vercel

1. Vercel → New Project → 이 리포 선택. **Root Directory는 비워둔다** (`vercel.json`이 루트에 있다)
2. 환경 변수: `VITE_SERVER_URL` = Railway 서버 주소, `VITE_APP_URL` = Vercel 주소
3. 예전에 넣은 `VITE_ADMIN_PASSWORD`가 있으면 삭제

### Server → Railway

1. Railway → New Project → 이 리포 선택 (루트의 `Dockerfile`로 빌드)
2. 환경 변수: `ADMIN_PASSWORD`, `TOKEN_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CLIENT_URL` = Vercel 주소
3. Railway 서비스의 **Root Directory는 비워두고**, Start Command를 따로 지정했다면 지운다 (`Dockerfile`의 명령을 쓴다)
4. 배포 후 `https://서버주소/api/health`가 `"storage":"supabase"`, `"database":"ok"`를 돌려주는지 확인. `"database":"error"`면 함께 나오는 `databaseError`가 원인이다 (스키마 미적용, 키 오류, 프로젝트 일시정지 등)

서버는 진행 상태를 Supabase에 저장하므로, 행사 중에 Railway가 재시작돼도 방이 그 단계 그대로 복구된다. 참가자·진행자는 자동으로 다시 붙는다.

## 폴더 구조

```
shared/            protocol.js(상태·명령·이벤트)  scoring.js  quizSchema.js(세트 검증)
server/src/        index.js  app.js  http.js  sockets.js  auth.js
  rooms/           room.js(상태 머신)  views.js(역할별 상태)  standings.js  awards.js  registry.js
  persistence/     supabase.js  memory.js
server/test/       Vitest
server/scripts/    loadtest.js
client/src/
  lib/             connection.js(연결·상태 저장소)  themes.js  labels.js
  pages/           player/  display/  host/  admin/
  components/      game-modes/  host/  chat/
supabase/schema.sql
```
