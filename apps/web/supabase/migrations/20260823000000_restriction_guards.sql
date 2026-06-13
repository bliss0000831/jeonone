-- ════════════════════════════════════════════════════════════════════════════
-- 제한 가드 3종 — 클라이언트 직접 UPDATE 위변조 차단 (방어적·추가형, 정당 흐름 무영향)
--
--  공통 원칙: auth.uid() IS NULL(서비스롤: cron·관리자 admin client·모바일 bearer→admin)
--            은 모두 통과. 일반 사용자(authenticated)의 직접 위변조만 차단.
--
--  #B 게시글/댓글 숨김(hidden) 직접 해제 차단
--     신고 누적 자동숨김은 admin(service_role)으로 status='hidden' 설정 → 통과.
--     글 작성자가 본인 client 로 hidden→active 직접 UPDATE 해 모더레이션을 무력화하던
--     라이브 구멍 차단. (hidden→deleted 자기삭제는 허용)
--
--  #A 로컬푸드 주문 — 구매자의 발송(shipped) 위조 차단
--     RLS 가 buyer/seller 의 status·shipped_at 직접변경을 허용 → 구매자가
--     status='shipped', shipped_at=과거 로 위조 → 자동확정 cron 으로 무발송 구매확정
--     가능하던 구멍 차단. (발송은 판매자/서버만)
--
--  #C 공동구매 주문 금액·정체성 컬럼 동결 (선제)
--     현재 UI 미연결이나 RLS UPDATE 에 WITH CHECK·컬럼제한이 없어 결제 연동 시
--     amount=0·당사자 위조가 가능 → 금액/식별 컬럼을 생성 후 불변으로 동결.
--
--  멱등(CREATE OR REPLACE / DROP TRIGGER IF EXISTS). 적용: 대시보드 SQL Editor 1회 Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── #B 숨김 상태 가드 ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_hidden_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- 서비스롤(자동숨김·관리자)은 통과
  END IF;
  -- 사용자가 직접 숨김 설정 금지
  IF NEW.status = 'hidden' AND OLD.status IS DISTINCT FROM 'hidden' THEN
    RAISE EXCEPTION '숨김 처리는 운영자만 할 수 있습니다';
  END IF;
  -- 숨김 글을 직접 해제 금지 (단, 자기삭제 hidden→deleted 는 허용)
  IF OLD.status = 'hidden' AND NEW.status NOT IN ('hidden', 'deleted') THEN
    RAISE EXCEPTION '숨김 처리된 글은 직접 해제할 수 없습니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_secondhand_hidden_guard ON public.secondhand_posts;
CREATE TRIGGER trg_secondhand_hidden_guard BEFORE UPDATE ON public.secondhand_posts
  FOR EACH ROW EXECUTE FUNCTION public.post_hidden_status_guard();

DROP TRIGGER IF EXISTS trg_jobs_hidden_guard ON public.jobs_posts;
CREATE TRIGGER trg_jobs_hidden_guard BEFORE UPDATE ON public.jobs_posts
  FOR EACH ROW EXECUTE FUNCTION public.post_hidden_status_guard();

DROP TRIGGER IF EXISTS trg_board_hidden_guard ON public.board_posts;
CREATE TRIGGER trg_board_hidden_guard BEFORE UPDATE ON public.board_posts
  FOR EACH ROW EXECUTE FUNCTION public.post_hidden_status_guard();

DROP TRIGGER IF EXISTS trg_board_comment_hidden_guard ON public.board_comments;
CREATE TRIGGER trg_board_comment_hidden_guard BEFORE UPDATE ON public.board_comments
  FOR EACH ROW EXECUTE FUNCTION public.post_hidden_status_guard();

-- ── #A 로컬푸드 주문 발송 위조 차단 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.local_food_order_ship_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;  -- 서비스롤/서버(ship API·cron)는 통과
  END IF;
  -- 구매자는 발송(shipped) 상태·발송시각을 만들 수 없음 (발송은 판매자만)
  IF v_uid = NEW.buyer_id THEN
    IF (NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped')
       OR (NEW.shipped_at IS DISTINCT FROM OLD.shipped_at) THEN
      RAISE EXCEPTION '발송 처리는 판매자만 할 수 있습니다';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_local_food_order_ship_guard ON public.local_food_orders;
CREATE TRIGGER trg_local_food_order_ship_guard BEFORE UPDATE ON public.local_food_orders
  FOR EACH ROW EXECUTE FUNCTION public.local_food_order_ship_guard();

-- ── #C 공동구매 주문 금액·정체성 동결 ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gb_order_freeze_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- 서비스롤(결제 webhook·cron·정산)은 통과
  END IF;
  IF NEW.post_id     <> OLD.post_id
     OR NEW.buyer_id  <> OLD.buyer_id
     OR NEW.seller_id <> OLD.seller_id
     OR NEW.plaza_id  <> OLD.plaza_id
     OR NEW.unit_price <> OLD.unit_price
     OR NEW.quantity   <> OLD.quantity
     OR NEW.amount     <> OLD.amount
     OR NEW.fee_amount <> OLD.fee_amount
     OR NEW.points_used <> OLD.points_used THEN
    RAISE EXCEPTION '주문의 금액·당사자 정보는 변경할 수 없습니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gb_order_freeze_guard ON public.group_buying_orders;
CREATE TRIGGER trg_gb_order_freeze_guard BEFORE UPDATE ON public.group_buying_orders
  FOR EACH ROW EXECUTE FUNCTION public.gb_order_freeze_guard();

-- UPDATE 정책에 WITH CHECK 추가 — 행 소유(당사자) 유지 강제
DROP POLICY IF EXISTS gb_orders_update_party ON public.group_buying_orders;
CREATE POLICY gb_orders_update_party ON public.group_buying_orders
  FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

NOTIFY pgrst, 'reload schema';
