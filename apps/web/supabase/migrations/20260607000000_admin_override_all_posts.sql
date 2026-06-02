-- ============================================================================
-- 모든 게시글 테이블에 관리자 UPDATE/DELETE 우회 정책 추가
--
-- 슈퍼관리자 + 광장 관리자(plaza_admins) 가 모든 사용자의 글을 수정·삭제할 수 있도록.
-- 각 테이블의 기존 user-only 정책은 유지 (소유자도 자기 글 수정 가능).
-- 새로 추가하는 정책은 admin/superadmin/plaza_admin 권한일 때 통과.
--
-- 대상 테이블:
--   properties, board_posts, board_comments,
--   secondhand_posts, jobs_posts, sharing_posts, clubs,
--   new_store_posts, group_buying_posts, local_food,
--   interior_posts, moving_posts, cleaning_posts, repair_posts,
--   property_requests, property_request_responses
-- ============================================================================

-- 헬퍼 함수: 현재 사용자가 admin/superadmin 인지 또는 해당 plaza 의 plaza_admins 인지
CREATE OR REPLACE FUNCTION public.is_admin_for_plaza(p_plaza_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- legacy admin/superadmin
  SELECT role INTO v_role FROM profiles WHERE id = uid LIMIT 1;
  IF v_role IN ('admin', 'superadmin') THEN
    RETURN TRUE;
  END IF;

  -- plaza_admins — super 는 모든 광장, 일반 plaza_admin 은 자기 광장만
  IF EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = uid
      AND (role = 'super' OR (p_plaza_id IS NOT NULL AND plaza_id = p_plaza_id))
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─── 정책 추가 헬퍼 (테이블 별 반복 작성 회피) ─────────────────────────────
-- 각 테이블에 admin update/delete 정책 추가. 테이블에 plaza_id 컬럼이 있으면 그것 기준,
-- 없으면 NULL 로 호출 (이 경우 슈퍼만 통과).

DO $$
DECLARE
  tbl TEXT;
  has_plaza BOOLEAN;
  using_clause TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'properties',
    'board_posts',
    'board_comments',
    'secondhand_posts',
    'jobs_posts',
    'sharing_posts',
    'clubs',
    'new_store_posts',
    'group_buying_posts',
    'local_food',
    'interior_posts',
    'moving_posts',
    'cleaning_posts',
    'repair_posts',
    'property_requests',
    'property_request_responses'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping non-existent table: %', tbl;
      CONTINUE;
    END IF;

    -- plaza_id 컬럼 존재 여부 확인
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'plaza_id'
    ) INTO has_plaza;

    IF has_plaza THEN
      using_clause := 'public.is_admin_for_plaza(plaza_id::text)';
    ELSE
      using_clause := 'public.is_admin_for_plaza(NULL)';
    END IF;

    -- UPDATE 정책
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_update ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
      tbl, tbl, using_clause, using_clause
    );

    -- DELETE 정책
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_delete ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_delete ON public.%I FOR DELETE USING (%s)',
      tbl, tbl, using_clause
    );

    -- SELECT 정책 — admin 은 hidden 글까지 다 봐야 함
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_select ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_select ON public.%I FOR SELECT USING (%s)',
      tbl, tbl, using_clause
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
