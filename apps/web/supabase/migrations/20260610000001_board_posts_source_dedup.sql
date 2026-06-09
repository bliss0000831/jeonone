-- ============================================================================
-- board_posts 외부 출처(source) / 출처 식별자(source_id) 컬럼 추가
--
-- 목적: 보조금24(gov24) 등 외부 API 에서 자동 수집한 글의 중복 INSERT 방지.
--   - source     : 출처 라벨 (예: '보조금24'). 사람이 쓴 글은 NULL.
--   - source_id  : 출처 측 고유 ID (gov24 의 '서비스ID'). 사람이 쓴 글은 NULL.
--   - source_url : 원문 상세조회 URL (선택, 표시용).
--
-- 중복 방지: (source, source_id) 부분 UNIQUE 인덱스 — source 가 NOT NULL 인
--   자동 수집 글에만 적용. 기존(사람) 글은 source IS NULL 이라 영향 없음.
--
-- ⚠️ 기존 게시판/cron 동작 보존: 컬럼은 모두 nullable, default NULL.
--    기존 글·기존 INSERT 경로(board/create 등)는 이 컬럼들을 건드리지 않음.
-- ============================================================================

ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS source     TEXT,
  ADD COLUMN IF NOT EXISTS source_id  TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- 자동 수집 글의 (source, source_id) 중복 방지 — 부분 인덱스(사람 글 제외)
CREATE UNIQUE INDEX IF NOT EXISTS board_posts_source_uniq
  ON public.board_posts (source, source_id)
  WHERE source IS NOT NULL;

NOTIFY pgrst, 'reload schema';
