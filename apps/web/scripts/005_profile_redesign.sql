-- ============================================================
-- 005_profile_redesign.sql
-- 마이페이지 + 프로필 페이지 개편 (B+C 하이브리드)
--   · profiles 확장: 커버, 영업시간, 전문분야, 응답지표
--   · follows 테이블 (팔로워/팔로잉)
--   · profile_highlights 테이블 (인스타 스토리 스타일)
-- 기존 컬럼은 건드리지 않고, ADD COLUMN IF NOT EXISTS 만 사용
-- ============================================================

-- 1) profiles 확장 -------------------------------------------
alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists business_hours text,           -- "평일 09:00-18:00" 자유서식
  add column if not exists specialties text[],            -- 전문분야 태그 배열
  add column if not exists service_areas text[],          -- 서비스 지역 (전문가)
  add column if not exists website text,
  add column if not exists kakao_id text,
  add column if not exists response_rate int,             -- 0~100
  add column if not exists avg_response_minutes int,      -- 평균 응답(분)
  add column if not exists completed_deals int default 0, -- 완료 거래 수
  add column if not exists is_verified_phone boolean default false,
  add column if not exists is_verified_business boolean default false,
  add column if not exists is_verified_license boolean default false;

-- 2) follows 테이블 -------------------------------------------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_follower_idx on public.follows(follower_id);
create index if not exists follows_following_idx on public.follows(following_id);

alter table public.follows enable row level security;

drop policy if exists "follows select all" on public.follows;
create policy "follows select all" on public.follows
  for select using (true);

drop policy if exists "follows insert own" on public.follows;
create policy "follows insert own" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows
  for delete using (auth.uid() = follower_id);

-- 3) profile_highlights (원형 스토리) -------------------------
create table if not exists public.profile_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  cover_url text,
  link_url text,                                         -- 클릭 시 이동 (선택)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists highlights_user_idx
  on public.profile_highlights(user_id, sort_order);

alter table public.profile_highlights enable row level security;

drop policy if exists "highlights select all" on public.profile_highlights;
create policy "highlights select all" on public.profile_highlights
  for select using (true);

drop policy if exists "highlights manage own" on public.profile_highlights;
create policy "highlights manage own" on public.profile_highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) 편의 뷰: 팔로워/팔로잉 카운트 ----------------------------
create or replace view public.profile_stats as
select
  p.id as user_id,
  coalesce((select count(*) from public.follows f where f.following_id = p.id), 0) as followers_count,
  coalesce((select count(*) from public.follows f where f.follower_id  = p.id), 0) as following_count
from public.profiles p;

grant select on public.profile_stats to anon, authenticated;
