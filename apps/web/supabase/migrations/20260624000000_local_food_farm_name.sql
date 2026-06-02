-- 로컬푸드 — 농가/가게명(farm_name) 컬럼 추가
-- 홈 카드/리스트에서 "🌱 행복농원" 식으로 노출하기 위함.
-- nullable: 기존 행 backfill 강제 안 함, 클라이언트에서 fallback (작성자 닉네임 등) 처리.

ALTER TABLE public.local_food
  ADD COLUMN IF NOT EXISTS farm_name TEXT;

COMMENT ON COLUMN public.local_food.farm_name IS
  '농가/가게/브랜드 이름. NULL 허용 — 비어 있으면 클라이언트에서 작성자 닉네임으로 fallback.';
