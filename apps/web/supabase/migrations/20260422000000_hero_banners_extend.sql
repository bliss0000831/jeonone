-- ════════════════════════════════════════════════════════════════════════════
-- hero_banners 확장 + 기존 스키마 정합화
--
-- 배경:
--   관리자 페이지(app/admin/banners/page.tsx)와 홈 컴포넌트(components/hero-banner.tsx)는
--   href / order_index / description / icon / gradient 컬럼을 사용하지만
--   기존 마이그레이션은 link_url / sort_order 만 존재.
--   → 로드 시 에러 → 항상 하드코딩 기본값 fallback → 관리자 수정이 반영되지 않음 + 1초 지연
--
-- 동작:
--   1) 누락 컬럼 추가 (idempotent)
--   2) 기존 link_url → href, sort_order → order_index 자동 backfill
--   3) 커스터마이징 컬럼 3개 추가: opacity, font_family, logo_image_url
--   4) 정렬 인덱스 추가
--
-- 모두 IF NOT EXISTS / COALESCE 기반 — 재실행 안전
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) 코드가 실제로 쓰는 컬럼 추가 ────────────────────────────────────────
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS href         TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS icon         TEXT DEFAULT 'Building2';
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS gradient     TEXT DEFAULT 'from-blue-500 to-cyan-500';
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS order_index  INTEGER DEFAULT 0;

-- ─── 2) 커스터마이징 컬럼 (광고 확장용) ─────────────────────────────────────
-- opacity: 0~100 (이미지 위 어둡게 오버레이 퍼센트, 기본 40 = bg-black/40 상당)
-- font_family: 'sans' | 'serif' | 'mono' | '' (빈값=기본)
-- logo_image_url: lucide 아이콘 대신 커스텀 로고 이미지 (null이면 icon 사용)
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS opacity         INTEGER DEFAULT 40;
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS font_family     TEXT    DEFAULT 'sans';
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS logo_image_url  TEXT;

-- ─── 3) 기존 link_url / sort_order 데이터 backfill ──────────────────────────
UPDATE hero_banners
SET href = COALESCE(href, link_url, '/')
WHERE href IS NULL;

UPDATE hero_banners
SET order_index = COALESCE(order_index, sort_order, 0)
WHERE order_index IS NULL;

-- ─── 4) href NOT NULL 보강 (이제 backfill 끝났으니 안전) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hero_banners WHERE href IS NULL) THEN
    UPDATE hero_banners SET href = '/' WHERE href IS NULL;
  END IF;
  -- NOT NULL 제약은 추후 데이터 정리 후 별도로 건다 (여기서는 DEFAULT로만 안전망)
END $$;

ALTER TABLE hero_banners ALTER COLUMN order_index SET DEFAULT 0;

-- ─── 5) 정렬 인덱스 ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS hero_banners_order_idx
  ON hero_banners(order_index ASC, created_at DESC);

-- ─── 6) PostgREST 스키마 캐시 reload ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';
