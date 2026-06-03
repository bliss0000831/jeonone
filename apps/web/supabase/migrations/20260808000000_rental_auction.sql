-- ============================================================================
-- 전원일기 Phase 5~6 — 대여(rental) · 경매(auction) 기반 스키마
--   secondhand_posts.listing_type 으로 sale/rental/auction 구분 (이미 추가됨).
--   여기서는 거래방식별 부가 정보 + 예약/입찰 테이블을 만든다.
-- ============================================================================

-- ───── 대여 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES public.secondhand_posts(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id     TEXT,
  daily_price  INTEGER,            -- 일 단가(원)
  weekly_price INTEGER,            -- 주 단가
  monthly_price INTEGER,           -- 월 단가
  deposit      INTEGER DEFAULT 0,  -- 보증금
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_listings_post  ON public.rental_listings(post_id);
CREATE INDEX IF NOT EXISTS idx_rental_listings_plaza ON public.rental_listings(plaza_id);

CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id    UUID NOT NULL REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  renter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  deposit      INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'requested', -- requested|approved|in_use|returned|completed|cancelled
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_rental ON public.rental_bookings(rental_id);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_renter ON public.rental_bookings(renter_id);

-- ───── 경매 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auction_listings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          UUID NOT NULL REFERENCES public.secondhand_posts(id) ON DELETE CASCADE,
  seller_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id         TEXT,
  start_price      INTEGER NOT NULL DEFAULT 0,
  buy_now_price    INTEGER,                 -- 즉시구매가 (옵션)
  bid_increment    INTEGER NOT NULL DEFAULT 1000,
  current_price    INTEGER NOT NULL DEFAULT 0,
  current_bidder_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bid_count        INTEGER NOT NULL DEFAULT 0,
  start_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at           TIMESTAMPTZ NOT NULL,
  auto_extend      BOOLEAN NOT NULL DEFAULT TRUE,  -- 마감 임박 자동연장
  status           TEXT NOT NULL DEFAULT 'active', -- active|ended|cancelled
  winner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auction_listings_post   ON public.auction_listings(post_id);
CREATE INDEX IF NOT EXISTS idx_auction_listings_plaza  ON public.auction_listings(plaza_id);
CREATE INDEX IF NOT EXISTS idx_auction_listings_status ON public.auction_listings(status, end_at);

CREATE TABLE IF NOT EXISTS public.auction_bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id  UUID NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  bidder_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON public.auction_bids(auction_id, created_at DESC);

-- ───── RLS ────────────────────────────────────────────────
ALTER TABLE public.rental_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_bookings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids     ENABLE ROW LEVEL SECURITY;

-- 읽기: 모두
DROP POLICY IF EXISTS rental_listings_read ON public.rental_listings;
CREATE POLICY rental_listings_read ON public.rental_listings FOR SELECT USING (true);
DROP POLICY IF EXISTS auction_listings_read ON public.auction_listings;
CREATE POLICY auction_listings_read ON public.auction_listings FOR SELECT USING (true);
DROP POLICY IF EXISTS auction_bids_read ON public.auction_bids;
CREATE POLICY auction_bids_read ON public.auction_bids FOR SELECT USING (true);

-- 쓰기: 본인
DROP POLICY IF EXISTS rental_listings_write ON public.rental_listings;
CREATE POLICY rental_listings_write ON public.rental_listings FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS auction_listings_write ON public.auction_listings;
CREATE POLICY auction_listings_write ON public.auction_listings FOR ALL TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

-- 예약/입찰: 본인 행 + 읽기
DROP POLICY IF EXISTS rental_bookings_rw ON public.rental_bookings;
CREATE POLICY rental_bookings_rw ON public.rental_bookings FOR ALL TO authenticated
  USING (renter_id = auth.uid()) WITH CHECK (renter_id = auth.uid());
DROP POLICY IF EXISTS auction_bids_insert ON public.auction_bids;
CREATE POLICY auction_bids_insert ON public.auction_bids FOR INSERT TO authenticated
  WITH CHECK (bidder_id = auth.uid());
