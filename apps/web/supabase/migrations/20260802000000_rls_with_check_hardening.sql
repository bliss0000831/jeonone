-- ============================================================
-- RLS WITH CHECK 강화 마이그레이션
-- 보안 감사에서 발견된 중간 위험 4건 + 부가 정비 수정
--
-- ── 변경 요약 ──
--   1) visitor_logs     — INSERT 정책 제거 (anon/authenticated 모두 차단)
--                         → 서버 API Route 가 service_role 로 INSERT 하도록 변경
--                         → 비로그인 방문자 기록도 그대로 유지됨
--   2) popular_searches — INSERT WITH CHECK(true) → 인증 사용자만 허용
--                         (현재 0건, 미사용. 향후 구현 시 로그인 사용자용)
--   3) support_inquiries — INSERT WITH CHECK(true) → auth.uid() = user_id
--                         (현재 0건, 미사용. 향후 구현 시 본인만 생성)
--   4) bump_settings / bump_ticket_packs — admin ALL 에 WITH CHECK 추가
--   5) support_inquiries si_admin_update — WITH CHECK 추가
--   6) visitor_logs 중복 SELECT 정책 정리
--
-- ── 판단 근거 ──
--   visitor_logs (2,815건, 오늘까지 작동 중):
--     - INSERT 주체: /api/visitor-track (서버 API Route)
--     - 웹: components/visitor-tracker.tsx → sendBeacon → /api/visitor-track
--     - 앱: apps/mobile/lib/visitor-tracker.ts → fetch → /api/visitor-track
--     - API Route 내부에서 createClient() (유저 컨텍스트) 로 INSERT 중
--     - 비로그인 방문 시 user_id=null, anon 세션 → 현재 WITH CHECK(true) 로 통과
--     - ★ auth.uid() IS NOT NULL 로 바꾸면 비로그인 기록 전부 차단됨!
--     - 해결: API Route 를 createAdminClient() (service_role) 로 변경 후
--       클라이언트 INSERT 정책 자체를 제거. service_role 은 RLS 우회.
--
--   popular_searches (0건, 미사용):
--     - 코드 어디에서도 이 테이블에 INSERT 하지 않음
--     - 검색 집계는 search_queries 테이블 + log_search_query RPC (SECURITY DEFINER)
--     - 향후 구현 시 인증 사용자 대상으로 설계될 것으로 예상
--
--   support_inquiries (0건, 미사용):
--     - 고객센터 페이지는 이메일 안내만. DB INSERT 코드 없음
--     - 향후 구현 시 본인만 자기 문의 생성 가능하도록
--
--   bump_settings / bump_ticket_packs:
--     - admin ALL 정책에 USING 은 있으나 WITH CHECK 누락
--     - PostgreSQL 은 WITH CHECK 없으면 USING 을 대체 사용하지만 명시가 권장
--
--   si_admin_update:
--     - 동일하게 WITH CHECK 누락 → 명시 추가
--
-- ── DROP→CREATE 사이 정책 공백 검토 ──
--   PostgreSQL 의 DROP POLICY + CREATE POLICY 는 같은 트랜잭션 안에서
--   실행되므로 (마이그레이션은 단일 트랜잭션), 중간에 정책이 비는 순간은
--   외부에서 관측 불가. 안전합니다.
-- ============================================================

BEGIN;

-- ── 1) visitor_logs: 클라이언트 INSERT 정책 완전 제거 ─────────
-- service_role (API Route 의 createAdminClient) 은 RLS 를 우회하므로
-- INSERT 정책이 없어도 서버에서 정상 기록됨.
-- anon/authenticated 의 직접 INSERT 는 차단됨 → 보안 강화.
DROP POLICY IF EXISTS visitor_logs_insert ON public.visitor_logs;
-- (새 정책 생성하지 않음 — INSERT 는 service_role 전용)

-- ── 2) popular_searches: 인증 사용자만 INSERT 허용 ────────────
DROP POLICY IF EXISTS ps_insert ON public.popular_searches;
CREATE POLICY ps_insert ON public.popular_searches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 3) support_inquiries: 본인만 문의 생성 ───────────────────
DROP POLICY IF EXISTS si_insert ON public.support_inquiries;
CREATE POLICY si_insert ON public.support_inquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 4) bump_settings: admin ALL 에 WITH CHECK 명시 추가 ──────
DROP POLICY IF EXISTS "bump_settings admin write" ON public.bump_settings;
CREATE POLICY "bump_settings admin write" ON public.bump_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 5) bump_ticket_packs: admin ALL 에 WITH CHECK 명시 추가 ──
DROP POLICY IF EXISTS "bump_ticket_packs admin write" ON public.bump_ticket_packs;
CREATE POLICY "bump_ticket_packs admin write" ON public.bump_ticket_packs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 6) support_inquiries admin update: WITH CHECK 명시 추가 ──
DROP POLICY IF EXISTS si_admin_update ON public.support_inquiries;
CREATE POLICY si_admin_update ON public.support_inquiries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 7) visitor_logs: 중복 SELECT 정책 정리 ──────────────────
-- visitor_logs_admin_read (roles: public) 와
-- visitor_logs_admin_select (roles: authenticated) 가 동일 기능으로 중복.
-- public 대상 정책은 불필요 (anon 이 admin 체크를 통과할 수 없음).
DROP POLICY IF EXISTS visitor_logs_admin_read ON public.visitor_logs;

COMMIT;
