-- =====================================================================
-- profile_stats 뷰를 SECURITY INVOKER 로 재정의
-- =====================================================================
-- Supabase Security Advisor 가 "Security Definer View" 에러를 보낸 이유:
--   public.profile_stats 뷰가 SECURITY DEFINER 로 동작하면 뷰 소유자
--   (postgres superuser) 권한으로 underlying 테이블을 읽어서, 호출자의
--   RLS 정책을 우회함.
--
-- 해결:
--   Postgres 15+ 의 security_invoker=true 옵션으로 재생성하면 호출자
--   권한 + RLS 정책이 그대로 적용됨.
--
--   profile_stats 는 follows / profiles 의 단순 카운트라 RLS 가 막는
--   민감 데이터는 없지만, advisor 경고를 없애려면 명시적으로 invoker
--   로 만들어야 함.
-- =====================================================================

DROP VIEW IF EXISTS public.profile_stats;

CREATE VIEW public.profile_stats
WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  COALESCE((SELECT count(*) FROM public.follows f WHERE f.following_id = p.id), 0) AS followers_count,
  COALESCE((SELECT count(*) FROM public.follows f WHERE f.follower_id  = p.id), 0) AS following_count
FROM public.profiles p;

GRANT SELECT ON public.profile_stats TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
