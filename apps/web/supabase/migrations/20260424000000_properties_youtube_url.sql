-- 매물에 유튜브 영상 URL 저장용 컬럼 추가
-- 상세 페이지에서 버튼 토글로 임베드해 보여줌

alter table public.properties
  add column if not exists youtube_post_url text;

comment on column public.properties.youtube_post_url is
  '매물 홍보용 YouTube 영상/쇼츠 URL (예: https://www.youtube.com/watch?v=xxx)';
