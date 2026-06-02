-- ============================================================================
-- moderation_keywords RLS — 관리자 INSERT/UPDATE/DELETE 허용
--
-- 기존 정책: SELECT 만 모두 허용, INSERT/UPDATE/DELETE 는 차단 (API service role 우회 가정)
-- 문제: 모바일 admin 페이지는 anon key 사용 → INSERT/DELETE 실패
--
-- 해결: plaza_admins (admin/super) 또는 legacy profiles.role IN (admin/superadmin)
--      에 등록된 사용자만 INSERT/UPDATE/DELETE 허용
-- ============================================================================

BEGIN;

-- INSERT — admin/super 만
DROP POLICY IF EXISTS "moderation_keywords_insert_admin" ON public.moderation_keywords;
CREATE POLICY "moderation_keywords_insert_admin" ON public.moderation_keywords
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.plaza_admins
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

-- UPDATE — admin/super 만
DROP POLICY IF EXISTS "moderation_keywords_update_admin" ON public.moderation_keywords;
CREATE POLICY "moderation_keywords_update_admin" ON public.moderation_keywords
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.plaza_admins
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

-- DELETE — admin/super 만
DROP POLICY IF EXISTS "moderation_keywords_delete_admin" ON public.moderation_keywords;
CREATE POLICY "moderation_keywords_delete_admin" ON public.moderation_keywords
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.plaza_admins
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
