-- =====================================================================
-- 중복/레거시 RLS 정책 제거
-- =====================================================================
-- Supabase Advisor "RLS Policy Always True" 경고 정리.
--
-- 1) board_comments: "Anyone can view board comments" 는 ALL/qual=NULL 인
--    레거시 정책으로, 사실상 모든 작업을 누구에게나 허용. 이미
--    board_comments_select/insert/update/delete 4 개의 적절한 정책이
--    동작 중이므로 안전하게 제거 가능.
--
-- 2) visitor_logs: visitor_logs_insert 와 visitor_logs_insert_any 가
--    동일한 INSERT with_check=true 로 중복. 하나만 남김.
--
-- 남은 always-true 정책 (popular_searches.ps_insert, support_inquiries.si_insert,
-- visitor_logs.visitor_logs_insert) 는 비로그인 사용자도 입력해야 하는
-- 의도적 정책 → Advisor 에서 무시.
-- =====================================================================

DROP POLICY IF EXISTS "Anyone can view board comments" ON public.board_comments;
DROP POLICY IF EXISTS visitor_logs_insert_any ON public.visitor_logs;

NOTIFY pgrst, 'reload schema';
