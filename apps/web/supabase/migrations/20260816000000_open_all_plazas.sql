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
