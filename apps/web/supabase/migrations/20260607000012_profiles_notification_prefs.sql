-- 사용자 알림 환경설정 컬럼 — 설정 페이지의 토글들이 실제로 저장되도록
--
-- 채팅 알림 / 관심 매물 알림 / 마케팅 알림
--
-- 기본값: 채팅·관심매물 ON, 마케팅 OFF (마케팅은 명시적 동의 원칙)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_chat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_property boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_marketing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.notif_chat IS '채팅 메시지 알림 수신 여부';
COMMENT ON COLUMN public.profiles.notif_property IS '관심 매물 알림 수신 여부';
COMMENT ON COLUMN public.profiles.notif_marketing IS '마케팅/프로모션 알림 수신 여부';
