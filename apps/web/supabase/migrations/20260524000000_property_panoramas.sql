-- ============================================================================
-- 부동산 매물에 360° 가상 투어 (집 내부 파노라마) 추가
--
-- panorama_images: JSONB 배열
--   각 항목: { url: string, title: string }
--   예) [
--     { "url": "https://r2.../living.jpg", "title": "거실" },
--     { "url": "https://r2.../bedroom.jpg", "title": "안방" }
--   ]
--
-- 구현: Pannellum (오픈소스 360° 뷰어, ~30KB) 로 정사영(equirectangular) 사진 표시.
-- 사용자는 360° 카메라 또는 스마트폰 앱(Google Street View 등) 으로 촬영해 업로드.
-- ============================================================================

BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS panorama_images JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN properties.panorama_images IS
  '360° 가상 투어 이미지. [{url, title}] 형태. Pannellum 뷰어로 표시.';

NOTIFY pgrst, 'reload schema';

COMMIT;
