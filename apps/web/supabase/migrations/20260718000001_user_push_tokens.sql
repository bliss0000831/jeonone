-- ============================================================
-- user_push_tokens — 사용자별 디바이스 푸시 토큰 저장.
--
-- expo-notifications 에서 발급한 ExponentPushToken[...] 또는
-- 향후 FCM/APNs raw token 을 저장.
--
-- 사용 시나리오:
--   1) RN 앱 로그인 시 토큰 등록 (registerPushToken)
--   2) 로그아웃·앱 삭제 시 unregister
--   3) 알림 발송 서버에서 user_id 로 토큰 lookup 후 expo push api 호출
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  -- expo / fcm / apns 등 발급처
  provider text NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo', 'fcm', 'apns')),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 디바이스에서 토큰 재발급 시 upsert
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx
  ON public.user_push_tokens (user_id);

-- RLS: 본인 토큰만
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select_own ON public.user_push_tokens;
CREATE POLICY push_tokens_select_own ON public.user_push_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_insert_own ON public.user_push_tokens;
CREATE POLICY push_tokens_insert_own ON public.user_push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_update_own ON public.user_push_tokens;
CREATE POLICY push_tokens_update_own ON public.user_push_tokens
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_delete_own ON public.user_push_tokens;
CREATE POLICY push_tokens_delete_own ON public.user_push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.touch_user_push_tokens_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_push_tokens_touch ON public.user_push_tokens;
CREATE TRIGGER user_push_tokens_touch
  BEFORE UPDATE ON public.user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_push_tokens_updated_at();

COMMENT ON TABLE public.user_push_tokens IS '디바이스 푸시 토큰 (expo/fcm/apns)';
