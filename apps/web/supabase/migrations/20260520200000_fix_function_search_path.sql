-- =====================================================================
-- 함수 search_path 고정 (Supabase Advisor: function_search_path_mutable)
-- =====================================================================
-- search_path 미설정 함수는 호출자의 search_path 를 따라가서, 동명의
-- 악성 함수/테이블이 다른 스키마에 있으면 hijack 될 수 있음.
-- 모든 함수에 SET search_path = public, pg_temp 적용.
-- =====================================================================

ALTER FUNCTION public.count_user_posts_today()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.get_email_by_username(text)                SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                           SET search_path = public, pg_temp;
ALTER FUNCTION public.update_trust_score(uuid)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.set_account_type_requests_updated_at()     SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_approved_account_type(uuid)          SET search_path = public, pg_temp;
ALTER FUNCTION public.suggest_search_terms(text, int)            SET search_path = public, pg_temp;
ALTER FUNCTION public.property_requests_touch_updated_at()       SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_ai_video_jobs_updated_at()           SET search_path = public, pg_temp;

NOTIFY pgrst, 'reload schema';
