-- chuncheon_events 자동수집(공공데이터) 지원용 컬럼 추가
ALTER TABLE chuncheon_events
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- 외부소스 중복방지 (source + external_id)
CREATE UNIQUE INDEX IF NOT EXISTS chuncheon_events_source_external_id_key
  ON chuncheon_events (source, external_id)
  WHERE external_id IS NOT NULL;

-- source별 조회/삭제 최적화
CREATE INDEX IF NOT EXISTS chuncheon_events_source_idx
  ON chuncheon_events (source);
