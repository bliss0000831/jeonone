-- 프로필의 게시물 공개 여부 설정
-- 기본값 true (공개). false 로 설정 시 타인의 프로필에서 "게시물" 탭이 비공개 표시됨.

alter table public.profiles
  add column if not exists posts_public boolean not null default true;

comment on column public.profiles.posts_public is
  '프로필 "게시물" 탭의 공개 여부. false 면 본인 외에는 게시물 목록이 보이지 않는다.';
