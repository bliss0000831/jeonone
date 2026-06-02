-- ============================================================================
-- (1) 광장별 PortOne 결제 채널 설정 컬럼
-- (2) 공동구매 visibility (광장 / 전국)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) plazas — 광장별 PG/사업자 정보
--    같은 PortOne 계정 안에 여러 채널을 등록한 뒤, 광장별로 바인딩.
--    강릉 사업자 / 춘천 사업자 / … 분리 정산.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.plazas
  ADD COLUMN IF NOT EXISTS portone_store_id    TEXT,         -- store-xxxxxxxx
  ADD COLUMN IF NOT EXISTS portone_channel_key TEXT,         -- channel-key-xxxxxxxx
  ADD COLUMN IF NOT EXISTS pg_provider         TEXT DEFAULT 'mock',  -- 'portone' | 'mock'
  ADD COLUMN IF NOT EXISTS business_number     TEXT,         -- 사업자등록번호 (XXX-XX-XXXXX)
  ADD COLUMN IF NOT EXISTS business_name       TEXT,         -- 등록 상호
  ADD COLUMN IF NOT EXISTS business_holder     TEXT,         -- 대표자명
  ADD COLUMN IF NOT EXISTS settlement_email    TEXT,         -- 정산 알림 메일
  ADD COLUMN IF NOT EXISTS payments_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
                                                              -- 결제 기능 on/off (사업자 등록 전엔 false)

-- 슈퍼관리자만 수정 가능 (super-admin API 가 service-role 로 접근 → RLS 우회).
-- 일반 사용자는 SELECT 시 민감 컬럼 보이지 않도록 view 사용 가능 (현재는 그대로 두고 라우트 단에서 마스킹).

-- ────────────────────────────────────────────────────────────────────────────
-- 2) group_buying_posts — visibility 컬럼
--    'plaza'    : 본인 광장만 (기본)
--    'national' : 전국 공개 (다른 광장에서도 보임)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_buying_posts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'plaza'
    CHECK (visibility IN ('plaza', 'national'));

-- 인덱스 — 전국 공개 글 빠른 조회
CREATE INDEX IF NOT EXISTS idx_group_buying_posts_visibility
  ON public.group_buying_posts(visibility, status, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
