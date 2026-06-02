-- ═══════════════════════════════════════════════════════════
-- H6: 좋아요 카운트 누적 드리프트 1회 보정 (reconcile)
--
-- 배경:
--   카드의 찜 버튼(FavoriteButton)은 그동안 조인 테이블에 row 만 넣고
--   부모 테이블의 카운트 컬럼은 갱신하지 않았다(상세 페이지만 갱신).
--   → 카드에서 누른 좋아요만큼 카운트가 적게 집계되어 목록/상세가 불일치.
--
--   코드 수정(FavoriteButton 이 change_like_count RPC 호출)으로 "앞으로"는
--   정상 집계되지만, 과거에 쌓인 드리프트는 이 스크립트로 1회 보정한다.
--
-- 성격: 멱등(idempotent) · 안전 — 각 카운트를 "실제 조인 row 수"로 재계산만 한다.
--       트리거를 만들지 않으므로 앱의 기존 카운트 유지 로직과 충돌하지 않는다.
--
-- 적용 시점: 반드시 FavoriteButton 코드 배포 "후"에 1회 실행.
--   (코드 배포 전 실행 시, 이후 카드 좋아요가 다시 누락되어 드리프트 재발)
--
-- 제외: new-store — 카드(new_store_likes)와 상세(new_store_favorites)가
--       서로 다른 테이블을 쓰는 별도 이슈가 있어 여기서 보정하지 않음.
-- ═══════════════════════════════════════════════════════════

-- 카운트 컬럼이 없을 가능성에 대비한 안전 가드(있으면 no-op)
alter table public.secondhand_posts add column if not exists likes      integer not null default 0;
alter table public.sharing_posts    add column if not exists likes      integer not null default 0;
alter table public.clubs            add column if not exists like_count  integer not null default 0;
alter table public.local_food       add column if not exists like_count  integer not null default 0;
alter table public.interior_posts   add column if not exists likes      integer not null default 0;
alter table public.moving_posts     add column if not exists likes      integer not null default 0;
alter table public.cleaning_posts   add column if not exists likes      integer not null default 0;
alter table public.repair_posts     add column if not exists likes      integer not null default 0;

-- 중고거래
update public.secondhand_posts p
   set likes = (select count(*) from public.secondhand_likes l where l.post_id = p.id);

-- 나눔
update public.sharing_posts p
   set likes = (select count(*) from public.sharing_likes l where l.post_id = p.id);

-- 모임
update public.clubs p
   set like_count = (select count(*) from public.club_likes l where l.club_id = p.id);

-- 동네맛집
update public.local_food p
   set like_count = (select count(*) from public.local_food_likes l where l.local_food_id = p.id);

-- 인테리어
update public.interior_posts p
   set likes = (select count(*) from public.interior_favorites l where l.post_id = p.id);

-- 이사
update public.moving_posts p
   set likes = (select count(*) from public.moving_favorites l where l.post_id = p.id);

-- 청소
update public.cleaning_posts p
   set likes = (select count(*) from public.cleaning_favorites l where l.post_id = p.id);

-- 수리
update public.repair_posts p
   set likes = (select count(*) from public.repair_favorites l where l.post_id = p.id);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
