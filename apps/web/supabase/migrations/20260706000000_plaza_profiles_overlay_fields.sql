-- ============================================================================
-- plaza_profiles 에 광장별 오버레이 필드 추가 (🅲 완전 격리 정책)
--
-- 사용자는 각 광장마다 다른 정체성 (닉네임/아바타/연락처/자기소개 등) 을 가질 수 있음.
-- 표시 로직: 광장 콘텐츠 조회 시 글의 plaza_id 기준 plaza_profiles 우선 사용,
-- 없으면 global profiles fallback.
--
-- 백필: 기존 사용자의 profiles 값을 chuncheon plaza_profiles 로 1회 복제.
-- ============================================================================

BEGIN;

ALTER TABLE public.plaza_profiles
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT,
  ADD COLUMN IF NOT EXISTS bio              TEXT,
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS background_url   TEXT,
  ADD COLUMN IF NOT EXISTS account_type     TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS business_hours   TEXT,
  ADD COLUMN IF NOT EXISTS specialties      TEXT[],
  ADD COLUMN IF NOT EXISTS service_areas    TEXT[],
  ADD COLUMN IF NOT EXISTS website          TEXT,
  ADD COLUMN IF NOT EXISTS kakao_id         TEXT,
  ADD COLUMN IF NOT EXISTS location         TEXT,
  ADD COLUMN IF NOT EXISTS region_id        UUID REFERENCES public.regions(id);

-- 백필: 기존 chuncheon plaza_profiles 에 profiles 데이터 복제 (NULL 값만)
UPDATE public.plaza_profiles pp
SET
  avatar_url     = COALESCE(pp.avatar_url, p.avatar_url),
  bio            = COALESCE(pp.bio, p.bio),
  phone          = COALESCE(pp.phone, p.phone),
  account_type   = COALESCE(pp.account_type, p.account_type, 'user'),
  business_hours = COALESCE(pp.business_hours, p.business_hours),
  specialties    = COALESCE(pp.specialties, p.specialties),
  service_areas  = COALESCE(pp.service_areas, p.service_areas),
  website        = COALESCE(pp.website, p.website),
  kakao_id       = COALESCE(pp.kakao_id, p.kakao_id),
  location       = COALESCE(pp.location, p.location)
FROM public.profiles p
WHERE pp.user_id = p.id
  AND pp.plaza_id = 'chuncheon';

-- region_id 백필 — location 에서 시/군 이름 매칭
UPDATE public.plaza_profiles pp
SET region_id = r.id
FROM public.regions r
WHERE r.plaza_id = pp.plaza_id
  AND r.level = 1
  AND pp.location IS NOT NULL
  AND pp.location LIKE '%' || r.name || '%'
  AND pp.region_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
