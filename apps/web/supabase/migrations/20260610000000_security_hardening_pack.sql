-- ============================================================================
-- 보안 강화 패치 묶음
--
-- C2: is_admin_for_plaza() 의 plaza-super → 광장 한정 super 만 통과 (글로벌 super 격상 방지)
-- C3: board_posts.region 사용자 input 검증 — 작성자 sub_region 강제 또는 NULL
-- M9: 자기 자신 favorite 차단 (선택 — application 레이어가 이미 user_id 체크하므로 보조)
-- ============================================================================

-- ─── C2: is_admin_for_plaza 수정 ─────────────────────────────────────────────
-- 글로벌 슈퍼는 profiles.role='superadmin' 으로만. plaza_admins.role='super' 는 그 광장에 한정.
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

  -- 글로벌 슈퍼 — profiles.role='superadmin' 만 (plaza 무관)
  SELECT role INTO v_role FROM profiles WHERE id = uid LIMIT 1;
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  -- legacy admin (광장 무관) — 해당 광장 글에만 통과
  IF v_role = 'admin' AND p_plaza_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  -- plaza_admins — role 무관(super/admin), 해당 광장에 한해서만 통과
  -- (이전: role='super' 면 광장 무관 통과 → 권한 격상 위험)
  IF p_plaza_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM plaza_admins
    WHERE user_id = uid AND plaza_id = p_plaza_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─── C3: board_posts.region 사용자 input 강제 ────────────────────────────────
-- INSERT 시 region 이 작성자의 profiles.sub_region 과 일치하지 않으면 거부.
-- (NULL = "지역 무관 광장 공지" — 관리자는 그렇게 작성 가능)
CREATE OR REPLACE FUNCTION public.board_posts_enforce_region()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_region TEXT;
  v_role TEXT;
BEGIN
  -- region 이 NULL 이면 통과 (지역 무관 글)
  IF NEW.region IS NULL THEN
    RETURN NEW;
  END IF;

  -- 작성자 정보 조회
  SELECT sub_region, role INTO v_sub_region, v_role
    FROM profiles WHERE id = NEW.user_id;

  -- admin/superadmin 은 임의 region 지정 가능 (광장 공지/이벤트 등)
  IF v_role IN ('admin', 'superadmin') THEN
    RETURN NEW;
  END IF;

  -- 일반 사용자는 자기 sub_region 만 허용
  IF v_sub_region IS NULL OR v_sub_region <> NEW.region THEN
    RAISE EXCEPTION 'region 은 본인 지역(%)으로만 설정 가능 (시도값: %)', v_sub_region, NEW.region
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_posts_enforce_region_trg ON public.board_posts;
CREATE TRIGGER board_posts_enforce_region_trg
  BEFORE INSERT OR UPDATE OF region ON public.board_posts
  FOR EACH ROW EXECUTE FUNCTION public.board_posts_enforce_region();

-- ─── M9: favorites self-favorite 방지 (property) ─────────────────────────────
-- application layer 에서도 추가 검사하지만 DB 레벨로도 강제.
CREATE OR REPLACE FUNCTION public.favorites_no_self()
RETURNS TRIGGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM properties WHERE id = NEW.property_id;
  IF v_owner = NEW.user_id THEN
    RAISE EXCEPTION '본인 매물에는 찜할 수 없습니다' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS favorites_no_self_trg ON public.favorites;
CREATE TRIGGER favorites_no_self_trg
  BEFORE INSERT ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.favorites_no_self();

-- ─── P5: board_posts 복합 인덱스 (성능) ──────────────────────────────────────
-- 자주 쓰이는 쿼리 패턴: plaza + category + region + status + 정렬
CREATE INDEX IF NOT EXISTS board_posts_plaza_cat_region_created_idx
  ON public.board_posts (plaza_id, category_id, region, is_pinned DESC, created_at DESC)
  WHERE status = 'active' OR status IS NULL;

-- ─── H5: admin override audit log ───────────────────────────────────────────
-- 관리자가 다른 사용자 글 수정/삭제 시 흔적 남김
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,                -- 'update' | 'delete' | 'hide' 등
  target_table TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  target_user_id UUID,
  plaza_id    TEXT,
  before_data JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_actions_admin_idx ON public.admin_actions(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON public.admin_actions(target_table, target_id);
CREATE INDEX IF NOT EXISTS admin_actions_plaza_idx ON public.admin_actions(plaza_id, created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_actions_select ON public.admin_actions;
CREATE POLICY admin_actions_select ON public.admin_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );
-- INSERT 는 service_role 만 (server route 에서 명시 호출)

NOTIFY pgrst, 'reload schema';
