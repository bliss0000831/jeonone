-- ============================================================================
-- 전원일기 — 게시판 6개 카테고리 시드 (모든 광장)
--   자유게시판/일상공유/무료나눔/생활정보/정부지원금/질문답변
--   board_categories (plaza_id, slug) UNIQUE — 충돌 시 무시
-- ============================================================================

INSERT INTO public.board_categories (name, slug, icon, sort_order, plaza_id)
SELECT c.name, c.slug, c.icon, c.sort_order, p.id
FROM public.plazas p
CROSS JOIN (VALUES
  ('자유게시판', 'free',    'message-square', 1),
  ('일상 공유',  'daily',   'camera',         2),
  ('무료 나눔',  'share',   'gift',           3),
  ('생활 정보',  'life',    'lightbulb',      4),
  ('정부 지원금','subsidy', 'coins',          5),
  ('질문 답변',  'qna',     'help-circle',    6)
) AS c(name, slug, icon, sort_order)
ON CONFLICT (plaza_id, slug) DO NOTHING;
