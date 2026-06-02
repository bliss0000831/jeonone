-- ============================================================================
-- admin 운영 인프라 — 감사 로그 + 사용자 차단·정지
--
-- 1) audit_log: admin 의 모든 변경 행위 (write) 기록. 광장별 격리.
--    조회는 광장 admin 본인 광장만, super 는 전체.
-- 2) user_bans: 사용자 차단·정지 상태. plaza 별 (강제 격리). active=true 인
--    행이 있으면 그 광장에서 로그인/글쓰기 차단 가능 (응용 단에서 검증).
-- ============================================================================

BEGIN;

-- ─── audit_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id    TEXT NOT NULL,
  action      TEXT NOT NULL,         -- 예: 'ban_user', 'delete_post', 'update_banner'
  target_type TEXT,                  -- 예: 'user', 'post', 'banner'
  target_id   TEXT,                  -- target row id (text 로 통일)
  metadata    JSONB,                 -- 자유 형식 (변경 전/후 값 등)
  ip          INET,                  -- 호출자 IP (가능 시)
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS audit_log_plaza_created_idx ON public.audit_log (plaza_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- super 는 전체, plaza admin 은 자기 광장만 SELECT
DROP POLICY IF EXISTS audit_log_admin_read ON public.audit_log;
CREATE POLICY audit_log_admin_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_plaza_admin(auth.uid(), plaza_id));

-- INSERT 는 admin 만 + plaza 일치 (감사 로그를 admin 행위 기록용으로 한정).
-- 운영 코드는 service_role 로 우회해 누락 없이 기록하므로 RLS 는 안전망.
DROP POLICY IF EXISTS audit_log_admin_write ON public.audit_log;
CREATE POLICY audit_log_admin_write ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_plaza_admin(auth.uid(), plaza_id)
    AND actor_id = auth.uid()
  );

-- UPDATE/DELETE 금지 — 감사 로그는 불변 (super 도 못 지움; 필요 시 DB 직접).

-- ─── user_bans ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_bans (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaza_id     TEXT NOT NULL,
  banned_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT,
  scope        TEXT NOT NULL DEFAULT 'suspend',  -- 'suspend' (한시) | 'ban' (영구)
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,                       -- NULL 이면 무기한
  lifted_at    TIMESTAMPTZ,                       -- NULL 이면 활성, 시각 있으면 해제됨
  lifted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_bans_user_plaza_active_idx
  ON public.user_bans (user_id, plaza_id)
  WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS user_bans_plaza_idx
  ON public.user_bans (plaza_id, created_at DESC);

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- 본인 ban 정보는 본인이 조회 가능 (왜 차단됐는지 안내) + admin 은 자기 광장
DROP POLICY IF EXISTS user_bans_select ON public.user_bans;
CREATE POLICY user_bans_select ON public.user_bans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_plaza_admin(auth.uid(), plaza_id)
  );

-- admin 만 ban 생성/해제, plaza 일치 강제
DROP POLICY IF EXISTS user_bans_admin_write ON public.user_bans;
CREATE POLICY user_bans_admin_write ON public.user_bans
  FOR ALL TO authenticated
  USING (public.is_plaza_admin(auth.uid(), plaza_id))
  WITH CHECK (public.is_plaza_admin(auth.uid(), plaza_id));

-- ─── helper: 사용자가 현재 광장에서 활성 ban 인지 체크 ──────────────────
CREATE OR REPLACE FUNCTION public.is_user_banned(p_uid UUID, p_plaza TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = p_uid
      AND plaza_id = p_plaza
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_user_banned(UUID, TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
