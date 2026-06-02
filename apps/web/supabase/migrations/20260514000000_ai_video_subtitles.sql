-- Phase C.5 — ASS 자막 파이프라인
--   · subtitle_segments: [{ start, end, text, subText? }]
--   · subtitle_ass_url:  Supabase Storage 의 .ass 파일 URL
--   · compose_url:       자막 burn 전 합성본 (디버깅용)
--   · stage 확장: 'burning_subtitles'

BEGIN;

ALTER TABLE public.ai_video_jobs
  ADD COLUMN IF NOT EXISTS subtitle_segments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtitle_ass_url TEXT,
  ADD COLUMN IF NOT EXISTS compose_url TEXT;

-- stage CHECK 재정의 (burning_subtitles 추가)
ALTER TABLE public.ai_video_jobs
  DROP CONSTRAINT IF EXISTS ai_video_jobs_stage_check;

ALTER TABLE public.ai_video_jobs
  ADD CONSTRAINT ai_video_jobs_stage_check CHECK (
    stage IS NULL OR stage IN (
      'preparing',
      'generating_clips',
      'compositing',
      'burning_subtitles',
      'done'
    )
  );

COMMENT ON COLUMN public.ai_video_jobs.subtitle_segments IS 'OpenAI 생성 자막 구간 [{start, end, text, subText}]';
COMMENT ON COLUMN public.ai_video_jobs.subtitle_ass_url  IS 'Supabase Storage 의 .ass 파일 URL';
COMMENT ON COLUMN public.ai_video_jobs.compose_url       IS '자막 burn 전 합성본 (디버깅/폴백용)';

COMMIT;
