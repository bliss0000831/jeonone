-- ============================================================================
-- board_posts_enforce_region 트리거 — 자동수집 글(source) 예외 추가
--
-- 기존 트리거: 일반 사용자는 글 region 을 자기 profiles.sub_region 으로만 지정 가능
--   (admin/superadmin 만 임의 region). 보조금24 수집 봇은 일반 사용자라
--   '춘천시' 등 시군 지정이 거부됐음 → region 이 전부 NULL 로 남음.
--
-- 수정: NEW.source 가 NULL 이 아닌(= 외부 자동수집) 글은 시스템이 신뢰하는
--   cron(service_role)이 만든 것이므로 region 검증을 건너뛴다.
--   사람이 쓴 글(source IS NULL)은 기존 검증 그대로 — 보안 유지.
-- 멱등(CREATE OR REPLACE). 재실행 안전.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.board_posts_enforce_region()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_region TEXT;
  v_role TEXT;
BEGIN
  -- region 이 NULL 이면 통과 (지역 무관 글)
  IF NEW.region IS NULL THEN
    RETURN NEW;
  END IF;

  -- 자동 수집 글(보조금24 등 — source 표시)은 시스템(cron)이 시군을 지정. 통과.
  IF NEW.source IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 작성자 정보 조회
  SELECT sub_region, role INTO v_sub_region, v_role
    FROM profiles WHERE id = NEW.user_id;

  -- admin/superadmin 은 임의 region 지정 가능 (광장 공지/이벤트 등)
  IF v_role IN ('admin', 'superadmin') THEN
    RETURN NEW;
  END IF;

  -- 일반 사용자는 자기 sub_region 만 허용
  IF v_sub_region IS NULL OR v_sub_region <> NEW.region THEN
    RAISE EXCEPTION 'region 은 본인 지역(%)으로만 설정 가능 (시도값: %)', v_sub_region, NEW.region
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 트리거 재바인딩(이미 존재하면 그대로 함수만 교체됨 — 안전)
DROP TRIGGER IF EXISTS board_posts_enforce_region_trg ON public.board_posts;
CREATE TRIGGER board_posts_enforce_region_trg
  BEFORE INSERT OR UPDATE OF region ON public.board_posts
  FOR EACH ROW EXECUTE FUNCTION public.board_posts_enforce_region();
