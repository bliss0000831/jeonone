-- ════════════════════════════════════════════════════════════════
-- 전원일기 — 추가 미적용 마이그레이션 3개 (APPLY_ALL_pending.sql 이후)
-- 1) 게시판 카테고리명 전원일기 톤  2) 전체 9개 도 오픈  3) 정부지원금 중복방지 컬럼
-- 전부 멱등(UPDATE / ADD COLUMN IF NOT EXISTS) — 재실행 안전
-- 대시보드 SQL Editor 에 전체 붙여넣고 1회 Run
-- ════════════════════════════════════════════════════════════════


-- ▼▼▼ 20260815000000_board_category_rename.sql ▼▼▼
-- 전원일기 톤으로 게시판 카테고리명 변경 (전 plaza)
--   자유게시판 → 마을 사랑방 / 일상 공유 → 농업 일기 / 생활 정보 → 살림 정보 / 질문 답변 → 궁금해요
--   (무료 나눔, 정부 지원금은 명확하여 유지)
UPDATE public.board_categories SET name = '마을 사랑방' WHERE slug = 'free';
UPDATE public.board_categories SET name = '농업 일기'   WHERE slug = 'daily';
UPDATE public.board_categories SET name = '살림 정보'   WHERE slug = 'life';
UPDATE public.board_categories SET name = '궁금해요'     WHERE slug = 'qna';
-- ▲▲▲ 20260815000000_board_category_rename.sql ▲▲▲


-- ▼▼▼ 20260816000000_open_all_plazas.sql ▼▼▼
-- ============================================================================
-- 전원일기 — 전체 9개 도 광장 오픈
--
-- Phase 1 에서는 강원만 is_active=true, 나머지 8개 도는 오픈예정(is_open_soon)
-- 으로 막아두었으나, 전체 도를 동시 오픈하기로 결정.
--   - 모든 plazas.is_active = true  → PlazaSelector 에서 전환/입장 가능
--   - 모든 plazas.is_open_soon = false → "오픈예정" 뱃지 제거
-- 콘텐츠(매물/게시판 등)는 plaza_id 로 격리되어 있어, 신규 오픈 도는
-- 초기에는 빈 목록으로 시작하고 사용자가 글을 쌓아가면 채워진다.
-- ============================================================================

BEGIN;

UPDATE plazas
SET is_active    = true,
    is_open_soon = false,
    updated_at   = NOW()
WHERE is_active = false
   OR is_open_soon = true;

COMMIT;
-- ▲▲▲ 20260816000000_open_all_plazas.sql ▲▲▲


-- ▼▼▼ 20260610000001_board_posts_source_dedup.sql ▼▼▼
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
-- ▲▲▲ 20260610000001_board_posts_source_dedup.sql ▲▲▲

