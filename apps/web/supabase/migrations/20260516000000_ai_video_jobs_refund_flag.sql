-- AI 영상 생성 실패 시 크레딧 환불 여부 추적
-- · 실패 분기마다 환불 로직이 호출될 때 중복 환불을 방지하기 위한 플래그

ALTER TABLE public.ai_video_jobs
  ADD COLUMN IF NOT EXISTS credits_refunded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.ai_video_jobs.credits_refunded IS
  'true 면 이 job 에 대해 이미 크레딧 환불이 완료됨 (중복 환불 방지)';
