-- ============================================================================
-- board_posts.region 추가 — 사용자 위치(sub_region) 기반 게시판 자동 필터링
--
-- 값: 'chuncheon' | 'hongcheon' | 'hwacheon' | 'yanggu' | 'inje' (또는 plazas.coverage 의 코드)
-- 기본값: NULL (= 지역 무관 / 광장 전체 공지 등)
-- 작성 시 사용자 profiles.sub_region 으로 자동 채움
-- ============================================================================

ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS region TEXT;

CREATE INDEX IF NOT EXISTS board_posts_region_idx ON public.board_posts(region);
CREATE INDEX IF NOT EXISTS board_posts_region_status_created_idx
  ON public.board_posts(region, status, created_at DESC);

-- 기존 글 백필 — 작성자 profiles.sub_region 기준
UPDATE public.board_posts AS bp
SET region = p.sub_region
FROM public.profiles AS p
WHERE bp.user_id = p.id
  AND bp.region IS NULL
  AND p.sub_region IS NOT NULL;

NOTIFY pgrst, 'reload schema';
