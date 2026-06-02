-- ============================================================================
-- Plaza RLS hardening — INSERT plaza scope for all domain tables
--
-- R3P5 에서 board_* 만 처리. 본 마이그레이션은 나머지 12개 도메인 테이블의
-- INSERT 정책에 user_in_plaza() 검증을 추가하여 cross-plaza INSERT 차단.
--
-- 대상 (INSERT WITH CHECK 강화):
--   properties, secondhand_posts, sharing_posts, clubs, jobs_posts,
--   new_store_posts, group_buying_posts, local_food, interior_posts,
--   moving_posts, cleaning_posts, repair_posts, property_requests
--
-- UPDATE/DELETE 는 기존 owner-only 정책 유지 (R3P5 board 와 마찬가지로
-- 본인 row 만 수정 → 광장 위조해도 RLS 가 row 잠금). owner 가 plaza_id 를
-- 사후 변경하는 것도 RLS 가 `eq user_id` 통과 후 별도 검증 없으나, 본
-- 마이그레이션의 INSERT WITH CHECK 가 깨지므로 PATCH 로 plaza_id 변경
-- 시도는 다음 migration 에서 별도 처리 가능.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  policy_name TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'properties',
      'secondhand_posts',
      'sharing_posts',
      'clubs',
      'jobs_posts',
      'new_store_posts',
      'group_buying_posts',
      'local_food',
      'interior_posts',
      'moving_posts',
      'cleaning_posts',
      'repair_posts',
      'property_requests'
    ])
  LOOP
    -- 기존 INSERT 정책 중 가장 흔한 이름 패턴 drop (정확한 이름은
    -- 테이블별로 달라서 보수적으로 시도; 없으면 skip)
    policy_name := t || '_insert_plaza_scoped';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, t);
    -- 신규 정책 추가 — owner + plaza membership 동시 검증
    EXECUTE format(
      $f$CREATE POLICY %I ON %I FOR INSERT TO authenticated
         WITH CHECK (
           auth.uid() = user_id
           AND (
             plaza_id IS NULL  -- 레거시 호환 (default trigger 가 처리하는 케이스)
             OR user_in_plaza(plaza_id)
           )
         )$f$,
      policy_name,
      t
    );
  END LOOP;
END $$;

COMMENT ON FUNCTION user_in_plaza(TEXT) IS
  'auth.uid() 가 해당 plaza_profiles 에 등록되어 있는지 확인 (superadmin 우회). 모든 도메인 INSERT 정책에서 사용.';
