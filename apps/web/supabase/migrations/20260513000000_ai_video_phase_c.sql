-- Phase C: 실제 AI 영상 생성을 위한 추가 필드
--   · ai_video_jobs 에 파이프라인 각 단계별 산출물 URL 저장
--   · fal.ai 비동기 처리용 request_id 저장
--   · 여러 clip 을 합성하기 위한 clips JSONB

BEGIN;

ALTER TABLE public.ai_video_jobs
  ADD COLUMN IF NOT EXISTS script_text TEXT,
  ADD COLUMN IF NOT EXISTS tts_url TEXT,
  ADD COLUMN IF NOT EXISTS bgm_url TEXT,
  ADD COLUMN IF NOT EXISTS clips JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT
    CHECK (stage IS NULL OR stage IN (
      'preparing', 'generating_clips', 'compositing', 'done'
    ));

-- provider_request_id 로 웹훅 수신 시 job 찾기
CREATE INDEX IF NOT EXISTS ai_video_jobs_request_id_idx
  ON public.ai_video_jobs (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

COMMENT ON COLUMN public.ai_video_jobs.script_text IS 'OpenAI 생성 한국어 나레이션 스크립트';
COMMENT ON COLUMN public.ai_video_jobs.tts_url    IS 'ElevenLabs TTS 음성 파일 URL (Supabase Storage)';
COMMENT ON COLUMN public.ai_video_jobs.bgm_url    IS 'Pixabay BGM URL';
COMMENT ON COLUMN public.ai_video_jobs.clips      IS 'fal.ai 가 생성한 개별 영상 클립 URL 배열';
COMMENT ON COLUMN public.ai_video_jobs.provider_request_id IS 'fal.ai queue request_id (웹훅 매칭용)';
COMMENT ON COLUMN public.ai_video_jobs.stage      IS '파이프라인 단계 (UI 표시용)';

-- ─── Storage 버킷: AI 영상 생성용 중간 산출물 (TTS, 썸네일 등) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-video-assets',
  'ai-video-assets',
  true, -- public read (TTS/BGM/영상 URL 은 fal.ai / 클라이언트가 직접 접근)
  52428800, -- 50MB
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'video/mp4',
    'image/jpeg', 'image/png',
    'font/otf', 'font/ttf', 'application/octet-stream',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: 누구나 읽을 수 있게 (service_role 만 write)
DROP POLICY IF EXISTS "ai-video-assets public read" ON storage.objects;
CREATE POLICY "ai-video-assets public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ai-video-assets');

COMMIT;
