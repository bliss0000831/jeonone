-- ============================================================================
-- admin write 정책에 광장 격리 추가 (defense-in-depth)
--
-- 문제:
--   기존 *_admin_write 정책은 is_app_admin(uid) 만 체크 → chuncheon admin 도
--   강릉 hero_banners 를 UPDATE/DELETE 가능 (응용 필터에만 의존, RLS 미차단).
--
-- 해결:
--   - is_plaza_admin(uid, plaza) 헬퍼 추가
--     · plaza_admins (admin/moderator/super) 의 해당 plaza_id 행
--     · OR legacy profiles.role = 'superadmin' (전역 관리자)
--     · plaza_admins super 는 부트스트랩 시 모든 광장에 row 존재 → 자동 통과
--   - hero_banners/popups/notices/faqs/property_highlights/search_term_blacklist/
--     moderation_keywords 의 write 정책을 plaza_id 매칭 강제로 교체
--
-- 부수:
--   post_reports 에 admin SELECT/UPDATE 정책 추가 (현재 reporter 본인만 select 가능)
-- ============================================================================

BEGIN;

-- ─── helper: is_plaza_admin(uid, plaza) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_plaza_admin(p_uid UUID, p_plaza TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plaza_admins
    WHERE user_id = p_uid
      AND plaza_id = p_plaza
      AND role IN ('admin', 'moderator', 'super')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid AND role = 'superadmin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_plaza_admin(UUID, TEXT) TO authenticated, anon;

-- ─── write 정책 교체 — plaza_id 일치 강제 ────────────────────────────────
DO $$
DECLARE
  tbl    TEXT;
  prefix TEXT;
BEGIN
  FOR tbl, prefix IN
    SELECT 'hero_banners',         'hb'   UNION ALL
    SELECT 'popups',               'pop'  UNION ALL
    SELECT 'notices',              'no'   UNION ALL
    SELECT 'faqs',                 'fq'   UNION ALL
    SELECT 'property_highlights',  'ph'   UNION ALL
    SELECT 'search_term_blacklist','stb'  UNION ALL
    SELECT 'moderation_keywords',  'mk'
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=tbl) THEN
      -- plaza_id 컬럼이 있는 테이블만 (보장 — foundation 에서 추가됨)
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=tbl
                   AND column_name='plaza_id') THEN
        EXECUTE format('DROP POLICY IF EXISTS %s_admin_write ON public.%I', prefix, tbl);
        EXECUTE format(
          'CREATE POLICY %s_admin_write ON public.%I FOR ALL TO authenticated
           USING (public.is_plaza_admin(auth.uid(), plaza_id))
           WITH CHECK (public.is_plaza_admin(auth.uid(), plaza_id))',
          prefix, tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ─── post_reports admin 정책 추가 ─────────────────────────────────────────
-- 현재 SELECT 는 reporter 본인만 가능 → admin API 가 service_role 우회로 의존.
-- 광장 admin 이 RLS 차원에서도 자기 광장 신고만 보고/업데이트하도록 추가.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='post_reports') THEN
    -- plaza_id 컬럼 존재 시에만
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='post_reports'
                 AND column_name='plaza_id') THEN
      EXECUTE 'DROP POLICY IF EXISTS pr_admin_read ON public.post_reports';
      EXECUTE 'CREATE POLICY pr_admin_read ON public.post_reports
        FOR SELECT TO authenticated
        USING (public.is_plaza_admin(auth.uid(), plaza_id))';

      EXECUTE 'DROP POLICY IF EXISTS pr_admin_write ON public.post_reports';
      EXECUTE 'CREATE POLICY pr_admin_write ON public.post_reports
        FOR UPDATE TO authenticated
        USING (public.is_plaza_admin(auth.uid(), plaza_id))
        WITH CHECK (public.is_plaza_admin(auth.uid(), plaza_id))';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
