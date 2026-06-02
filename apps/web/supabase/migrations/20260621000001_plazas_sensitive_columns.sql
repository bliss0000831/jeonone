-- ============================================================================
-- plazas 민감 컬럼 격리
--
-- 배경: 20260615 마이그레이션이 plazas 에 PortOne 채널키/사업자등록번호 등을
--       추가했는데, plazas RLS 는 SELECT USING (true) 라서 모든 사용자가
--       PostgREST 로 portone_channel_key, business_number 를 조회 가능.
--       (코드 라우트는 마스킹하지만 raw client 사용 시 우회됨)
--
-- 해결: column-level GRANT 로 분리.
--   - anon/authenticated : 공개 컬럼만 SELECT 가능
--   - service_role        : 모든 컬럼 (super-admin 라우트가 service-role 사용)
--
-- 민감 컬럼:
--   portone_store_id, portone_channel_key, business_number,
--   business_name, business_holder, settlement_email
--
-- Rollback:
--   GRANT SELECT ON public.plazas TO anon, authenticated;
-- ============================================================================

BEGIN;

-- 기존 전체 SELECT 권한 회수
REVOKE SELECT ON public.plazas FROM anon, authenticated;

-- 공개 컬럼만 명시적 GRANT (PortOne/사업자 정보는 제외)
GRANT SELECT (
  id,
  name,
  parent_region,
  center_lat,
  center_lng,
  bounds,
  theme,
  is_active,
  is_open_soon,
  sort_order,
  created_at,
  updated_at,
  coverage,
  tour_area_code,
  tour_sigungu_code,
  pg_provider,
  payments_enabled
) ON public.plazas TO anon, authenticated;

-- service_role 은 기본적으로 모든 권한 보유 (Supabase 디폴트), 명시 없음.

COMMENT ON COLUMN public.plazas.portone_store_id IS
  '민감정보 — service_role 만 조회. PortOne 결제 채널 식별자.';
COMMENT ON COLUMN public.plazas.portone_channel_key IS
  '민감정보 — service_role 만 조회. PortOne 채널 키.';
COMMENT ON COLUMN public.plazas.business_number IS
  '민감정보 — service_role 만 조회. 사업자등록번호.';
COMMENT ON COLUMN public.plazas.business_holder IS
  '민감정보 — service_role 만 조회. 대표자명.';
COMMENT ON COLUMN public.plazas.settlement_email IS
  '민감정보 — service_role 만 조회. 정산 메일.';

NOTIFY pgrst, 'reload schema';

COMMIT;
