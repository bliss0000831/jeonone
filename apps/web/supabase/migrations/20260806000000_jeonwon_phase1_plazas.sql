-- ============================================================================
-- 전원일기 Phase 1 — 도(道) 단위 광장 시드
--
-- 기존 시군(63개) 광장 구조를 도 단위 9개로 재편.
--   - 강원: is_active = true (우선 런칭)
--   - 나머지 8개 도: is_open_soon = true (오픈예정)
-- 시군(강릉/춘천 등)은 coverage 배열 = in-app sub-region 필터로 사용.
-- name 은 "○○ 전원일기" — plazaCityName() 이 "전원일기" 접미사를 떼어 도명 추출.
-- parent_region 은 허브 그룹핑용 권역명(REGION_ORDER 와 일치해야 표시됨).
-- theme.primaryColor = 그린(#225a39).
-- ============================================================================

BEGIN;

-- 기존(옛 광장) plaza 행 제거 — 도 단위로 완전 교체 (콘텐츠는 plaza_id 문자열로만 연결, FK 없음)
DELETE FROM plazas;

INSERT INTO plazas (id, name, parent_region, center_lat, center_lng, theme, is_active, is_open_soon, sort_order, coverage)
VALUES
  ('gangwon','강원 전원일기','강원권',37.822800,128.155500,'{"primaryColor":"#225a39"}'::jsonb, true, false, 1,
    ARRAY['춘천','원주','강릉','동해','태백','속초','삼척','홍천','횡성','영월','평창','정선','철원','화천','양구','인제','고성','양양']),

  ('gyeonggi','경기 전원일기','경기권',37.413800,127.518300,'{"primaryColor":"#225a39"}'::jsonb, false, true, 2,
    ARRAY['수원','성남','고양','용인','부천','안산','안양','남양주','화성','평택','의정부','시흥','파주','김포','광명','광주','군포','오산','이천','양주','안성','구리','포천','의왕','하남','여주','동두천','과천','가평','연천']),

  ('chungbuk','충북 전원일기','충청권',36.635700,127.491700,'{"primaryColor":"#225a39"}'::jsonb, false, true, 3,
    ARRAY['청주','충주','제천','보은','옥천','영동','증평','진천','괴산','음성','단양']),

  ('chungnam','충남 전원일기','충청권',36.518400,126.800000,'{"primaryColor":"#225a39"}'::jsonb, false, true, 4,
    ARRAY['천안','공주','보령','아산','서산','논산','계룡','당진','금산','부여','서천','청양','홍성','예산','태안','세종']),

  ('jeonbuk','전북 전원일기','전라권',35.717500,127.153000,'{"primaryColor":"#225a39"}'::jsonb, false, true, 5,
    ARRAY['전주','군산','익산','정읍','남원','김제','완주','진안','무주','장수','임실','순창','고창','부안']),

  ('jeonnam','전남 전원일기','전라권',34.867900,126.991000,'{"primaryColor":"#225a39"}'::jsonb, false, true, 6,
    ARRAY['목포','여수','순천','나주','광양','담양','곡성','구례','고흥','보성','화순','장흥','강진','해남','영암','무안','함평','영광','장성','완도','진도','신안']),

  ('gyeongbuk','경북 전원일기','경상권',36.491900,128.888900,'{"primaryColor":"#225a39"}'::jsonb, false, true, 7,
    ARRAY['포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','군위','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉']),

  ('gyeongnam','경남 전원일기','경상권',35.460600,128.213200,'{"primaryColor":"#225a39"}'::jsonb, false, true, 8,
    ARRAY['창원','진주','통영','사천','김해','밀양','거제','양산','의령','함안','창녕','고성','남해','하동','산청','함양','거창','합천']),

  ('jeju','제주 전원일기','제주권',33.489000,126.498300,'{"primaryColor":"#225a39"}'::jsonb, false, true, 9,
    ARRAY['제주시','서귀포시'])
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  parent_region = EXCLUDED.parent_region,
  center_lat    = EXCLUDED.center_lat,
  center_lng    = EXCLUDED.center_lng,
  theme         = EXCLUDED.theme,
  is_active     = EXCLUDED.is_active,
  is_open_soon  = EXCLUDED.is_open_soon,
  sort_order    = EXCLUDED.sort_order,
  coverage      = EXCLUDED.coverage,
  updated_at    = NOW();

COMMIT;
