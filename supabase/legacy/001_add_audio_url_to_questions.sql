-- questions 테이블에 audio_url 컬럼 추가
-- audio_quiz 게임 모드 지원을 위해 누락된 컬럼 추가
ALTER TABLE questions ADD COLUMN IF NOT EXISTS audio_url TEXT;
