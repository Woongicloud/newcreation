# v2 프로토콜

서버(`server/src/`)와 모든 화면(`client/src/lib/connection.js`)이 주고받는 내용. 이름은 `shared/protocol.js`에 상수로 있다.

## 연결과 역할

| 역할 | 들어오는 방법 | 받는 내용 |
|---|---|---|
| 참가자 | `player:register` → 토큰 발급. 재접속은 `room:join { roomCode, token }` | 문제(정답 제외), 본인 점수·순위·채점 결과 |
| Display | `room:join { roomCode, role: 'display' }` (토큰 없음) | 문제, 제출 현황, 집계, 시상의 공개된 부분 |
| 진행자 | 관리자가 발급한 링크의 토큰으로 `room:join` | 정답, 다음 순서, 순서표, 시상 결과 미리보기 |
| 관리자 | `POST /api/admin/login` → 토큰. 소켓 연결 시 `auth: { token }` | 진행자 내용 + 참가자 전체 목록 |

- 토큰은 서버가 서명한다(HMAC). 비밀번호는 클라이언트에 두지 않는다.
- 진행자 토큰은 발급된 방에서만 통하고 24시간 뒤 만료된다. 관리자 토큰은 12시간.
- 모든 요청은 ack 콜백으로 `{ ok: true, ... }` 또는 `{ ok: false, error, message }`를 받는다.

## 진행 단계 (`phase`)

```
lobby → round_intro → question_open → question_closed → question_reveal
                           ↑                                   │
                           └────────── 다음 문제 ───────────────┤
                                                               ↓
                                       round_end → (다음 라운드) … → final → awards
```

| 단계 | 의미 |
|---|---|
| `lobby` | 참가자 입장 대기. 세트를 올려야 입장할 수 있다 |
| `round_intro` | 라운드 제목 안내 |
| `question_open` | 답안 접수 중. 제한 시간이 지나거나 접속자 전원이 제출하면 자동 마감 |
| `question_closed` | 접수 마감. 정답은 아직 진행자·관리자에게만 보인다 |
| `question_reveal` | 정답과 통계 공개 |
| `round_end` | 라운드 종료. `standingsAfter` 라운드면 집계가 자동으로 뜬다 |
| `final` | 모든 라운드 종료, 시상 결과 계산 완료 |
| `awards` | 시상 진행 중 |

집계(`standings`)와 메인 화면(`showMain`)은 단계가 아니라 그 위에 겹쳐 띄우는 표시다.

## 진행 명령 — `host:command { type, step, ...args }`

진행자와 관리자가 같이 쓴다. `step`에는 마지막으로 받은 상태의 `step`을 넣는다.
서버의 현재 값과 다르면 `error: 'stale'`로 거절한다 → 더블 탭, 두 기기 동시 조작에도 한 번만 처리된다.

| type | 동작 |
|---|---|
| `next` | 지금 단계의 다음 동작 (게임 시작 → 문제 시작 → 정답 공개 → 다음 문제 → 라운드 종료 → … → 시상 항목 → 한 단계 공개) |
| `reveal` | 접수 마감 + 정답 공개 |
| `skip` | 공개 전인 현재 문제를 무효 처리하고 다음으로 |
| `goto { round, question }` | 해당 문제로 이동 (0부터). 이미 채점한 문제를 다시 내면 이전 채점은 지워진다 |
| `pause` / `resume` | 타이머와 접수를 멈춤 / 남은 시간부터 재개 |
| `extend_time { seconds }` | 제한 시간 연장 (기본 10초) |
| `show_standings { scope }` / `hide_standings` | 개인 집계 송출. `scope`: `total`(기본) / `round`. 정답 공개 전(접수 중·마감)에는 불가 |
| `end_game` | 진행 중인 문제를 마감하고 `final`로 |
| `award_next` | 다음 시상 항목 열기 (추첨은 이때 서버가 뽑는다) |
| `award_step` | 현재 항목을 한 단계 공개 |
| `show_main` / `hide_main` | Display를 메인 화면으로 / 원래 화면으로 |

상태의 `next.action`이 `next`가 지금 할 일을 알려준다: `start_game` `open_question` `reveal` `next_question` `end_round` `next_round` `finish` `award_next` `award_step` 또는 `null`.

## 상태 — `room:state`

상태가 바뀔 때마다 역할에 맞는 전체 스냅샷이 온다. 참가자가 답을 제출하면 그 참가자에게만 새 스냅샷이 바로 간다(`me.answered`, `me.answer`). **채점 결과(`me.result`)와 이번 문제 점수는 `question_reveal` 단계에서 처음 보낸다** — 그 전까지 `me.score`는 이번 문제 점수를 뺀 값이다. 옆 사람 폰으로 정답이 새지 않게 하기 위함이다. 화면은 이것만으로 그릴 수 있어야 한다(재접속 시에도 같은 스냅샷 한 번).

```jsonc
{
  "v": 2, "role": "player", "roomCode": "AB2CD3",
  "step": 17,                       // 진행 명령에 실어 보낼 값
  "phase": "question_open",
  "serverNow": 1794400000000,       // 기기 시계 보정용
  "sessionName": "11월 레크레이션",
  "hasSet": true,
  "teams": { "labels": { "group": "학년", "unit": "브릿지" }, "groups": [{ "name": "중1", "units": ["브릿지 A"] }] },
  "settings": { "chatEnabled": true, "chatFontScale": 1, "chatOpacity": 1, "chatSpeed": 1,
                "theme": "default", "background": null, "standingsSpeed": 1 },
  "showMain": false,
  "playerCount": 41, "onlineCount": 38,
  "position": { "round": 1, "roundCount": 5, "question": 2, "questionCount": 8, "theme": "초성 퀴즈", "gameMode": "consonant" },
  "question": { "id": "1:2", "number": 3, "gameMode": "consonant", "content": "…", "consonantHint": "ㅂㄷㄹㅎ",
                "timeLimit": 20, "points": 150, "penalty": 50 },
                // correctAnswer 는 진행자·관리자에게 항상, 나머지는 question_reveal 에서만
                // answerImage·answerNote(정답 참고 사진·설명)는 모든 역할에 question_reveal 에서만
  "timer": { "deadlineAt": 1794400020000, "paused": false, "remainingMs": null },
                // 매초 tick 은 없다. 화면이 deadlineAt - (now + 시계 차이) 로 계산
  "submittedCount": 12,
  "reaction": null,                 // 반응속도: { "signaled": false } → 신호 시점에 true
  "stats": null,                    // question_reveal: { answered, correct, choiceCounts?, reaction?, falseStarts? }
  "standings": null,                // 송출 중: { visible, scope, entries: [{ rank, group, unit, name, score }] } — 상위 10명
  "award": null                     // awards: { index, total, type, title, reveal, step, steps, revealed, pool? }
}
```

역할별 추가 필드

| 역할 | 필드 |
|---|---|
| 참가자 | `me { id, name, group, unit, score, rank, answered, answer, result, emoji }` — `answer`는 본인이 낸 답, `result`는 공개 후에만 |
| Display | `lobby [{ name, group, unit }]` (대기실에서만) |
| 진행자·관리자 | `next { action, content?, correctAnswer?, theme?, title? }`, `outline` (순서표), `awardConfig` (시상 세트 구성), `awardList`·`awardIndex` (종료 후 결과), `award.result` (공개 전 전체 결과) |
| 관리자 | `players [{ id, name, group, unit, score, online, rank }]` |

그 밖의 서버 → 클라이언트 이벤트

| 이벤트 | 받는 쪽 | 내용 |
|---|---|---|
| `room:progress` | Display·진행자·관리자 | `{ step, submittedCount, onlineCount }` — 제출이 들어올 때마다 |
| `player:result` | 해당 참가자 | 이모지 찾기 오답 재시도 알림만 `{ retry: true }`. 그 밖의 결과는 공개 때 상태로 온다 |
| `chat:message` | 방 전체 | `{ id, message, sender, y }` — 글자 크기·속도는 Display가 표시 설정으로 정한다 |
| `room:closed` | 방 전체 | 방이 닫힘 |

## 참가자·관리자 요청

| 이벤트 | 보내는 쪽 | 내용 |
|---|---|---|
| `player:register { roomCode, name, group, unit }` | 참가자 | → `{ token, playerId, state }`. 같은 이름·소속이 끊겨 있으면 이어받고, 접속 중이면 거절 |
| `player:answer { answer }` | 참가자 | → `{ ok }`만 (결과 없음). 이모지 찾기는 오답이면 `retry: true` |
| `player:react { clientMs }` | 참가자 | 반응속도. 신호 전이면 실격(`falseStart`) |
| `chat:send { message }` | 참가자 | 60자, 0.7초 간격 제한 |
| `admin:create_room` | 관리자 | → `{ roomCode, state }` |
| `admin:load_set { roomCode, set }` | 관리자 | 검증 후 적용. 실패 시 `errors [{ path, message }]`. 게임 시작 전에만 |
| `admin:settings { roomCode, patch }` | 관리자 | 표시 설정 변경 |
| `admin:set_awards { roomCode, items }` | 관리자 | 시상 세트 교체. 시상을 시작하기 전까지. 게임 종료 뒤면 결과를 다시 계산 |
| `admin:update_player` / `admin:remove_player` | 관리자 | 이름·소속 수정 / 내보내기 |
| `admin:host_token { roomCode }` | 관리자 | 진행자 링크용 토큰 |
| `admin:list_rooms` / `admin:close_room` | 관리자 | 방 목록 / 방 닫기 |

HTTP

| 경로 | 내용 |
|---|---|
| `POST /api/admin/login { password }` | 관리자 토큰. 5분에 10회 제한 |
| `GET /api/rooms/:code/public` | 등록 화면용 — `{ ready, finished, sessionName, teams }` |
| `POST /api/media/upload-url { filename, kind }` | (관리자) 스토리지 서명 업로드 URL |
| `GET /api/media?kind=` | (관리자) 올려둔 파일 목록 |

## 점수 규칙 (`shared/scoring.js`)

- 정답 `+points`, 오답 `-penalty`, 미제출 0. 시간은 점수에 영향이 없다.
- 직접 입력하는 답은 띄어쓰기·대소문자·문장부호를 무시하고, `correctAnswer`와 `acceptAnswers` 중 하나와 같으면 정답. 객관식은 보기를 그대로 비교. `acceptAnswers`는 `correctAnswer`와 같은 시점에 전달된다 (진행자·관리자는 항상, 나머지는 공개 때).
- 점수 값은 `문제 → 라운드 → 세트(scoring) → 기본값(5 / 0)` 순으로 찾는다. 큰 단위(100점 등)로 쓴 세트는 업로드 때 가장 많이 쓰인 점수를 `scaleTo`(기본 5)로 맞춰 비율 환산한다 (`autoScale: false`로 끔).
- 팀 점수는 소수 첫째 자리까지 (`1054.5`).
- 라운드 손실 한도 = 그 라운드 문제의 `penalty` 합 × `lossCapRatio`(기본 0.5). 참가자의 감점 누계가 한도에 닿으면 더 깎이지 않는다.
- 반응속도: 빠른 순으로 `rankPoints`, 순위 밖 유효 반응자는 `points`. 신호 전에 누르면 0점.
- 장문 타이핑: 정확도가 `passAccuracy`(기본 0.9) 이상이면 `points`, 아니면 0 (감점 없음).
- 이모지 찾기: 같은 조의 코드를 내면 `points`. 오답은 감점 없이 재시도.
- 순위: 점수 → 누적 응답 시간(짧은 쪽) → 먼저 입장한 순.
- 팀 점수(보정 평균): `(팀원 점수 합 + weight × 전체 평균) ÷ (인원 + weight)`. 한 번도 제출하지 않은 참가자는 제외.

세트 JSON 형식은 `shared/quizSchema.js`의 `validateQuizSet`이 기준이고, 예시는 `sample_quiz_set_v2.json`.
