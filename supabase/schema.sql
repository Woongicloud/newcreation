-- ============================================================
-- NewCreation v2 스키마
-- Supabase SQL Editor 에서 실행.
--
-- 주의: v1 테이블을 지우고 새로 만든다 (기존 데이터는 이관하지 않음).
--       v1 스키마는 supabase/legacy/schema_v1.sql 에 보관.
-- ============================================================

DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS score_events CASCADE;
DROP TABLE IF EXISTS chat_logs CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- 방(게임 세션). 문제 세트와 진행 상태를 통째로 담는다.
CREATE TABLE sessions (
  id            UUID PRIMARY KEY,
  room_code     VARCHAR(6) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'lobby',  -- 진행 단계(lobby … awards) 또는 closed
  session_name  TEXT,
  quiz_set      JSONB,   -- 검증·정규화된 문제 세트 (문제, 팀 명단, 시상 세트)
  settings      JSONB,   -- 표시 설정 (채팅 폰트, 테마, 배경)
  state         JSONB,   -- 진행 상태 스냅샷 — 서버 재시작 시 이것으로 복구
  awards_result JSONB,   -- 게임 종료 시 계산한 시상 결과
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 방 코드는 열려 있는 방끼리만 겹치지 않으면 된다
CREATE UNIQUE INDEX idx_sessions_open_room_code ON sessions(room_code) WHERE status <> 'closed';
CREATE INDEX idx_sessions_created ON sessions(created_at);

-- 참가자
CREATE TABLE players (
  id                UUID PRIMARY KEY,
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name              VARCHAR(20) NOT NULL,
  group_name        VARCHAR(20),   -- 학년
  unit_name         VARCHAR(20),   -- 브릿지
  score             INT NOT NULL DEFAULT 0,
  total_response_ms BIGINT NOT NULL DEFAULT 0,  -- 동점자 순위 결정용
  submit_count      INT NOT NULL DEFAULT 0,
  chat_count        INT NOT NULL DEFAULT 0,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_players_session ON players(session_id);

-- 점수 기록. raw_delta 는 규칙상 점수, applied_delta 는 손실 한도를 적용해 실제 반영된 점수.
CREATE TABLE score_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL,
  round_idx     INT NOT NULL,
  question_idx  INT NOT NULL,
  answer        TEXT,
  is_correct    BOOLEAN,
  raw_delta     INT NOT NULL,
  applied_delta INT NOT NULL,
  response_ms   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_score_events_session_round ON score_events(session_id, round_idx);
CREATE INDEX idx_score_events_player ON score_events(player_id);

-- 채팅
CREATE TABLE chat_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id   UUID,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_session ON chat_logs(session_id);

-- 서버(service_role 키)만 읽고 쓴다. 정책을 두지 않아 브라우저의 anon 키로는 접근할 수 없다.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- 미디어 저장소 (배경, 문제용 이미지·오디오). 읽기는 공개, 올리기는 서버가 발급한 서명 URL 로만.
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;
