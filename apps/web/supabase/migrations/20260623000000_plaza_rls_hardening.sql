-- ============================================================================
-- Plaza RLS hardening — cross-plaza leak 차단
--
-- 배경: 일부 board_* 정책이 plaza_id 검증 없이 user_id 또는 auth.uid() != null
-- 만 확인 → 강릉 광장 유저가 chuncheon 광장 글에 직접 INSERT/UPDATE/DELETE 가능.
--
-- 본 마이그레이션은 board_posts, board_comments, board_post_likes 3개 테이블의
-- RLS 정책을 사용자가 해당 광장 plaza_profiles 에 등록된 경우에만 쓰기 허용하도록
-- 강화한다. SELECT 는 광장 격리를 클라이언트/서버 layer 가 처리하므로 그대로 둠
-- (anon read 도 web 게시판 미리보기를 위해 필요).
--
-- 도입 함수:
--   user_in_plaza(plaza_id text) — SECURITY DEFINER, 현재 auth.uid() 가
--   plaza_profiles 에 active 로 등록되어 있는지 검사. SUPERADMIN/admin 우회.
-- ============================================================================

-- 헬퍼 함수: 현재 유저가 해당 광장 멤버인지 (superadmin 은 항상 true)
CREATE OR REPLACE FUNCTION user_in_plaza(p_plaza_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL OR p_plaza_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- superadmin 우회
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;
  -- plaza_profiles 등록 확인
  RETURN EXISTS (
    SELECT 1 FROM plaza_profiles
    WHERE user_id = v_uid AND plaza_id = p_plaza_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION user_in_plaza(TEXT) TO authenticated, anon;

-- ─── board_posts INSERT/UPDATE/DELETE 강화 ────────────────────────────────
DROP POLICY IF EXISTS "Board posts insert by authenticated" ON board_posts;
DROP POLICY IF EXISTS "board_posts_insert_v2" ON board_posts;
DROP POLICY IF EXISTS "Board posts update by owner" ON board_posts;
DROP POLICY IF EXISTS "board_posts_update_v2" ON board_posts;
DROP POLICY IF EXISTS "Board posts delete by owner" ON board_posts;
DROP POLICY IF EXISTS "board_posts_delete_v2" ON board_posts;

CREATE POLICY "board_posts_insert_plaza_scoped"
  ON board_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND user_in_plaza(plaza_id)
  );

CREATE POLICY "board_posts_update_owner_or_admin"
  ON board_posts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM plaza_admins
      WHERE user_id = auth.uid() AND plaza_id = board_posts.plaza_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM plaza_admins
      WHERE user_id = auth.uid() AND plaza_id = board_posts.plaza_id
    )
  );

CREATE POLICY "board_posts_delete_owner_or_admin"
  ON board_posts FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM plaza_admins
      WHERE user_id = auth.uid() AND plaza_id = board_posts.plaza_id
    )
  );

-- ─── board_comments INSERT/UPDATE/DELETE 강화 ─────────────────────────────
DROP POLICY IF EXISTS "Board comments insert by authenticated" ON board_comments;
DROP POLICY IF EXISTS "board_comments_insert_v2" ON board_comments;
DROP POLICY IF EXISTS "Board comments update by owner" ON board_comments;
DROP POLICY IF EXISTS "board_comments_update_v2" ON board_comments;
DROP POLICY IF EXISTS "Board comments delete by owner" ON board_comments;
DROP POLICY IF EXISTS "board_comments_delete_v2" ON board_comments;

CREATE POLICY "board_comments_insert_plaza_scoped"
  ON board_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      plaza_id IS NULL  -- 레거시 row 허용 (마이그레이션 도중)
      OR user_in_plaza(plaza_id)
    )
  );

CREATE POLICY "board_comments_update_owner"
  ON board_comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "board_comments_delete_owner_or_admin"
  ON board_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM plaza_admins pa
      JOIN board_comments bc ON bc.id = board_comments.id
      WHERE pa.user_id = auth.uid() AND pa.plaza_id = bc.plaza_id
    )
  );

-- ─── board_post_likes 강화 (user_id 검증 + post plaza 매칭 안전망) ────────
DROP POLICY IF EXISTS "Board likes insert by authenticated" ON board_post_likes;
DROP POLICY IF EXISTS "board_post_likes_insert_v2" ON board_post_likes;
DROP POLICY IF EXISTS "Board likes delete by owner" ON board_post_likes;
DROP POLICY IF EXISTS "board_post_likes_delete_v2" ON board_post_likes;

CREATE POLICY "board_post_likes_insert_owner"
  ON board_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "board_post_likes_delete_owner"
  ON board_post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON FUNCTION user_in_plaza(TEXT) IS
  'auth.uid() 가 해당 plaza_profiles 에 등록되어 있는지 확인 (superadmin 우회). board_* RLS 에서 사용.';
