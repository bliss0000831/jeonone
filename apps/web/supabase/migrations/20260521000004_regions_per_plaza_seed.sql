-- ============================================================================
-- regions 테이블에 plaza_id 추가 + 광장별 도시·동/면 시드
--
-- 기존 regions 는 춘천시 + 산하 동만 시드돼있음. 멀티-광장 운영을 위해:
--   1. plaza_id 컬럼 추가 + 기존 row 'chuncheon' 백필
--   2. 춘천광장 추가 도시 (홍천/화천/양구/인제) + 각 동/면
--   3. 강릉광장 도시 (강릉/주문진/진부/횡계/정동진/옥계) + 동/면
-- ============================================================================

BEGIN;

-- ─── plaza_id 컬럼 ────────────────────────────────────────────────────────
ALTER TABLE regions ADD COLUMN IF NOT EXISTS plaza_id TEXT;
UPDATE regions SET plaza_id = 'chuncheon' WHERE plaza_id IS NULL;
ALTER TABLE regions ALTER COLUMN plaza_id SET DEFAULT 'chuncheon';
CREATE INDEX IF NOT EXISTS regions_plaza_id_idx ON regions(plaza_id);

-- order_index 컬럼이 없는 환경 대비
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regions' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE regions ADD COLUMN order_index INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ─── 헬퍼: 도시 (level 1) UPSERT 후 ID 반환 ───────────────────────────────
CREATE OR REPLACE FUNCTION _upsert_region_city(
  p_plaza TEXT, p_name TEXT, p_order INT
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM regions
   WHERE plaza_id = p_plaza AND parent_id IS NULL AND name = p_name
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO regions (plaza_id, name, parent_id, level, sort_order, order_index, is_active)
    VALUES (p_plaza, p_name, NULL, 1, p_order, p_order, true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE regions SET sort_order = p_order, order_index = p_order
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── 헬퍼: 도시 산하 동/면 (level 2) 일괄 시드 ──────────────────────────
CREATE OR REPLACE FUNCTION _seed_region_children(
  p_plaza TEXT, p_parent UUID, p_names TEXT[]
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  i INT := 0;
  n TEXT;
BEGIN
  FOREACH n IN ARRAY p_names LOOP
    i := i + 1;
    IF NOT EXISTS (
      SELECT 1 FROM regions WHERE parent_id = p_parent AND name = n
    ) THEN
      INSERT INTO regions (plaza_id, name, parent_id, level, sort_order, order_index, is_active)
      VALUES (p_plaza, n, p_parent, 2, i, i, true);
    END IF;
  END LOOP;
END $$;

-- ─── 춘천광장 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  chuncheon_id UUID;
  hongcheon_id UUID;
  hwacheon_id UUID;
  yanggu_id UUID;
  inje_id UUID;
BEGIN
  -- 춘천시 (existing 일 가능성 큼 — 없으면 생성)
  chuncheon_id := _upsert_region_city('chuncheon', '춘천시', 1);
  PERFORM _seed_region_children('chuncheon', chuncheon_id, ARRAY[
    -- 행정동
    '교동','조운동','약사명동','근화동','소양동',
    '후평1동','후평2동','후평3동','석사동','퇴계동',
    '효자1동','효자2동','효자3동','강남동','신사우동','온의동',
    -- 읍/면
    '신북읍','동면','동산면','신동면','동내면',
    '남면','남산면','서면','사북면','북산면'
  ]);

  -- 홍천군
  hongcheon_id := _upsert_region_city('chuncheon', '홍천군', 2);
  PERFORM _seed_region_children('chuncheon', hongcheon_id, ARRAY[
    '홍천읍','화촌면','두촌면','내촌면','서석면','영귀미면','북방면','내면','서면','남면'
  ]);

  -- 화천군
  hwacheon_id := _upsert_region_city('chuncheon', '화천군', 3);
  PERFORM _seed_region_children('chuncheon', hwacheon_id, ARRAY[
    '화천읍','간동면','하남면','사내면','상서면'
  ]);

  -- 양구군
  yanggu_id := _upsert_region_city('chuncheon', '양구군', 4);
  PERFORM _seed_region_children('chuncheon', yanggu_id, ARRAY[
    '양구읍','남면','동면','방산면','해안면'
  ]);

  -- 인제군
  inje_id := _upsert_region_city('chuncheon', '인제군', 5);
  PERFORM _seed_region_children('chuncheon', inje_id, ARRAY[
    '인제읍','남면','북면','기린면','상남면','서화면'
  ]);
END $$;

-- ─── 강릉광장 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  gangneung_id UUID;
  jumunjin_id UUID;
  jeongdongjin_id UUID;
  okgye_id UUID;
  jinbu_id UUID;
  hoenggye_id UUID;
BEGIN
  -- 강릉시 본진
  gangneung_id := _upsert_region_city('gangneung', '강릉시', 1);
  PERFORM _seed_region_children('gangneung', gangneung_id, ARRAY[
    -- 행정동 (인구 많은 곳 위주)
    '중앙동','옥천동','홍제동','교1동','교2동','포남1동','포남2동','초당동',
    '강남동','성덕동','송정동','내곡동','회산동',
    -- 면
    '강동면','사천면','연곡면','왕산면','구정면','성산면'
  ]);

  -- 주문진 (실제 강릉시 주문진읍이지만, 광장 커버리지 단위로 별도 city)
  jumunjin_id := _upsert_region_city('gangneung', '주문진', 2);
  PERFORM _seed_region_children('gangneung', jumunjin_id, ARRAY[
    '주문진읍','교항리','향호리','장덕리','삼교리','주문리'
  ]);

  -- 정동진 (강동면 산하 리)
  jeongdongjin_id := _upsert_region_city('gangneung', '정동진', 3);
  PERFORM _seed_region_children('gangneung', jeongdongjin_id, ARRAY[
    '정동진리','심곡리','산성우리','언별리','금진리'
  ]);

  -- 옥계 (옥계면)
  okgye_id := _upsert_region_city('gangneung', '옥계', 4);
  PERFORM _seed_region_children('gangneung', okgye_id, ARRAY[
    '현내리','주수리','조산리','천남리','북동리','산계리'
  ]);

  -- 진부 (평창군 진부면 — 광장 커버리지)
  jinbu_id := _upsert_region_city('gangneung', '진부', 5);
  PERFORM _seed_region_children('gangneung', jinbu_id, ARRAY[
    '진부면','하진부리','상진부리','거문리','수항리','마평리','막동리'
  ]);

  -- 횡계 (평창군 대관령면 — 옛 도암면 횡계리)
  hoenggye_id := _upsert_region_city('gangneung', '횡계', 6);
  PERFORM _seed_region_children('gangneung', hoenggye_id, ARRAY[
    '횡계리','용산리','수하리','병내리','차항리','유천리'
  ]);
END $$;

-- ─── 헬퍼 함수 정리 ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _upsert_region_city(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS _seed_region_children(TEXT, UUID, TEXT[]);

NOTIFY pgrst, 'reload schema';

COMMIT;
