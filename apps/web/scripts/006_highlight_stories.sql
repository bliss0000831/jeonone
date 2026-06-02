-- ============================================================
-- 006_highlight_stories.sql
-- profile_highlights 를 인스타그램 스토리 스타일로 확장
--   · media_url  : 실제 스토리 미디어 (이미지 or 비디오)
--   · media_type : 'image' | 'video'
--   · duration_ms: 비디오 경우 재생시간(ms). 이미지는 기본 5000
--   · cover_url  : 기존 유지 (원형 썸네일 — 생략 시 media_url 사용)
-- ============================================================

alter table public.profile_highlights
  add column if not exists media_url   text,
  add column if not exists media_type  text check (media_type in ('image', 'video')) default 'image',
  add column if not exists duration_ms int default 5000;

-- 기존 row 보정: cover_url 만 있고 media_url 없는 경우 같은 값으로 채움
update public.profile_highlights
  set media_url = cover_url
  where media_url is null and cover_url is not null;

-- media_type 기본값 재보정
update public.profile_highlights
  set media_type = 'image'
  where media_type is null;
