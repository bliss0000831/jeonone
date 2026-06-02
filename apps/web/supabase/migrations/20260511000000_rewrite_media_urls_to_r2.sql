-- Supabase Storage → Cloudflare R2 URL 일괄 치환
--
-- 전제:
--   · scripts/migrate-supabase-to-r2.mjs 로 `media` 버킷의 파일을 R2 로 복사 완료
--   · key 는 원본 그대로 유지 (예: board/<uid>/123-abc.jpg → board/<uid>/123-abc.jpg)
--
-- 동작:
--   · URL prefix 만 바꿔치기
--     OLD: https://vrsulgfjujlqmwvprrom.supabase.co/storage/v1/object/public/media/
--     NEW: https://pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev/
--
-- 멱등: 이미 R2 URL 로 바뀐 row 는 매칭 안 되므로 다시 돌려도 안전

DO $$
DECLARE
  old_prefix TEXT := 'https://vrsulgfjujlqmwvprrom.supabase.co/storage/v1/object/public/media/';
  new_prefix TEXT := 'https://pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev/';
  n INT;
BEGIN

  -- ─── profiles ────────────────────────────────────────
  UPDATE profiles SET avatar_url = REPLACE(avatar_url, old_prefix, new_prefix)
    WHERE avatar_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'profiles.avatar_url  : %', n;

  UPDATE profiles SET cover_url = REPLACE(cover_url, old_prefix, new_prefix)
    WHERE cover_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'profiles.cover_url   : %', n;

  -- ─── profile_highlights ─────────────────────────────
  UPDATE profile_highlights SET cover_url = REPLACE(cover_url, old_prefix, new_prefix)
    WHERE cover_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'highlights.cover_url : %', n;

  UPDATE profile_highlights SET media_url = REPLACE(media_url, old_prefix, new_prefix)
    WHERE media_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'highlights.media_url : %', n;

  -- ─── board_posts (images TEXT[] + thumbnail_url) ─────
  UPDATE board_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'board_posts.images   : %', n;

  UPDATE board_posts SET thumbnail_url = REPLACE(thumbnail_url, old_prefix, new_prefix)
    WHERE thumbnail_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'board_posts.thumb    : %', n;

  -- ─── board_comments (images TEXT[]) ──────────────────
  UPDATE board_comments
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'board_comments.imgs  : %', n;

  -- ─── properties (images TEXT[]) ──────────────────────
  UPDATE properties
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'properties.images    : %', n;

  -- ─── 서비스 포스트들 (images TEXT[]) ────────────────
  UPDATE interior_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'interior_posts       : %', n;

  UPDATE repair_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'repair_posts         : %', n;

  UPDATE cleaning_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'cleaning_posts       : %', n;

  UPDATE moving_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'moving_posts         : %', n;

  UPDATE sharing_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'sharing_posts        : %', n;

  UPDATE new_store_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'new_store_posts      : %', n;

  UPDATE group_buying_posts
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'group_buying_posts   : %', n;

  UPDATE local_food
     SET images = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(images) u)
   WHERE EXISTS (SELECT 1 FROM unnest(images) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'local_food           : %', n;

  -- ─── account_type_requests (3개 text[] 컬럼) ─────────
  UPDATE account_type_requests
     SET business_cert_urls = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(business_cert_urls) u)
   WHERE EXISTS (SELECT 1 FROM unnest(business_cert_urls) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'acct_req.business    : %', n;

  UPDATE account_type_requests
     SET license_urls = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(license_urls) u)
   WHERE EXISTS (SELECT 1 FROM unnest(license_urls) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'acct_req.license     : %', n;

  UPDATE account_type_requests
     SET extra_docs_urls = ARRAY(SELECT REPLACE(u, old_prefix, new_prefix) FROM unnest(extra_docs_urls) u)
   WHERE EXISTS (SELECT 1 FROM unnest(extra_docs_urls) u WHERE u LIKE old_prefix || '%');
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'acct_req.extra       : %', n;

  -- ─── notifications.thumbnail_url (스냅샷) ────────────
  UPDATE notifications SET thumbnail_url = REPLACE(thumbnail_url, old_prefix, new_prefix)
    WHERE thumbnail_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'notifications.thumb  : %', n;

  -- ─── hero_banners / popups / homepage_slider ─────────
  UPDATE hero_banners SET image_url = REPLACE(image_url, old_prefix, new_prefix)
    WHERE image_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'hero_banners.image   : %', n;

  UPDATE hero_banners SET logo_image_url = REPLACE(logo_image_url, old_prefix, new_prefix)
    WHERE logo_image_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'hero_banners.logo    : %', n;

  UPDATE popups SET image_url = REPLACE(image_url, old_prefix, new_prefix)
    WHERE image_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'popups.image_url     : %', n;

  UPDATE homepage_slider SET image_url = REPLACE(image_url, old_prefix, new_prefix)
    WHERE image_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'homepage_slider      : %', n;

  -- ─── 채팅 메시지 (image_url) ─────────────────────────
  UPDATE club_chat_messages SET image_url = REPLACE(image_url, old_prefix, new_prefix)
    WHERE image_url LIKE old_prefix || '%';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'club_chat_messages   : %', n;

  -- group_buying_chat messages 의 정확한 테이블명이 다를 수 있어 조건부로 실행
  IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'group_buying_chat_messages') THEN
    EXECUTE format(
      'UPDATE group_buying_chat_messages SET image_url = REPLACE(image_url, %L, %L)
         WHERE image_url LIKE %L',
      old_prefix, new_prefix, old_prefix || '%'
    );
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'gb_chat_messages     : %', n;
  END IF;

  -- 일반 채팅(messages) 에도 image_url 이 있을 수 있음
  IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'image_url') THEN
    EXECUTE format(
      'UPDATE messages SET image_url = REPLACE(image_url, %L, %L)
         WHERE image_url LIKE %L',
      old_prefix, new_prefix, old_prefix || '%'
    );
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'messages.image_url   : %', n;
  END IF;

  RAISE NOTICE '✅ URL 치환 완료';
END $$;
