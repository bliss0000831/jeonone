-- =====================================================================
-- storage.objects: {public} role 의 무제한 정책 제거
-- =====================================================================
-- 발견된 문제:
--   media_insert_all / media_update_all / media_delete_all / media_select_all
--   ai-video-assets public read
--   → 모두 roles={public} 이어서 anon key 만 가지면 누구나 media /
--     ai-video-assets 버킷의 파일을 읽고/쓰고/덮어쓰고/삭제 가능.
--
-- 안전성:
--   - 코드베이스에 클라이언트(브라우저)에서 supabase.storage.from() 으로
--     직접 호출하는 부분 없음 — 모두 서버 라우트(service_role)에서 처리.
--   - service_role 은 RLS 를 BYPASS 하므로 정책 삭제해도 서버 업로드/
--     삭제는 그대로 동작.
--   - public 버킷 플래그는 RLS 와 별개라 직접 URL 다운로드는 영향 없음.
--
-- 결과:
--   - 외부에서 anon key 로 list/insert/update/delete 시도 → 차단
--   - 직접 URL 로 GET → 그대로 동작 (CDN 캐시 영향 없음)
-- =====================================================================

DROP POLICY IF EXISTS "ai-video-assets public read" ON storage.objects;
DROP POLICY IF EXISTS media_select_all              ON storage.objects;
DROP POLICY IF EXISTS media_insert_all              ON storage.objects;
DROP POLICY IF EXISTS media_update_all              ON storage.objects;
DROP POLICY IF EXISTS media_delete_all              ON storage.objects;

NOTIFY pgrst, 'reload schema';
