-- ============================================================================
-- 좋아요/찜 테이블 privacy 강화 + moderation_keywords 비공개
--
-- 이전: secondhand_likes / jobs_likes / sharing_likes 등 likes 테이블이 SELECT (true) →
--       누가 무엇을 좋아했는지 모두 추적 가능 (privacy leak, 스토킹/타겟팅 위험)
-- 이후: 본인 행만 SELECT 가능. count 는 카드/리스트에서 host 테이블의 likes 컬럼으로 표시.
--
-- 또한 moderation_keywords SELECT (true) → 금칙어 목록 노출되어 우회 단어 추정 가능.
--       관리자(admin/superadmin) + service_role 만 SELECT 가능하도록 변경.
-- ============================================================================

-- ─── secondhand_likes ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "secondhand_likes_select_all" ON public.secondhand_likes;
DROP POLICY IF EXISTS secondhand_likes_select_own ON public.secondhand_likes;
CREATE POLICY secondhand_likes_select_own ON public.secondhand_likes
  FOR SELECT USING (auth.uid() = user_id);

-- ─── jobs_likes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "jobs_likes_select_all" ON public.jobs_likes;
DROP POLICY IF EXISTS jobs_likes_select_own ON public.jobs_likes;
CREATE POLICY jobs_likes_select_own ON public.jobs_likes
  FOR SELECT USING (auth.uid() = user_id);

-- ─── sharing_likes ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sharing_likes') THEN
    EXECUTE 'DROP POLICY IF EXISTS sharing_likes_select_all ON public.sharing_likes';
    EXECUTE 'DROP POLICY IF EXISTS sharing_likes_select_own ON public.sharing_likes';
    EXECUTE 'CREATE POLICY sharing_likes_select_own ON public.sharing_likes FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ─── club_likes ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'club_likes') THEN
    EXECUTE 'DROP POLICY IF EXISTS club_likes_select_all ON public.club_likes';
    EXECUTE 'DROP POLICY IF EXISTS club_likes_select_own ON public.club_likes';
    EXECUTE 'CREATE POLICY club_likes_select_own ON public.club_likes FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ─── new_store_likes ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'new_store_likes') THEN
    EXECUTE 'DROP POLICY IF EXISTS new_store_likes_select_all ON public.new_store_likes';
    EXECUTE 'DROP POLICY IF EXISTS new_store_likes_select_own ON public.new_store_likes';
    EXECUTE 'CREATE POLICY new_store_likes_select_own ON public.new_store_likes FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ─── local_food_likes ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'local_food_likes') THEN
    EXECUTE 'DROP POLICY IF EXISTS local_food_likes_select_all ON public.local_food_likes';
    EXECUTE 'DROP POLICY IF EXISTS local_food_likes_select_own ON public.local_food_likes';
    EXECUTE 'CREATE POLICY local_food_likes_select_own ON public.local_food_likes FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ─── 기타 like/favorite/wishlist 테이블 ──────────────────────────────────────
DO $$
DECLARE
  tname TEXT;
BEGIN
  FOREACH tname IN ARRAY ARRAY[
    'interior_favorites','moving_favorites','cleaning_favorites','repair_favorites',
    'group_buying_wishlist','board_post_likes','favorites'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tname) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON public.%I', tname, tname);
      EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON public.%I', tname, tname);
      EXECUTE format(
        'CREATE POLICY %I_select_own ON public.%I FOR SELECT USING (auth.uid() = user_id)',
        tname, tname
      );
    END IF;
  END LOOP;
END $$;

-- ─── moderation_keywords — 금칙어는 비공개 ───────────────────────────────────
DROP POLICY IF EXISTS "moderation_keywords_select_all" ON public.moderation_keywords;
DROP POLICY IF EXISTS moderation_keywords_select_admin ON public.moderation_keywords;
CREATE POLICY moderation_keywords_select_admin ON public.moderation_keywords
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );
-- service_role 은 RLS 우회하므로 서버 라우트는 그대로 동작.

-- ─── SECURITY DEFINER 함수 search_path 잠금 ─────────────────────────────────
-- search_path 가 호출자 컨텍스트로 평가되면 공격자가 자기 스키마에 같은 이름 객체를
-- 만들어 권한 escalation 가능. SET search_path = public 으로 박아 차단.
DO $$
DECLARE
  fn TEXT;
  arg_types TEXT;
BEGIN
  FOR fn, arg_types IN
    SELECT
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'add_club_owner_as_member',
        'add_gb_owner_as_participant',
        'set_account_type_requests_updated_at',
        'apply_approved_account_type',
        'count_user_posts_today'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      fn, arg_types
    );
  END LOOP;
END $$;

-- ─── media bucket: SVG MIME 제거 (XSS 벡터) ───────────────────────────────
-- 기존 allowed_mime_types 에 image/svg+xml 포함 → 임의 JS 실행 가능 → stored XSS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'media') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm','video/x-m4v'
    ]
    WHERE id = 'media';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
