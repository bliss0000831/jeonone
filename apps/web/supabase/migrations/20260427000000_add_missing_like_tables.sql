-- 누락된 찜/좋아요 테이블 일괄 생성 (멱등)
-- 대상: sharing_likes, new_store_likes, club_likes,
--       interior_favorites, moving_favorites, cleaning_favorites, repair_favorites
-- 공통 스키마: (user_id, <resource>_id, created_at) + 복합 PK + RLS

-- ─── sharing_likes (나눔) ──────────────────────────────────────
create table if not exists public.sharing_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.sharing_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists sharing_likes_post_idx on public.sharing_likes (post_id);
alter table public.sharing_likes enable row level security;
drop policy if exists "sharing_likes_select_all" on public.sharing_likes;
create policy "sharing_likes_select_all"
  on public.sharing_likes for select using (true);
drop policy if exists "sharing_likes_insert_own" on public.sharing_likes;
create policy "sharing_likes_insert_own"
  on public.sharing_likes for insert with check (auth.uid() = user_id);
drop policy if exists "sharing_likes_delete_own" on public.sharing_likes;
create policy "sharing_likes_delete_own"
  on public.sharing_likes for delete using (auth.uid() = user_id);

-- ─── new_store_likes (신장개업) ────────────────────────────────
create table if not exists public.new_store_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.new_store_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists new_store_likes_post_idx on public.new_store_likes (post_id);
alter table public.new_store_likes enable row level security;
drop policy if exists "new_store_likes_select_all" on public.new_store_likes;
create policy "new_store_likes_select_all"
  on public.new_store_likes for select using (true);
drop policy if exists "new_store_likes_insert_own" on public.new_store_likes;
create policy "new_store_likes_insert_own"
  on public.new_store_likes for insert with check (auth.uid() = user_id);
drop policy if exists "new_store_likes_delete_own" on public.new_store_likes;
create policy "new_store_likes_delete_own"
  on public.new_store_likes for delete using (auth.uid() = user_id);

-- ─── club_likes (모임) ─────────────────────────────────────────
create table if not exists public.club_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);
create index if not exists club_likes_club_idx on public.club_likes (club_id);
alter table public.club_likes enable row level security;
drop policy if exists "club_likes_select_all" on public.club_likes;
create policy "club_likes_select_all"
  on public.club_likes for select using (true);
drop policy if exists "club_likes_insert_own" on public.club_likes;
create policy "club_likes_insert_own"
  on public.club_likes for insert with check (auth.uid() = user_id);
drop policy if exists "club_likes_delete_own" on public.club_likes;
create policy "club_likes_delete_own"
  on public.club_likes for delete using (auth.uid() = user_id);

-- ─── interior_favorites (홈즈) ─────────────────────────────────
create table if not exists public.interior_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.interior_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists interior_favorites_post_idx on public.interior_favorites (post_id);
alter table public.interior_favorites enable row level security;
drop policy if exists "interior_favorites_select_all" on public.interior_favorites;
create policy "interior_favorites_select_all"
  on public.interior_favorites for select using (true);
drop policy if exists "interior_favorites_insert_own" on public.interior_favorites;
create policy "interior_favorites_insert_own"
  on public.interior_favorites for insert with check (auth.uid() = user_id);
drop policy if exists "interior_favorites_delete_own" on public.interior_favorites;
create policy "interior_favorites_delete_own"
  on public.interior_favorites for delete using (auth.uid() = user_id);

-- ─── moving_favorites (이사) ───────────────────────────────────
create table if not exists public.moving_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.moving_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists moving_favorites_post_idx on public.moving_favorites (post_id);
alter table public.moving_favorites enable row level security;
drop policy if exists "moving_favorites_select_all" on public.moving_favorites;
create policy "moving_favorites_select_all"
  on public.moving_favorites for select using (true);
drop policy if exists "moving_favorites_insert_own" on public.moving_favorites;
create policy "moving_favorites_insert_own"
  on public.moving_favorites for insert with check (auth.uid() = user_id);
drop policy if exists "moving_favorites_delete_own" on public.moving_favorites;
create policy "moving_favorites_delete_own"
  on public.moving_favorites for delete using (auth.uid() = user_id);

-- ─── cleaning_favorites (청소) ─────────────────────────────────
create table if not exists public.cleaning_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.cleaning_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists cleaning_favorites_post_idx on public.cleaning_favorites (post_id);
alter table public.cleaning_favorites enable row level security;
drop policy if exists "cleaning_favorites_select_all" on public.cleaning_favorites;
create policy "cleaning_favorites_select_all"
  on public.cleaning_favorites for select using (true);
drop policy if exists "cleaning_favorites_insert_own" on public.cleaning_favorites;
create policy "cleaning_favorites_insert_own"
  on public.cleaning_favorites for insert with check (auth.uid() = user_id);
drop policy if exists "cleaning_favorites_delete_own" on public.cleaning_favorites;
create policy "cleaning_favorites_delete_own"
  on public.cleaning_favorites for delete using (auth.uid() = user_id);

-- ─── repair_favorites (수리) ───────────────────────────────────
create table if not exists public.repair_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.repair_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists repair_favorites_post_idx on public.repair_favorites (post_id);
alter table public.repair_favorites enable row level security;
drop policy if exists "repair_favorites_select_all" on public.repair_favorites;
create policy "repair_favorites_select_all"
  on public.repair_favorites for select using (true);
drop policy if exists "repair_favorites_insert_own" on public.repair_favorites;
create policy "repair_favorites_insert_own"
  on public.repair_favorites for insert with check (auth.uid() = user_id);
drop policy if exists "repair_favorites_delete_own" on public.repair_favorites;
create policy "repair_favorites_delete_own"
  on public.repair_favorites for delete using (auth.uid() = user_id);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
