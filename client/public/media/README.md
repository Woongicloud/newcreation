# 미디어 파일 폴더 (`client/public/media/`)

이미지 퀴즈·오디오 퀴즈에서 사용하는 미디어 파일을 이 폴더에 저장합니다.
Vercel 배포 시 CDN(`/media/파일명`)으로 제공됩니다.

## 사용 방법

1. 이미지/오디오 파일을 이 폴더에 복사한 뒤 git push.
2. 퀴즈 JSON에서 **파일명만** 적으면 서버가 자동으로 `/media/파일명` 으로 변환합니다.

```json
{ "imageUrl": "moses.jpg" }   →  /media/moses.jpg
{ "audioUrl": "hymn.mp3" }    →  /media/hymn.mp3
```

- `/` 또는 `http(s)://` 로 시작하면 그대로 사용합니다(외부 URL 가능).
- 변환 로직: `server/gameEngine.js`의 `resolveMediaUrl()`.

## 지원 형식

- 이미지: `.jpg`, `.png`, `.gif`, `.webp`, `.svg`
- 오디오: `.mp3`, `.m4a`, `.ogg`, `.wav`

## 샘플 / 플레이스홀더 파일

| 파일 | 용도 |
|------|------|
| `bg-pinwheel.svg` | 참가자 화면 파스텔 바람개비 배경 |
| `sample_image_1.svg`, `sample_image_2.svg` | `sample_quiz_set.json` 의 이미지 퀴즈 플레이스홀더 — 실제 사진으로 교체하세요 |

> 오디오 샘플(`sample_audio_1.mp3` 등)은 바이너리라 포함되어 있지 않습니다.
> `sample_quiz_set.json` 의 오디오 퀴즈를 사용하려면 해당 파일명으로 실제 음원을 이 폴더에 추가하세요.
