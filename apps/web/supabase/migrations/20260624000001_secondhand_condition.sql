-- 중고거래 — 상품 상태(condition) 컬럼 추가
-- 홈/리스트 카드에서 "🆕 거의 새것" 같은 식으로 노출.
-- 값 후보: '새상품' | '거의 새것' | '사용감 적음' | '사용감 많음'
-- nullable: 기존 행 backfill 강제 안 함, 클라이언트에서 fallback 처리.

ALTER TABLE public.secondhand_posts
  ADD COLUMN IF NOT EXISTS condition TEXT;

COMMENT ON COLUMN public.secondhand_posts.condition IS
  '상품 상태. 권장 값: 새상품 / 거의 새것 / 사용감 적음 / 사용감 많음. NULL 허용.';
