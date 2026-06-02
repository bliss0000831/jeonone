-- properties.property_type CHECK 제약조건에 "펜션" 추가
-- 기존 제약조건 이름: properties_property_type_check

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_property_type_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_property_type_check
  CHECK (property_type IN (
    '아파트', '빌라', '오피스텔', '원룸', '투룸',
    '주택', '펜션', '상가', '사무실', '토지'
  ));

NOTIFY pgrst, 'reload schema';
