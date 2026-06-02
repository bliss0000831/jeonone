-- 매물에 AI 생성 홍보영상 URL 저장용 컬럼 추가
-- AI 영상 생성 모달에서 "매물 상세페이지에 추가" 를 누르면 저장됨.
-- 상세 페이지에서 자체 <video> 플레이어로 재생.

alter table public.properties
  add column if not exists ai_video_url text;

comment on column public.properties.ai_video_url is
  'AI 로 생성된 홍보영상 MP4 URL (fal.ai + Supabase Storage)';
