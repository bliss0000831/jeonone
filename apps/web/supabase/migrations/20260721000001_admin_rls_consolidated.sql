-- ============================================================================
-- admin 테이블 RLS 일괄 보강
--
-- 누락 또는 일관성 부족 문제:
-- 1) user_flags / account_type_requests / search_term_blacklist 등 write RLS 없음
-- 2) 기존 정책들이 profiles.role 만 체크 → plaza_admins 만 등록된 사용자 차단
--
-- 해결:
-- - 모든 admin 테이블 write 정책: plaza_admins OR legacy profiles.role 둘 다 인식
-- - SELECT 는 기존 정책 유지 (변경 X)
--
-- 적용 대상:
--   account_type_requests, user_flags, search_term_blacklist, plaza_associations,
--   plaza_payouts, site_labels, hero_banners, popups, notices, faqs,
--   property_highlights
-- ============================================================================

BEGIN;

-- 공통 admin 권한 체크 헬퍼
CREATE OR REPLACE FUNCTION public.is_app_admin(p_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plaza_admins
    WHERE user_id = p_uid AND role IN ('admin', 'super')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid AND role IN ('admin', 'superadmin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_app_admin(UUID) TO authenticated, anon;

-- ── account_type_requests ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='account_type_requests') THEN
    EXECUTE 'ALTER TABLE public.account_type_requests ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS atr_admin_write ON public.account_type_requests';
    EXECUTE 'CREATE POLICY atr_admin_write ON public.account_type_requests
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()) OR auth.uid() = user_id)
      WITH CHECK (public.is_app_admin(auth.uid()) OR auth.uid() = user_id)';
  END IF;
END $$;

-- ── user_flags ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='user_flags') THEN
    EXECUTE 'ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS user_flags_admin_read ON public.user_flags';
    EXECUTE 'CREATE POLICY user_flags_admin_read ON public.user_flags
      FOR SELECT TO authenticated
      USING (public.is_app_admin(auth.uid()))';

    EXECUTE 'DROP POLICY IF EXISTS user_flags_admin_write ON public.user_flags';
    EXECUTE 'CREATE POLICY user_flags_admin_write ON public.user_flags
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()))
      WITH CHECK (public.is_app_admin(auth.uid()))';
  END IF;
END $$;

-- ── search_term_blacklist ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='search_term_blacklist') THEN
    EXECUTE 'ALTER TABLE public.search_term_blacklist ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS stb_select_all ON public.search_term_blacklist';
    EXECUTE 'CREATE POLICY stb_select_all ON public.search_term_blacklist
      FOR SELECT USING (true)';

    EXECUTE 'DROP POLICY IF EXISTS stb_admin_write ON public.search_term_blacklist';
    EXECUTE 'CREATE POLICY stb_admin_write ON public.search_term_blacklist
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()))
      WITH CHECK (public.is_app_admin(auth.uid()))';
  END IF;
END $$;

-- ── plaza_associations ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='plaza_associations') THEN
    EXECUTE 'ALTER TABLE public.plaza_associations ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS pa_select_admin ON public.plaza_associations';
    EXECUTE 'CREATE POLICY pa_select_admin ON public.plaza_associations
      FOR SELECT TO authenticated
      USING (public.is_app_admin(auth.uid()))';

    EXECUTE 'DROP POLICY IF EXISTS pa_admin_write ON public.plaza_associations';
    EXECUTE 'CREATE POLICY pa_admin_write ON public.plaza_associations
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()))
      WITH CHECK (public.is_app_admin(auth.uid()))';
  END IF;
END $$;

-- ── plaza_payouts ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='plaza_payouts') THEN
    EXECUTE 'ALTER TABLE public.plaza_payouts ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS pp_select_admin ON public.plaza_payouts';
    EXECUTE 'CREATE POLICY pp_select_admin ON public.plaza_payouts
      FOR SELECT TO authenticated
      USING (public.is_app_admin(auth.uid()))';

    EXECUTE 'DROP POLICY IF EXISTS pp_admin_write ON public.plaza_payouts';
    EXECUTE 'CREATE POLICY pp_admin_write ON public.plaza_payouts
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()))
      WITH CHECK (public.is_app_admin(auth.uid()))';
  END IF;
END $$;

-- ── site_labels ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='site_labels') THEN
    EXECUTE 'ALTER TABLE public.site_labels ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS sl_select_all ON public.site_labels';
    EXECUTE 'CREATE POLICY sl_select_all ON public.site_labels
      FOR SELECT USING (true)';

    EXECUTE 'DROP POLICY IF EXISTS sl_admin_write ON public.site_labels';
    EXECUTE 'CREATE POLICY sl_admin_write ON public.site_labels
      FOR ALL TO authenticated
      USING (public.is_app_admin(auth.uid()))
      WITH CHECK (public.is_app_admin(auth.uid()))';
  END IF;
END $$;

-- ── 기존 admin 정책 보강 (plaza_admins fallback 추가) ─────────────────────
-- hero_banners, popups, notices, faqs, property_highlights 모두 동일 패턴

DO $$
DECLARE
  tbl TEXT;
  prefix TEXT;
BEGIN
  FOR tbl, prefix IN
    SELECT 'hero_banners', 'hb' UNION ALL
    SELECT 'banners', 'ba' UNION ALL
    SELECT 'popups', 'pop' UNION ALL
    SELECT 'notices', 'no' UNION ALL
    SELECT 'faqs', 'fq' UNION ALL
    SELECT 'property_highlights', 'ph'
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
      -- 기존 admin_write 정책 교체 — plaza_admins 인식
      EXECUTE format('DROP POLICY IF EXISTS %s_admin_write ON public.%I', prefix, tbl);
      EXECUTE format(
        'CREATE POLICY %s_admin_write ON public.%I FOR ALL TO authenticated
         USING (public.is_app_admin(auth.uid()))
         WITH CHECK (public.is_app_admin(auth.uid()))',
        prefix, tbl
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
