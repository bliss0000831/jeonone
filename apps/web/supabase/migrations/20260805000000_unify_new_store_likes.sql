-- ═══════════════════════════════════════════════════════════
-- H2: 신장개업(new-store) 찜 테이블 일원화
--
-- 배경:
--   카드 찜 버튼은 new_store_likes 테이블을, 상세 페이지는 new_store_favorites
--   테이블을 따로 써서 하트 상태/카운트가 서로 어긋났다.
--   (new_store_favorites 는 정식 CREATE TABLE 마이그레이션이 없어, 환경에
--    따라 존재하지 않을 수도 있다 → 상세 찜이 조용히 실패해 왔을 가능성)
--
--   코드 수정(상세도 new_store_likes + change_like_count RPC 사용)으로 앞으로는
--   카드/상세가 같은 테이블을 본다. 이 스크립트는 1회 데이터 정합화:
--     1) new_store_favorites 가 있으면 그 찜을 new_store_likes 로 이관(중복 무시)
--     2) new_store_posts.likes 를 실제 new_store_likes row 수로 재계산
--
-- 성격: 멱등(idempotent) · 안전 — 데이터 손실 없음(이관 + 카운트 재계산만).
-- 적용 시점: 반드시 코드 배포 "후"에 1회 실행.
-- ═══════════════════════════════════════════════════════════

-- 카운트 컬럼 안전 가드(있으면 no-op)
alter table public.new_store_posts add column if not exists likes integer not null default 0;

-- 1) new_store_favorites → new_store_likes 이관 (테이블이 존재할 때만)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'new_store_favorites'
  ) then
    insert into public.new_store_likes (user_id, post_id, plaza_id)
    select f.user_id,
           f.post_id,
           coalesce(p.plaza_id, 'chuncheon')
      from public.new_store_favorites f
      join public.new_store_posts p on p.id = f.post_id
     where not exists (
             select 1 from public.new_store_likes l
              where l.user_id = f.user_id and l.post_id = f.post_id
           );
  end if;
end $$;

-- 2) new_store_posts.likes = 실제 찜 수로 재계산
update public.new_store_posts p
   set likes = (select count(*) from public.new_store_likes l where l.post_id = p.id);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
