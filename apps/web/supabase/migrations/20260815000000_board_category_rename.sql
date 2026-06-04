-- 전원일기 톤으로 게시판 카테고리명 변경 (전 plaza)
--   자유게시판 → 마을 사랑방 / 일상 공유 → 농업 일기 / 생활 정보 → 살림 정보 / 질문 답변 → 궁금해요
--   (무료 나눔, 정부 지원금은 명확하여 유지)
UPDATE public.board_categories SET name = '마을 사랑방' WHERE slug = 'free';
UPDATE public.board_categories SET name = '농업 일기'   WHERE slug = 'daily';
UPDATE public.board_categories SET name = '살림 정보'   WHERE slug = 'life';
UPDATE public.board_categories SET name = '궁금해요'     WHERE slug = 'qna';
