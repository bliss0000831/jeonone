-- ============================================================================
-- 강릉광장 더미 데이터 시드 — 멀티-광장 멀티테넌시 검증용.
-- 운영 데이터가 아니므로 정식 오픈 전 정리 권장.
-- ============================================================================

BEGIN;

-- ─── 강릉 더미 매물 5건 ─────────────────────────────────────────────────────
-- profiles 가 비어있어도 동작하도록 user_id 는 NULL 허용 가정.
-- 만약 NOT NULL 이면 admin 계정 ID 를 동적으로 사용.
DO $$
DECLARE
  admin_uid UUID;
BEGIN
  -- 1) 어느 admin 의 ID 를 빌려옴 (시드 작성자)
  SELECT id INTO admin_uid
  FROM profiles
  WHERE role IN ('admin', 'superadmin')
  ORDER BY created_at ASC
  LIMIT 1;

  IF admin_uid IS NULL THEN
    RAISE NOTICE '[gangneung_seed] admin profile 이 없어 강릉 더미 매물 시드를 건너뜀.';
    RETURN;
  END IF;

  -- properties 테이블의 필수 컬럼만 안전하게 채움. 컬럼명은 실 스키마 기준.
  INSERT INTO properties (
    plaza_id, user_id, title, description,
    property_type, transaction_type, price,
    address, lat, lng,
    rooms, bathrooms, area_sqm,
    status, seller_type
  )
  SELECT
    'gangneung',
    admin_uid,
    title, description,
    property_type, transaction_type, price,
    address, lat, lng,
    2, 1, 84.5,
    'active', 'individual'
  FROM (VALUES
    ('강릉 경포대 오션뷰 아파트', '바다가 한눈에 보이는 신축 아파트입니다.',
     '아파트', '매매', 65000,
     '강원특별자치도 강릉시 경포로 320', 37.795, 128.906),
    ('강릉 시내 신축 빌라', '깔끔한 신축 빌라, 주차 가능.',
     '빌라', '전세', 25000,
     '강원특별자치도 강릉시 임영로 200', 37.752, 128.876),
    ('강릉 안목해변 카페거리 상가', '카페 운영 중 양도. 권리금 협의.',
     '상가', '월세', 500,
     '강원특별자치도 강릉시 창해로 14번길 20', 37.770, 128.948),
    ('강릉 주문진 게스트하우스', '바다 도보 5분 게스트하우스 매물.',
     '주택', '매매', 38000,
     '강원특별자치도 강릉시 주문진읍 해안로 1234', 37.890, 128.825),
    ('강릉 정동진 펜션', '일출 명소 정동진 펜션 통매각.',
     '펜션', '매매', 95000,
     '강원특별자치도 강릉시 강동면 정동진리 50', 37.689, 129.034)
  ) AS v(title, description, property_type, transaction_type, price, address, lat, lng)
  ON CONFLICT DO NOTHING;
END $$;

-- ─── 강릉 공지사항 ──────────────────────────────────────────────────────────
INSERT INTO notices (plaza_id, title, content, is_pinned, is_published)
VALUES
  ('gangneung', '강릉광장 오픈 안내', '안녕하세요. 강릉광장이 새롭게 오픈했습니다. 많은 관심 부탁드립니다.', true,  true),
  ('gangneung', '서비스 이용 안내',     '회원가입 및 매물 등록 안내입니다.',                                        false, true)
ON CONFLICT DO NOTHING;

-- ─── 강릉 FAQ ───────────────────────────────────────────────────────────────
INSERT INTO faqs (plaza_id, question, answer, sort_order)
VALUES
  ('gangneung', '강릉광장은 어떤 서비스인가요?', '강릉 지역 부동산·생활정보·커뮤니티 플랫폼입니다.', 1),
  ('gangneung', '회원가입은 어떻게 하나요?',   '상단 메뉴의 회원가입 버튼을 통해 가입할 수 있습니다.', 2)
ON CONFLICT DO NOTHING;

-- ─── 강릉 게시판 카테고리 (춘천 카테고리 복제) ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='board_categories') THEN
    INSERT INTO board_categories (plaza_id, slug, name, description, sort_order)
    SELECT 'gangneung', slug, name, description, sort_order
    FROM board_categories
    WHERE plaza_id = 'chuncheon'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
