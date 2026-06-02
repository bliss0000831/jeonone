-- ============================================================================
-- 7권역 63광장 264지역 전체 시드 + 커버리지 컬럼 추가
--
-- - plazas.coverage: 광장이 커버하는 지역 목록 (TEXT[])
--   ex) chuncheon → ['춘천','홍천','화천','양구','인제']
-- - 모든 광장 UPSERT. 기존 chuncheon/gangneung 만 is_active=true 유지.
-- ============================================================================

BEGIN;

-- ─── coverage 컬럼 추가 ────────────────────────────────────────────────────
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS coverage TEXT[] DEFAULT '{}';

-- 이전 미니 시드(20260521000000)의 일부 ID 가 새 ID 와 다르면 정리.
-- 'gwangju-jn' (전라 광주) 는 그대로 유지.
DELETE FROM plazas WHERE id NOT IN (
  -- 서울권
  'seoul-south','seoul-north','seoul-west','seoul-mid',
  -- 경기권
  'gyeonggi-north','goyang','guri','gimpo','bucheon-siheung','seongnam','suwon',
  'ansan-sihwa','anyang','osan','yongin-suji','incheon','pyeongtaek-anseong','hanam-icheon',
  -- 강원권
  'chuncheon','gangneung','donghae-samcheok','sokcho','wonju','taebaek',
  -- 충청권
  'gongju-sejong','dangjin','daejeon','baekje','seosan','sejong','jecheon','cheonan','cheongju','chungseo','chungju',
  -- 전라권
  'gwangju-jn','gunsan','namwon','mokpo','suncheon-gwangyang','yeosu','iksan','jeonju','jeongeup',
  -- 경상권
  'gyeongsan-yeongcheon','gyeongseo','gyeongju','gumi','gimcheon','gimhae','miryang','busan','andong',
  'yangsan','yeongju','ulsan','jinju','jinhae','changwon','pohang','hallyeo',
  -- 제주권
  'jeju','seogwipo'
);

-- ─── 63개 광장 UPSERT ──────────────────────────────────────────────────────
INSERT INTO plazas (id, name, parent_region, center_lat, center_lng, theme, is_active, is_open_soon, sort_order, coverage)
VALUES
  -- 서울권 (4)
  ('seoul-south','남부광장','서울권',37.502500,127.039000,'{"primaryColor":"#E11D48"}'::jsonb, false,true,101, ARRAY['강남구','서초구','과천(일부)','송파구','장지','강일']),
  ('seoul-north','북부광장','서울권',37.601000,127.041000,'{"primaryColor":"#E11D48"}'::jsonb, false,true,102, ARRAY['종로구(?)','동대문','성동구','광진구','도봉구','노원구','성북구','강북구']),
  ('seoul-west','서부광장','서울권',37.553000,126.918000,'{"primaryColor":"#E11D48"}'::jsonb, false,true,103, ARRAY['구로구','금천구','영등포구','광명시','양천구','강서구','관악구','동작구']),
  ('seoul-mid','중부광장','서울권',37.563000,126.978000,'{"primaryColor":"#E11D48"}'::jsonb, false,true,104, ARRAY['서대문구','은평구','종로구','마포구','용산구','중구']),

  -- 경기권 (14)
  ('gyeonggi-north','경기북부광장','경기권',37.737000,127.046000,'{"primaryColor":"#F97316"}'::jsonb, false,true,201, ARRAY['의정부시','동두천시','양주시','포천시','연천군']),
  ('goyang','고양광장','경기권',37.658000,126.832000,'{"primaryColor":"#F97316"}'::jsonb, false,true,202, ARRAY['고양시','파주시']),
  ('guri','구리광장','경기권',37.594000,127.130000,'{"primaryColor":"#F97316"}'::jsonb, false,true,203, ARRAY['남양주시','구리시','가평군','양평군']),
  ('gimpo','김포광장','경기권',37.615000,126.715000,'{"primaryColor":"#F97316"}'::jsonb, false,true,204, ARRAY['김포시','강화군','검단']),
  ('bucheon-siheung','부천시흥광장','경기권',37.503000,126.766000,'{"primaryColor":"#F97316"}'::jsonb, false,true,205, ARRAY['부천시','시흥시','시화']),
  ('seongnam','성남광장','경기권',37.420000,127.126000,'{"primaryColor":"#F97316"}'::jsonb, false,true,206, ARRAY['성남','분당','판교 전지역','광주','수지 일부']),
  ('suwon','수원광장','경기권',37.263000,127.028000,'{"primaryColor":"#F97316"}'::jsonb, false,true,207, ARRAY['수원시']),
  ('ansan-sihwa','안산시화광장','경기권',37.321000,126.831000,'{"primaryColor":"#F97316"}'::jsonb, false,true,208, ARRAY['안산시','시화 지역']),
  ('anyang','안양광장','경기권',37.394000,126.957000,'{"primaryColor":"#F97316"}'::jsonb, false,true,209, ARRAY['안양','군포','의왕','과천']),
  ('osan','오산광장','경기권',37.149000,127.077000,'{"primaryColor":"#F97316"}'::jsonb, false,true,210, ARRAY['오산시','화성시 전지역']),
  ('yongin-suji','용인수지광장','경기권',37.323000,127.097000,'{"primaryColor":"#F97316"}'::jsonb, false,true,211, ARRAY['처인구','기흥구','수지구']),
  ('incheon','인천광장','경기권',37.456000,126.705000,'{"primaryColor":"#F97316"}'::jsonb, false,true,212, ARRAY['인천 전지역']),
  ('pyeongtaek-anseong','평택안성광장','경기권',37.000000,127.117000,'{"primaryColor":"#F97316"}'::jsonb, false,true,213, ARRAY['평택시','안성시']),
  ('hanam-icheon','하남이천광장','경기권',37.500000,127.275000,'{"primaryColor":"#F97316"}'::jsonb, false,true,214, ARRAY['하남시','광주시','이천시','여주시','곤지암읍','장호원읍','감곡면']),

  -- 강원권 (6)
  ('chuncheon','춘천광장','강원권',37.881000,127.730000,'{"primaryColor":"#0EA5E9"}'::jsonb, true ,false,301, ARRAY['춘천','홍천','화천','양구','인제']),
  ('gangneung','강릉광장','강원권',37.752000,128.876000,'{"primaryColor":"#0EA5E9"}'::jsonb, true ,false,302, ARRAY['강릉','주문진','진부','횡계','정동진','옥계']),
  ('donghae-samcheok','동해삼척광장','강원권',37.524000,129.114000,'{"primaryColor":"#0EA5E9"}'::jsonb, false,true,303, ARRAY['동해시','삼척시']),
  ('sokcho','속초광장','강원권',38.207000,128.591000,'{"primaryColor":"#0EA5E9"}'::jsonb, false,true,304, ARRAY['속초시','고성군','양양군']),
  ('wonju','원주광장','강원권',37.342000,127.920000,'{"primaryColor":"#0EA5E9"}'::jsonb, false,true,305, ARRAY['원주','문막','횡성','영월','평창']),
  ('taebaek','태백광장','강원권',37.164000,128.985000,'{"primaryColor":"#0EA5E9"}'::jsonb, false,true,306, ARRAY['태백','정선','고한','사북','도계','상동','석포']),

  -- 충청권 (11)
  ('gongju-sejong','공주세종광장','충청권',36.446000,127.119000,'{"primaryColor":"#10B981"}'::jsonb, false,true,401, ARRAY['세종시','공주시','청양군','부여군','유구읍']),
  ('dangjin','당진광장','충청권',36.892000,126.628000,'{"primaryColor":"#10B981"}'::jsonb, false,true,402, ARRAY['당진시 전지역']),
  ('daejeon','대전광장','충청권',36.350000,127.385000,'{"primaryColor":"#10B981"}'::jsonb, false,true,403, ARRAY['대전시','논산시','공주시','조치원','계룡시','옥천군']),
  ('baekje','백제광장','충청권',36.272000,127.000000,'{"primaryColor":"#10B981"}'::jsonb, false,true,404, ARRAY['논산시','계룡시','부여군']),
  ('seosan','서산광장','충청권',36.785000,126.450000,'{"primaryColor":"#10B981"}'::jsonb, false,true,405, ARRAY['서산시','태안군']),
  ('sejong','세종광장','충청권',36.480000,127.289000,'{"primaryColor":"#10B981"}'::jsonb, false,true,406, ARRAY['세종시 전역','오송','강내']),
  ('jecheon','제천광장','충청권',37.133000,128.191000,'{"primaryColor":"#10B981"}'::jsonb, false,true,407, ARRAY['제천','단양']),
  ('cheonan','천안광장','충청권',36.815000,127.114000,'{"primaryColor":"#10B981"}'::jsonb, false,true,408, ARRAY['천안','아산 전지역','세종 일부(연기,전의,소정)']),
  ('cheongju','청주광장','충청권',36.642000,127.489000,'{"primaryColor":"#10B981"}'::jsonb, false,true,409, ARRAY['청주시','청원군','증평','진천']),
  ('chungseo','충서광장','충청권',36.601000,126.661000,'{"primaryColor":"#10B981"}'::jsonb, false,true,410, ARRAY['보령시','홍성군','내포 신도시','청양군','예산군']),
  ('chungju','충주광장','충청권',36.991000,127.926000,'{"primaryColor":"#10B981"}'::jsonb, false,true,411, ARRAY['충주시','음성군','주덕','엄정','금왕','맹동','삼성','대소','생극','광혜원','가산']),

  -- 전라권 (9)
  ('gwangju-jn','광주광장','전라권',35.160000,126.853000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,501, ARRAY['광주 전역']),
  ('gunsan','군산광장','전라권',35.967000,126.737000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,502, ARRAY['군산','서천','장항']),
  ('namwon','남원광장','전라권',35.416000,127.390000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,503, ARRAY['곡성군','구례군','순창군','임실군','진안군','장수군','장계면','남원시']),
  ('mokpo','목포광장','전라권',34.812000,126.392000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,504, ARRAY['목포','무안','함평','영암','해남','진도','강진','신안','장흥','완도']),
  ('suncheon-gwangyang','순천광양광장','전라권',34.951000,127.487000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,505, ARRAY['순천시','광양시','고흥군','보성군']),
  ('yeosu','여수광장','전라권',34.760000,127.662000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,506, ARRAY['여수시','여천시 전지역']),
  ('iksan','익산광장','전라권',35.948000,126.957000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,507, ARRAY['익산시 전지역']),
  ('jeonju','전주광장','전라권',35.825000,127.148000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,508, ARRAY['전주시','완주군']),
  ('jeongeup','정읍광장','전라권',35.570000,126.856000,'{"primaryColor":"#8B5CF6"}'::jsonb, false,true,509, ARRAY['정읍시','고창군','김제시','부안군']),

  -- 경상권 (17)
  ('gyeongsan-yeongcheon','경산영천광장','경상권',35.825000,128.741000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,601, ARRAY['경산시','영천시','청도군','대구 시지/반야월 인근']),
  ('gyeongseo','경서광장','경상권',35.685000,127.910000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,602, ARRAY['거창군','함양군','합천군','무주군']),
  ('gyeongju','경주광장','경상권',35.856000,129.224000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,603, ARRAY['경주시 전역']),
  ('gumi','구미광장','경상권',36.119000,128.345000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,604, ARRAY['구미시','아포','왜관','선산','해평','산동','가산']),
  ('gimcheon','김천광장','경상권',36.140000,128.114000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,605, ARRAY['김천시','영동군']),
  ('gimhae','김해광장','경상권',35.235000,128.890000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,606, ARRAY['김해시 전역']),
  ('miryang','밀양광장','경상권',35.504000,128.749000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,607, ARRAY['밀양','수산','삼랑진','창녕','남지','청도']),
  ('busan','부산광장','경상권',35.180000,129.075000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,608, ARRAY['부산 전지역']),
  ('andong','안동광장','경상권',36.568000,128.729000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,609, ARRAY['안동시','예천군','의성군','군위군','영양군','청송군']),
  ('yangsan','양산광장','경상권',35.335000,129.037000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,610, ARRAY['양산시 전지역','덕계','서창','웅촌']),
  ('yeongju','영주광장','경상권',36.806000,128.624000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,611, ARRAY['영주시','예천군','봉화군','울진군']),
  ('ulsan','울산광장','경상권',35.539000,129.311000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,612, ARRAY['울산광역시 전역']),
  ('jinju','진주광장','경상권',35.180000,128.108000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,613, ARRAY['진주','사천','남해','하동','산청']),
  ('jinhae','진해광장','경상권',35.150000,128.665000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,614, ARRAY['진해','용원','녹산']),
  ('changwon','창원광장','경상권',35.227000,128.681000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,615, ARRAY['창원','마산','진해','함안군','의령군 인근']),
  ('pohang','포항광장','경상권',36.020000,129.343000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,616, ARRAY['포항','안강','영덕','구룡포','영일 전지역']),
  ('hallyeo','한려광장','경상권',34.854000,128.433000,'{"primaryColor":"#F59E0B"}'::jsonb, false,true,617, ARRAY['통영','고성','배둔']),

  -- 제주권 (2)
  ('jeju','제주광장','제주권',33.499000,126.531000,'{"primaryColor":"#14B8A6"}'::jsonb, false,true,701, ARRAY['전지역']),
  ('seogwipo','서귀포광장','제주권',33.253000,126.560000,'{"primaryColor":"#14B8A6"}'::jsonb, false,true,702, ARRAY['전지역'])

ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  parent_region = EXCLUDED.parent_region,
  center_lat    = EXCLUDED.center_lat,
  center_lng    = EXCLUDED.center_lng,
  -- theme/is_active/is_open_soon 은 운영 중 수정 가능하므로 덮어쓰지 않음
  sort_order    = EXCLUDED.sort_order,
  coverage      = EXCLUDED.coverage,
  updated_at    = NOW();

-- ─── plaza_admins: 신규 광장에도 super 자동 등록 ───────────────────────────
INSERT INTO plaza_admins (user_id, plaza_id, role)
SELECT pa.user_id, p.id, 'super'
FROM plaza_admins pa
CROSS JOIN plazas p
WHERE pa.role = 'super'
ON CONFLICT (user_id, plaza_id) DO NOTHING;

COMMIT;
