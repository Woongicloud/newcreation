# 퀴즈 세트 JSON 작성 가이드

NewCreation에 올리는 문제 세트 형식. 관리자 화면 **① 준비 → JSON 올리기**로 올린다.
올릴 때 서버가 검사해서, 잘못된 곳이 있으면 `rounds[2].questions[0].correctAnswer`처럼 위치와 함께 알려준다.

완성된 예시는 [sample_quiz_set_v2.json](sample_quiz_set_v2.json).

---

## 전체 구조

```json
{
  "sessionName": "11월 레크레이션",
  "scoring": { "points": 100, "penalty": 50 },
  "teams": {
    "groups": [
      { "name": "중1", "units": ["브릿지 A", "브릿지 B"] },
      { "name": "중2", "units": ["브릿지 A", "브릿지 B", "브릿지 C"] }
    ]
  },
  "awards": { "items": [ /* 시상 항목 */ ] },
  "rounds": [ /* 라운드 배열 */ ]
}
```

| 필드 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `sessionName` | — | `레크레이션` | 행사 이름. 대기 화면·메인 화면에 나온다 |
| `scoring.points` | — | `100` | 정답 점수 기본값 |
| `scoring.penalty` | — | `0` | 오답 감점 기본값 |
| `scoring.lossCapRatio` | — | `0.5` | 라운드 손실 한도 비율 (아래 "점수 규칙") |
| `teams` | — | 없음 | 학년·브릿지 명단. 없으면 참가자가 소속을 자유 입력한다 |
| `awards` | — | 이번 행사 세트 | 최종 시상 구성 |
| `standingsTop` | — | `10` | 중간 집계에 띄울 인원 |
| `display` | — | — | 표시 설정 초기값. 예: `{ "theme": "pastel" }` |
| `rounds` | ✅ | — | 라운드 목록 (순서대로 진행) |

---

## 점수 규칙

- 정답 `+points`, 오답 `-penalty`, 미제출 0점. **시간은 점수에 영향이 없다.**
- 점수 값은 `문제 → 라운드 → scoring → 기본값(100 / 0)` 순으로 찾는다. 대부분은 `scoring`에 한 번만 적고, 보너스 문제에만 `points`를 따로 적으면 된다.
- **손실 한도**: 한 참가자가 한 라운드에서 깎이는 합계는 그 라운드 전체 문제 감점 합의 50%까지. 자동으로 적용되므로 따로 적지 않는다.
  - 예: 감점 50점 × 8문제 = 400점 → 그 라운드에서 최대 200점까지만 깎인다.
- 동점이면 답을 빨리 낸 사람(누적 응답 시간이 짧은 사람)이 위.

> **기존 세트**: `maxScore`는 `points`로 읽는다. 예전에는 빨리 낼수록 점수가 높았지만, 이제는 적힌 점수가 그대로 지급된다.
> `penalty`를 적지 않은 문제는 감점이 없다 (예전 기본값 200 → 0).

---

## 팀 — 학년과 브릿지 (`teams`)

```json
"teams": {
  "labels": { "group": "학년", "unit": "브릿지" },
  "groups": [
    { "name": "중1", "units": ["브릿지 A", "브릿지 B"] },
    { "name": "고1", "units": ["브릿지 A"] }
  ],
  "teamScore": "adjusted",
  "teamScoreWeight": 3
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `groups[].name` | — | 학년 이름 (중복 불가) |
| `groups[].units` | — | 그 학년의 브릿지 이름들. 학년이 다르면 같은 이름을 써도 된다 |
| `labels` | `학년` / `브릿지` | 화면에 표시할 명칭 |
| `teamScore` | `adjusted` | 팀 점수 계산: `adjusted`(보정 평균) / `average`(단순 평균) / `sum`(합계) |
| `teamScoreWeight` | `3` | 보정 평균의 가상 참가자 수 |

- 학생 이름은 넣지 않는다. 참가자가 등록할 때 이름을 입력하고 학년·브릿지를 고른다.
- 보정 평균: `(팀원 점수 합 + 3 × 전체 평균) ÷ (인원 + 3)`. 인원이 적은 팀이 한 명 덕에 1위를 하거나, 인원 많은 팀이 무조건 유리해지는 것을 막는다. 한 번도 제출하지 않은 참가자는 계산에서 뺀다.

---

## 최종 시상 (`awards`)

```json
"awards": {
  "items": [
    { "type": "unit_ranking", "title": "브릿지 순위", "reveal": "countup" },
    { "type": "random", "title": "행운상", "reveal": "slot", "count": 3 },
    { "type": "individual_ranking", "title": "개인 순위", "reveal": "countup", "top": 5 },
    { "type": "special", "metric": "middle", "title": "뉴평 중간값", "reveal": "card" }
  ]
}
```

생략하면 위 구성을 쓴다. `"awards": { "preset": "team_only" }` 또는 `"quick"`으로 미리 만든 구성을 고를 수도 있다.
순서·연출·항목은 관리자 화면 **④ 시상** 탭에서 당일에도 바꿀 수 있다 (시상을 시작하기 전까지).

| type | 내용 | 추가 필드 |
|------|------|-----------|
| `individual_ranking` | 개인 순위 | `top`(기본 3), `scope`: `all` / `group`(학년별) / `unit`(브릿지별) |
| `unit_ranking` | 브릿지 순위 | `top`, `scope`: `all` / `group`(학년별로 나눠서) |
| `group_ranking` | 학년 순위 | `top` |
| `special` | 특별상 한 명 | `metric`: `middle`(정중앙) / `rank`(+`rank` 등수) / `fastest`(평균 응답 최단) / `chattiest`(채팅 최다) / `round_best`(+`round` 번호) |
| `random` | 추첨 | `count`(인원). 공개할 때 서버가 중복 없이 뽑는다 |

| reveal | 연출 | 쓸 수 있는 type |
|--------|------|-----------------|
| `countup` | 하위부터 한 줄씩 공개 | 순위 |
| `podium` | 3등 → 2등 → 1등 단상 | 순위 |
| `bar_race` | 막대가 동시에 차오름 | 팀 순위 |
| `scroll` | 전체 목록 자동 스크롤 | 순위 |
| `card` | 한 명을 카드로 공개 | 특별상 |
| `slot` | 슬롯머신 | 추첨 |

---

## 라운드 공통 구조

```json
{
  "theme": "성경 상식",
  "gameMode": "multiple_choice",
  "points": 100,
  "penalty": 50,
  "standingsAfter": true,
  "questions": [ /* 문제 배열 */ ]
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `theme` | — | 라운드 제목 (화면에 표시) |
| `gameMode` | ✅ | 아래 11가지 중 하나 |
| `points`, `penalty` | — | 이 라운드 문제의 점수·감점 (문제에 따로 적으면 그쪽이 우선) |
| `standingsAfter` | — | `true`면 라운드가 끝날 때 개인 집계를 자동으로 띄운다 |
| `questions` | ✅ | 문제 목록 |

라운드 번호는 배열 순서대로 매겨진다 (`roundNumber`는 적어도 무시된다).

### 게임 모드 목록

| gameMode 값 | 이름 | 설명 |
|------------|------|------|
| `multiple_choice` | 객관식 | 보기 버튼 |
| `short_answer` | 단답형 | 텍스트 직접 입력 |
| `consonant` | 초성 퀴즈 | 초성 힌트 보고 단어 맞추기 |
| `word_guess` | 빈칸 맞추기 | `_` 자리에 들어갈 단어 입력 |
| `image_quiz` | 이미지 퀴즈 | 이미지 보고 정답 입력 |
| `audio_quiz` | 오디오 퀴즈 | 음악/소리 듣고 정답 입력 |
| `reaction` | 반응 게임 | 신호 뜨면 빠르게 누르기 |
| `image_multiple_choice` | 이미지 객관식 | 이미지 보고 보기 선택 |
| `image_memory` | 이미지 기억력 | 이미지를 보며 객관식 |
| `emoji_find` | 이모지 사람 찾기 | 같은 이모지 세트 가진 사람의 코드 입력 |
| `long_typing` | 장문 타이핑 | 화면의 긴 글을 따라 입력 |

---

## 문제 공통 필드

| 필드 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `content` | ✅ | — | 문제 내용 (프로젝터에 크게 표시) |
| `correctAnswer` | ✅ | — | 정답 (대소문자·띄어쓰기 무시하고 비교). 반응 게임·이모지 찾기는 필요 없다 |
| `timeLimit` | — | `20` | 제한 시간(초). 제출 마감으로만 쓰인다 |
| `points` | — | 라운드/세트 값 | 정답 점수 |
| `penalty` | — | 라운드/세트 값 | 오답 감점 |

### 모드별로 달라진 점

| 모드 | 내용 |
|------|------|
| `reaction` | 빠른 순으로 `rankPoints` 점수(예: `[300, 200, 100]`), 순위 밖은 `points`. 신호 전에 누르면 실격(0점). `correctAnswer`는 필요 없다 |
| `long_typing` | 정확도가 `passAccuracy`(기본 `0.9`) 이상이면 `points`, 아니면 0점. 감점 없음 |
| `emoji_find` | 같은 조의 코드를 내면 `points`. 틀려도 감점 없이 다시 시도. `correctAnswer`는 필요 없다 |
| `image_memory` | 이미지를 제한 시간 내내 보여주며 객관식으로 답한다. `memorizeDuration`은 쓰지 않는다 |

---

## 게임 모드별 상세 형식

---

### 1. 객관식 `multiple_choice`

보기 4개를 제시하고 참가자가 버튼을 눌러 선택.  
프로젝터에 문제 + 선택지, 폰에는 ①②③④ 버튼만 표시.

```json
{
  "theme": "성경 상식",
  "gameMode": "multiple_choice",
  "questions": [
    {
      "content": "예수님이 태어난 곳은?",
      "choices": ["예루살렘", "베들레헴", "나사렛", "갈릴리"],
      "correctAnswer": "베들레헴",
      "timeLimit": 15,
      "points": 1000,
      "penalty": 200
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `choices` | array(string) | ✅ | 선택지 4개 (반드시 4개, 순서대로 ①②③④) |

> `correctAnswer`는 `choices` 중 하나와 정확히 일치해야 함.

---

### 2. 단답형 `short_answer`

참가자가 텍스트를 직접 입력. 대소문자·공백은 자동으로 무시하고 비교.

```json
{
  "theme": "노래 가사 맞추기",
  "gameMode": "short_answer",
  "questions": [
    {
      "content": "\"Amazing ___\" 빈칸에 들어갈 단어는?",
      "correctAnswer": "Grace",
      "timeLimit": 20,
      "points": 800
    },
    {
      "content": "신약성경의 첫 번째 책 이름은?",
      "correctAnswer": "마태복음",
      "timeLimit": 15
    }
  ]
}
```

> 정답 비교: `Amazing Grace` = `amazinggrace` = `Amazing  grace` (공백·대소문자 무시)

---

### 3. 초성 퀴즈 `consonant`

초성(자음) 힌트를 보고 단어를 맞추는 모드.  
프로젝터에 초성 힌트가 크게 표시됨.

```json
{
  "theme": "초성 맞추기",
  "gameMode": "consonant",
  "questions": [
    {
      "content": "초성을 보고 단어를 맞춰보세요!",
      "consonantHint": "ㅇㅅ",
      "correctAnswer": "예수",
      "timeLimit": 20,
      "points": 700
    },
    {
      "content": "이번엔 조금 어렵습니다",
      "consonantHint": "ㅅㄱㅈㅅ",
      "correctAnswer": "성경전서",
      "timeLimit": 25,
      "points": 1000
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `consonantHint` | string | ✅ | 초성 자음 나열 (ㄱㄴㄷ... 형식) |

> `consonantHint`는 `correctAnswer`의 각 글자 초성과 대응.  
> 예: 정답 `서울` → 힌트 `ㅅㅇ`

---

### 4. 빈칸 맞추기 `word_guess`

`_` 기호로 빈칸을 표시하고 들어갈 단어를 입력.

```json
{
  "theme": "가사 빈칸 채우기",
  "gameMode": "word_guess",
  "questions": [
    {
      "content": "주 _ 에 있는 기쁨은",
      "correctAnswer": "안",
      "timeLimit": 15,
      "points": 600
    },
    {
      "content": "예 _ 그 _ 도",
      "correctAnswer": "수스",
      "timeLimit": 20,
      "points": 800
    }
  ]
}
```

> `content`의 `_` 위치가 힌트 역할.  
> `correctAnswer`는 `_`에 들어갈 글자/단어.  
> 정답 비교 시 공백은 무시됨.

---

### 5. 이미지 퀴즈 `image_quiz`

이미지를 프로젝터에 띄우고 정답을 입력.  
폰에는 타이머 + 입력창만 표시.

```json
{
  "theme": "인물 맞추기",
  "gameMode": "image_quiz",
  "questions": [
    {
      "content": "이 인물은 누구일까요?",
      "imageUrl": "moses.jpg",
      "correctAnswer": "모세",
      "timeLimit": 20,
      "points": 1000
    },
    {
      "content": "이 장소는 어디일까요?",
      "imageUrl": "https://example.com/jerusalem.jpg",
      "correctAnswer": "예루살렘",
      "timeLimit": 15
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `imageUrl` | string | ✅ | 파일명 또는 절대 URL |

**이미지 파일 준비 방법:**
```
1. client/public/media/ 폴더에 이미지 파일 저장
2. JSON에 파일명만 입력: "imageUrl": "moses.jpg"
   → 자동으로 /media/moses.jpg 로 변환됨
3. 외부 URL도 가능: "imageUrl": "https://..."
```

지원 형식: `.jpg`, `.png`, `.gif`, `.webp`

---

### 6. 오디오 퀴즈 `audio_quiz`

음악이나 소리를 듣고 정답을 맞추는 모드.  
프로젝터에서 자동 재생, 폰에는 ▶ 버튼으로 재청취 가능.

```json
{
  "theme": "찬양 제목 맞추기",
  "gameMode": "audio_quiz",
  "questions": [
    {
      "content": "이 찬양의 제목은?",
      "audioUrl": "amazing_grace.mp3",
      "correctAnswer": "Amazing Grace",
      "timeLimit": 30,
      "points": 1000
    },
    {
      "content": "어떤 찬양 가수의 노래일까요?",
      "audioUrl": "sample_clip.mp4",
      "correctAnswer": "이은혜",
      "timeLimit": 25
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `audioUrl` | string | ✅ | 파일명 또는 절대 URL |

**오디오 파일 준비 방법:**
```
1. client/public/media/ 폴더에 오디오 파일 저장
2. JSON에 파일명만 입력: "audioUrl": "amazing_grace.mp3"
   → 자동으로 /media/amazing_grace.mp3 로 변환됨
```

지원 형식: `.mp3`, `.mp4`, `.m4a`, `.ogg`, `.wav`

> 모바일 자동재생 차단 정책으로 인해 폰에서는 ▶ 버튼을 눌러야 재생됨.  
> 프로젝터(DisplayPage)에서는 문제 시작 시 자동 재생.

---

### 7. 반응 게임 `reaction`

신호가 뜨면 가장 빠르게 누른 순서대로 점수 획득.  
정답 입력 없이 속도만으로 순위 결정.

```json
{
  "theme": "반응속도 대결",
  "gameMode": "reaction",
  "questions": [
    {
      "content": "노란 버튼이 뜨면 바로 누르세요!",
      "timeLimit": 5,
      "points": 1000
    },
    {
      "content": "2라운드! 더 빠르게!",
      "timeLimit": 5,
      "points": 500
    }
  ]
}
```

> `correctAnswer`는 적지 않는다. `rankPoints`로 순위별 점수를 줄 수 있다 (예: `"rankPoints": [300, 200, 100]`).
> `timeLimit`은 신호 표시 후 입력 대기 시간 (5초 권장).  
> 점수는 빠른 순서대로 차등 배분 (1등: maxScore, 꼴등: 최소점수).

---

### 8. 이미지 객관식 `image_multiple_choice`

이미지를 보여주고 4지선다로 정답을 고르는 모드. (기존 `image_quiz` 주관식 버전과 별개)  
프로젝터·휴대폰 모두에 이미지가 표시됩니다.

```json
{
  "theme": "이미지 객관식",
  "gameMode": "image_multiple_choice",
  "questions": [
    {
      "content": "이 인물은 누구일까요?",
      "imageUrl": "moses.jpg",
      "choices": ["모세", "아브라함", "다윗", "엘리야"],
      "correctAnswer": "모세",
      "timeLimit": 20,
      "points": 1000
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `imageUrl` | string | ✅ | 파일명 또는 절대 URL |
| `choices` | array(string) | ✅ | 선택지 4개 |

---

### 9. 이미지 기억력 테스트 `image_memory`

이미지(또는 여러 장의 이미지 세트)를 **제한시간(`timeLimit`) 내내 보여주면서** 그 이미지에 대한 객관식 문제를 출제합니다. 이미지는 **프로젝터와 휴대폰 양쪽에** 표시됩니다.

- 문제마다 `imageUrl`(한 장) 또는 `imageUrls`(여러 장 배열) 중 하나를 넣습니다.
- 별도 암기 단계는 없습니다. 참가자는 이미지를 보면서 답을 고릅니다.
- 한 라운드에 여러 문제(각자 이미지 포함)를 둘 수 있습니다.

```json
{
  "theme": "이미지 기억력 테스트",
  "gameMode": "image_memory",
  "questions": [
    {
      "content": "이 그림 속 사람은 몇 명인가요?",
      "imageUrl": "scene.jpg",
      "choices": ["3명", "4명", "5명", "6명"],
      "correctAnswer": "5명",
      "timeLimit": 15,
      "points": 1000
    },
    {
      "content": "두 이미지에서 달라진 부분은?",
      "imageUrls": ["before.jpg", "after.jpg"],
      "choices": ["하늘 색", "나무 위치", "사람 수", "건물 모양"],
      "correctAnswer": "사람 수",
      "timeLimit": 20,
      "points": 1000
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `imageUrl` | string | 택1 | 이미지 한 장 (파일명 또는 URL) |
| `imageUrls` | array(string) | 택1 | 이미지 세트(여러 장). 있으면 `imageUrl`보다 우선 |
| `choices` | array(string) | ✅ | 선택지 4개 |

---

### 10. 이모지 사람 찾기 `emoji_find`

참가자마다 화면에 **이모지 세트(3개)** 와 **본인의 5자리 코드**가 표시됩니다.  
같은 세트는 **2~3명**이 공유 — 제한시간 안에 같은 세트를 가진 다른 사람을 찾아 그 사람의 코드를 입력하면 정답.  
**틀려도 시간 내 재시도 가능**(정답을 맞히면 잠금).

```json
{
  "theme": "이모지 사람 찾기",
  "gameMode": "emoji_find",
  "questions": [
    {
      "content": "같은 이모지 세트를 가진 사람을 찾아 그 사람의 코드를 입력하세요!",
      "emojiPool": ["🐶", "🐱", "🦁", "🐰", "🐻", "🦊", "🚗", "🚀", "🏠", "🌳", "⚽", "🎸", "🍎", "🌙", "⭐", "🍩"],
      "setSize": 3,
      "groupSize": 2,
      "timeLimit": 60,
      "points": 1000
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `emojiPool` | array(string) | ✅ | — | 세트를 구성할 이모지 풀 (넉넉히, 12개 이상 권장) |
| `setSize` | number | — | `3` | 한 사람에게 보여줄 이모지 개수 |
| `groupSize` | number | — | `2` | 같은 세트를 공유하는 인원(2~3). 홀수 잔여 1명은 직전 그룹에 합쳐 3명이 됩니다 |

> 권장 인원 4명 이상(최소 2명). 인원이 적으면 매칭이 어려울 수 있습니다.  
> 코드는 참가자별로 자동 생성되며, 서버가 같은 그룹 여부로 정답을 판정합니다.

---

### 11. 장문 타이핑 `long_typing`

성경 말씀 같은 **긴 문장을 큰 화면에 띄우고**, 참가자가 따라 입력합니다.  
**원문은 프로젝터에만** 표시되고(휴대폰엔 입력창만), 원문과의 **일치도(정확도)** 로 채점합니다.

```json
{
  "theme": "말씀 타이핑",
  "gameMode": "long_typing",
  "questions": [
    {
      "content": "큰 화면의 말씀을 정확하게 따라 입력하세요",
      "correctAnswer": "수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라",
      "timeLimit": 90,
      "points": 1000,
      "passAccuracy": 0.9
    }
  ]
}
```

| 추가 필드 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `correctAnswer` | string | ✅ | — | 따라 칠 원문 전체 (프로젝터에 표시됨) |
| `passAccuracy` | number | — | `0.9` | "정답"으로 집계할 최소 일치도 (점수는 일치도 비례 부분점수) |

> 점수: 정확도가 `passAccuracy` 이상이면 `points`, 아니면 0점 (감점 없음). 속도는 점수에 영향이 없다.
> 긴 글은 `timeLimit`을 넉넉히(60~120초) 주세요.

---

## 완성 예시: 전체 게임 세트

7개 모드를 모두 활용한 실전 세트 예시:

```json
{
  "sessionName": "2025 여름 수련회 레크레이션",
  "rounds": [
    {
      "theme": "워밍업 - 객관식",
      "gameMode": "multiple_choice",
      "questions": [
        {
          "content": "이번 수련회 주제 성경구절은?",
          "choices": ["요한복음 3:16", "시편 23편", "로마서 8:28", "빌립보서 4:13"],
          "correctAnswer": "로마서 8:28",
          "timeLimit": 15,
          "points": 500
        },
        {
          "content": "우리 교회가 창립된 해는?",
          "choices": ["1998년", "2001년", "2005년", "2010년"],
          "correctAnswer": "2001년",
          "timeLimit": 20
        }
      ]
    },
    {
      "theme": "단답형",
      "gameMode": "short_answer",
      "questions": [
        {
          "content": "신약성경은 총 몇 권인가요?",
          "correctAnswer": "27",
          "timeLimit": 15,
          "points": 800
        }
      ]
    },
    {
      "theme": "초성 퀴즈",
      "gameMode": "consonant",
      "questions": [
        {
          "content": "초성을 보고 찬양 제목을 맞춰보세요!",
          "consonantHint": "ㅎㄴㄴ",
          "correctAnswer": "하나님",
          "timeLimit": 20,
          "points": 700
        }
      ]
    },
    {
      "theme": "빈칸 채우기",
      "gameMode": "word_guess",
      "questions": [
        {
          "content": "너희는 세상의 _ 이라",
          "correctAnswer": "빛",
          "timeLimit": 15
        }
      ]
    },
    {
      "theme": "이미지 퀴즈",
      "gameMode": "image_quiz",
      "questions": [
        {
          "content": "이 성경 속 장소는 어디일까요?",
          "imageUrl": "jordan_river.jpg",
          "correctAnswer": "요단강",
          "timeLimit": 20,
          "points": 1000
        }
      ]
    },
    {
      "theme": "찬양 맞추기",
      "gameMode": "audio_quiz",
      "questions": [
        {
          "content": "이 찬양의 제목은?",
          "audioUrl": "worship_clip.mp3",
          "correctAnswer": "주님 한 분만으로",
          "timeLimit": 30,
          "points": 1000
        }
      ]
    },
    {
      "theme": "최후의 반응 대결",
      "gameMode": "reaction",
      "questions": [
        {
          "content": "신호가 뜨면 바로 누르세요!",
          "timeLimit": 5,
          "points": 1000
        },
        {
          "content": "마지막 기회!",
          "timeLimit": 5,
          "points": 1000
        }
      ]
    }
  ]
}
```

---

## 미디어 파일 관리

### 파일 저장 위치

```
newcreation/
└── client/
    └── public/
        └── media/        ← 여기에 이미지/오디오 파일 저장
            ├── moses.jpg
            ├── jordan_river.jpg
            └── worship_clip.mp3
```

### 사용 규칙

| 입력 | 실제 경로 |
|------|---------|
| `"church.jpg"` | `/media/church.jpg` |
| `"clips/song.mp3"` | `/media/clips/song.mp3` |
| `"https://cdn.example.com/img.jpg"` | 그대로 사용 (외부 URL) |

> `http://` 또는 `https://`로 시작하면 외부 URL로 처리, 나머지는 `/media/`에서 서빙.

### 배포 시 주의사항

- `client/public/media/`에 파일을 추가한 뒤 **git commit & push** 필요
- Vercel이 빌드 시 자동으로 CDN 배포
- 대용량 파일(10MB 이상)은 외부 URL(Google Drive, S3 등) 사용 권장

---

## 자주 하는 실수

| 실수 | 올바른 방법 |
|------|-----------|
| `choices`를 3개 또는 5개 입력 | 반드시 4개 |
| `correctAnswer`가 `choices`에 없음 | `choices` 중 하나와 정확히 일치해야 함 |
| `emoji_find`에 다른 `correctAnswer` 입력 | 반드시 `"__emoji_find__"` |
| `consonantHint`에 글자 포함 | 자음(초성)만 입력: `ㅅㅇ` (서울) |
| 이미지 파일 경로 누락 | `/media/` 폴더에 파일 있는지 확인 후 파일명만 입력 |
| `image_memory` 이미지가 안 보임 | 각 문제에 `imageUrl` 또는 `imageUrls`를 넣으면 제한시간 내내 표시됨 (`memorizeDuration` 불필요) |
| `emoji_find`의 `emojiPool` 너무 적음 | 그룹마다 다른 세트가 나오도록 넉넉히(12개 이상) |
| `roundNumber` 중복 | 각 라운드마다 고유한 번호 |

---

## 샘플 파일

- **`sample_quiz_set_v2.json`** — 새 형식 예시 (점수 기본값, 학년·브릿지, 시상 세트, 순위 점수가 있는 반응 게임).
- **`sample_quiz_set.json`** — 11개 게임 모드를 모두 담은 기존 형식 샘플. 그대로 올릴 수 있다 (`maxScore`는 `points`로 읽고, 팀 설정이 없어 소속은 자유 입력).

관리자 화면 **① 준비 → 📁 JSON 올리기**로 올려 테스트하거나, 복사해서 실제 문제로 고쳐 쓴다. **🎯 연습 세트** 버튼은 내장된 연습 문제를 바로 올린다.

- 이미지 퀴즈는 `client/public/media/sample_image_1.svg`, `sample_image_2.svg` 플레이스홀더를 참조한다 → 실제 사진으로 교체.
- 오디오 퀴즈(`sample_audio_1.mp3`)는 음원 파일을 `client/public/media/`에 넣어야 재생된다.
- 미디어는 주소(`https://…`)로도 지정할 수 있다. 서버에 Supabase Storage가 연결돼 있으면 관리자 **③ 표시 설정**에서 배경을 올릴 수 있다.
