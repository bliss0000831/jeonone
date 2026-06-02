-- 매물 좌표 컬럼 추가 (지도 조회 시 매번 geocoding API 호출하는 비용 제거)
-- lat, lng 는 매물 등록/수정 시 Naver Geocoding 결과를 저장.
-- 기존 매물(NULL) 은 상세 페이지에서 fallback 으로 실시간 geocoding 후 조용히 업데이트 가능.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 좌표 범위 sanity check (대한민국 + 약간 여유)
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_coords_range_chk;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_coords_range_chk
  CHECK (
    (lat IS NULL AND lng IS NULL)
    OR (lat BETWEEN 32.0 AND 39.5 AND lng BETWEEN 124.0 AND 132.5)
  );

-- 지도 기반 검색 대비 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng
  ON public.properties (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

NOTIFY pgrst, 'reload schema';
