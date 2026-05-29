-- ============================================================
-- 실시간 레크레이션 게임 시스템 DB 스키마
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 게임 세션
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting',  -- waiting | playing | finished
  current_round INT DEFAULT 0,
  current_question INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 참가자
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(20) NOT NULL,
  class_name VARCHAR(10) NOT NULL,
  score INT DEFAULT 0,
  socket_id VARCHAR(50),
  is_online BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- 라운드
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  theme VARCHAR(50),
  game_mode VARCHAR(30) NOT NULL  -- multiple_choice | short_answer | consonant | word_guess | image_quiz | reaction
);

-- 문제
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  question_number INT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  audio_url TEXT,
  consonant_hint VARCHAR(20),
  correct_answer TEXT NOT NULL,
  choices JSONB,                   -- 객관식: ["①A","②B","③C","④D"]
  time_limit INT DEFAULT 20,
  max_score INT DEFAULT 1000,
  penalty INT DEFAULT 200
);

-- 응답
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  is_correct BOOLEAN,
  response_time_ms INT,
  score_delta INT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 채팅
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
CREATE INDEX IF NOT EXISTS idx_players_socket ON players(socket_id);
CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_round ON questions(round_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_player ON answers(player_id);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_logs(session_id);
