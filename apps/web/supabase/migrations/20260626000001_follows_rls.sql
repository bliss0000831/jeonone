-- ============================================================================
-- follows 테이블 RLS 정책 — INSERT/DELETE/SELECT 명시.
--
-- 현재 follows 테이블에 INSERT/DELETE 정책이 없어서 클라이언트 직접 호출이
-- 묵음 실패 (로그인된 유저인데도 팔로우 적용 X). 정책 추가.
--
-- 규칙:
--   SELECT: 모두 허용 (팔로워/팔로잉 목록 공개)
--   INSERT: 본인이 follower_id 인 행만
--   DELETE: 본인이 follower_id 인 행만
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follows_select_all ON public.follows;
CREATE POLICY follows_select_all ON public.follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS follows_insert_self ON public.follows;
CREATE POLICY follows_insert_self ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS follows_delete_self ON public.follows;
CREATE POLICY follows_delete_self ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
