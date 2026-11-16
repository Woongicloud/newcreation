-- 레크레이션용 파일(사진·음원·배경)의 표시 이름 목록.
-- 파일은 Storage 버킷 media 에 임의 이름으로 저장되고, 사람이 보는 이름은 여기에 둔다.
-- 이름을 바꿔도 파일 주소는 그대로라 문제 세트에 넣은 주소가 깨지지 않는다.
-- Supabase SQL Editor 에서 한 번 실행. (기존 데이터는 지우지 않는다)

CREATE TABLE IF NOT EXISTS media_files (
  path        TEXT PRIMARY KEY,          -- 예: questions/1b2c….mp3
  name        TEXT NOT NULL,             -- 예: 나의 하나님 (후렴).mp3
  folder      TEXT NOT NULL,             -- questions | backgrounds
  size        BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(folder);

-- 서버(service_role 키)만 접근
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
