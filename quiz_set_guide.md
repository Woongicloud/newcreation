# 퀴즈 세트 JSON 작성 가이드

NewCreation 게임 시스템에 업로드할 JSON 파일 형식 안내.  
Admin 패널 → "파일 업로드" 버튼으로 불러오면 바로 사용 가능.

---

## 전체 구조

```json
{
  "sessionName": "5월 레크레이션",
  "rounds": [ /* 라운드 배열 */ ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionName` | string | 게임 세션 이름 (표시용) |
| `rounds` | array | 라운드 목록 (순서대로 진행) |

---

## 라운드 공통 구조

```json
{
  "roundNumber": 1,
  "theme": "라운드 제목",
  "gameMode": "게임모드",
  "questions": [ /* 문제 배열 */ ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `roundNumber` | number | ✅ | 라운드 번호 (1부터 순서대로) |
| `theme` | string | ✅ | 라운드 제목 (화면에 표시됨) |
| `gameMode` | string | ✅ | 아래 7가지 중 하나 |
| `questions` | array | ✅ | 문제 목록 |

### 게임 모드 목록

| gameMode 값 | 이름 | 설명 |
|------------|------|------|
| `multiple_choice` | 객관식 | 4지선다 버튼 |
| `short_answer` | 단답형 | 텍스트 직접 입력 |
| `consonant` | 초성 퀴즈 | 초성 힌트 보고 단어 맞추기 |
| `word_guess` | 빈칸 맞추기 | `_` 자리에 들어갈 단어 입력 |
| `image_quiz` | 이미지 퀴즈 | 이미지 보고 정답 입력 |
| `audio_quiz` | 오디오 퀴즈 | 음악/소리 듣고 정답 입력 |
| `reaction` | 반응 게임 | 신호 뜨면 빠르게 누르기 |

---

## 문제 공통 필드

모든 게임 모드에서 사용 가능한 필드:

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `content` | string | ✅ | — | 문제 내용 (프로젝터 화면에 크게 표시) |
| `correctAnswer` | string | ✅ | — | 정답 (대소문자·띄어쓰기 무시하고 비교) |
| `timeLimit` | number | — | `20` | 제한 시간 (초) |
| `maxScore` | number | — | `1000` | 정답 시 최대 획득 점수 |
| `penalty` | number | — | `200` | 오답 시 최대 감점 |

> **점수 계산 방식**  
> - 정답: `maxScore × (0.3 + 빠를수록 × 0.7)` → 빨리 누를수록 고득점  
> - 오답: `-penalty × (0.5 + 빠를수록 × 0.5)` → 빨리 틀릴수록 감점 큼

---

## 게임 모드별 상세 형식

---

### 1. 객관식 `multiple_choice`

보기 4개를 제시하고 참가자가 버튼을 눌러 선택.  
프로젝터에 문제 + 선택지, 폰에는 ①②③④ 버튼만 표시.

```json
{
  "roundNumber": 1,
  "theme": "성경 상식",
  "gameMode": "multiple_choice",
  "questions": [
    {
      "content": "예수님이 태어난 곳은?",
      "choices": ["예루살렘", "베들레헴", "나사렛", "갈릴리"],
      "correctAnswer": "베들레헴",
      "timeLimit": 15,
      "maxScore": 1000,
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
  "roundNumber": 2,
  "theme": "노래 가사 맞추기",
  "gameMode": "short_answer",
  "questions": [
    {
      "content": "\"Amazing ___\" 빈칸에 들어갈 단어는?",
      "correctAnswer": "Grace",
      "timeLimit": 20,
      "maxScore": 800
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
  "roundNumber": 3,
  "theme": "초성 맞추기",
  "gameMode": "consonant",
  "questions": [
    {
      "content": "초성을 보고 단어를 맞춰보세요!",
      "consonantHint": "ㅇㅅ",
      "correctAnswer": "예수",
      "timeLimit": 20,
      "maxScore": 700
    },
    {
      "content": "이번엔 조금 어렵습니다",
      "consonantHint": "ㅅㄱㅈㅅ",
      "correctAnswer": "성경전서",
      "timeLimit": 25,
      "maxScore": 1000
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
  "roundNumber": 4,
  "theme": "가사 빈칸 채우기",
  "gameMode": "word_guess",
  "questions": [
    {
      "content": "주 _ 에 있는 기쁨은",
      "correctAnswer": "안",
      "timeLimit": 15,
      "maxScore": 600
    },
    {
      "content": "예 _ 그 _ 도",
      "correctAnswer": "수스",
      "timeLimit": 20,
      "maxScore": 800
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
  "roundNumber": 5,
  "theme": "인물 맞추기",
  "gameMode": "image_quiz",
  "questions": [
    {
      "content": "이 인물은 누구일까요?",
      "imageUrl": "moses.jpg",
      "correctAnswer": "모세",
      "timeLimit": 20,
      "maxScore": 1000
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
  "roundNumber": 6,
  "theme": "찬양 제목 맞추기",
  "gameMode": "audio_quiz",
  "questions": [
    {
      "content": "이 찬양의 제목은?",
      "audioUrl": "amazing_grace.mp3",
      "correctAnswer": "Amazing Grace",
      "timeLimit": 30,
      "maxScore": 1000
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
  "roundNumber": 7,
  "theme": "반응속도 대결",
  "gameMode": "reaction",
  "questions": [
    {
      "content": "노란 버튼이 뜨면 바로 누르세요!",
      "correctAnswer": "__reaction__",
      "timeLimit": 5,
      "maxScore": 1000
    },
    {
      "content": "2라운드! 더 빠르게!",
      "correctAnswer": "__reaction__",
      "timeLimit": 5,
      "maxScore": 500
    }
  ]
}
```

> `correctAnswer`는 반드시 `"__reaction__"` 고정값.  
> `timeLimit`은 신호 표시 후 입력 대기 시간 (5초 권장).  
> 점수는 빠른 순서대로 차등 배분 (1등: maxScore, 꼴등: 최소점수).

---

## 완성 예시: 전체 게임 세트

7개 모드를 모두 활용한 실전 세트 예시:

```json
{
  "sessionName": "2025 여름 수련회 레크레이션",
  "rounds": [
    {
      "roundNumber": 1,
      "theme": "워밍업 - 객관식",
      "gameMode": "multiple_choice",
      "questions": [
        {
          "content": "이번 수련회 주제 성경구절은?",
          "choices": ["요한복음 3:16", "시편 23편", "로마서 8:28", "빌립보서 4:13"],
          "correctAnswer": "로마서 8:28",
          "timeLimit": 15,
          "maxScore": 500
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
      "roundNumber": 2,
      "theme": "단답형",
      "gameMode": "short_answer",
      "questions": [
        {
          "content": "신약성경은 총 몇 권인가요?",
          "correctAnswer": "27",
          "timeLimit": 15,
          "maxScore": 800
        }
      ]
    },
    {
      "roundNumber": 3,
      "theme": "초성 퀴즈",
      "gameMode": "consonant",
      "questions": [
        {
          "content": "초성을 보고 찬양 제목을 맞춰보세요!",
          "consonantHint": "ㅎㄴㄴ",
          "correctAnswer": "하나님",
          "timeLimit": 20,
          "maxScore": 700
        }
      ]
    },
    {
      "roundNumber": 4,
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
      "roundNumber": 5,
      "theme": "이미지 퀴즈",
      "gameMode": "image_quiz",
      "questions": [
        {
          "content": "이 성경 속 장소는 어디일까요?",
          "imageUrl": "jordan_river.jpg",
          "correctAnswer": "요단강",
          "timeLimit": 20,
          "maxScore": 1000
        }
      ]
    },
    {
      "roundNumber": 6,
      "theme": "찬양 맞추기",
      "gameMode": "audio_quiz",
      "questions": [
        {
          "content": "이 찬양의 제목은?",
          "audioUrl": "worship_clip.mp3",
          "correctAnswer": "주님 한 분만으로",
          "timeLimit": 30,
          "maxScore": 1000
        }
      ]
    },
    {
      "roundNumber": 7,
      "theme": "최후의 반응 대결",
      "gameMode": "reaction",
      "questions": [
        {
          "content": "신호가 뜨면 바로 누르세요!",
          "correctAnswer": "__reaction__",
          "timeLimit": 5,
          "maxScore": 1000
        },
        {
          "content": "마지막 기회!",
          "correctAnswer": "__reaction__",
          "timeLimit": 5,
          "maxScore": 1000
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
| `reaction`에 다른 `correctAnswer` 입력 | 반드시 `"__reaction__"` |
| `consonantHint`에 글자 포함 | 자음(초성)만 입력: `ㅅㅇ` (서울) |
| 이미지 파일 경로 누락 | `/media/` 폴더에 파일 있는지 확인 후 파일명만 입력 |
| `roundNumber` 중복 | 각 라운드마다 고유한 번호 |
