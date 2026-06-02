-- 매물에 인스타그램 포스트 URL 저장용 컬럼 추가
-- 비로그인 방문자도 볼 수 있는 공식 Instagram 임베드에 사용됨

alter table public.properties
  add column if not exists instagram_post_url text;

comment on column public.properties.instagram_post_url is
  '매물 홍보용 Instagram 포스트/릴스 URL (예: https://www.instagram.com/p/Abc123/)';
