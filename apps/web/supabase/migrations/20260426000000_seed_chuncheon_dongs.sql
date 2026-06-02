-- 춘천시 산하 행정동·읍·면 seed
-- 기존 레코드는 유지하고 누락된 것만 추가 (WHERE NOT EXISTS 패턴)

DO $$
DECLARE
  chuncheon_id UUID;
  target_name  TEXT;
  next_order   INT;
  names TEXT[] := ARRAY[
    -- 행정동
    '교동', '조운동', '약사명동', '근화동', '소양동',
    '후평1동', '후평2동', '후평3동', '석사동', '퇴계동',
    '효자1동', '효자2동', '효자3동', '강남동', '신사우동',
    '온의동',
    -- 읍/면
    '신북읍',
    '동면', '동산면', '신동면', '동내면',
    '남면', '남산면', '서면', '사북면', '북산면'
  ];
BEGIN
  -- 춘천시 parent 찾기 (없으면 skip)
  SELECT id INTO chuncheon_id
  FROM regions
  WHERE name = '춘천시'
  ORDER BY level ASC
  LIMIT 1;

  IF chuncheon_id IS NULL THEN
    RAISE NOTICE '춘천시 region 이 없어 seed 를 건너뜁니다.';
    RETURN;
  END IF;

  -- 현재 최대 sort_order
  SELECT COALESCE(MAX(sort_order), 0) INTO next_order
  FROM regions
  WHERE parent_id = chuncheon_id;

  FOREACH target_name IN ARRAY names LOOP
    IF NOT EXISTS (
      SELECT 1 FROM regions
      WHERE parent_id = chuncheon_id AND name = target_name
    ) THEN
      next_order := next_order + 1;
      INSERT INTO regions (name, parent_id, level, sort_order, is_active)
      VALUES (target_name, chuncheon_id, 2, next_order, true);
    END IF;
  END LOOP;
END $$;

-- order_index 컬럼이 있는 환경에서는 sort_order 와 동기화
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'regions' AND column_name = 'order_index'
  ) THEN
    EXECUTE 'UPDATE regions SET order_index = sort_order WHERE order_index IS DISTINCT FROM sort_order';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
