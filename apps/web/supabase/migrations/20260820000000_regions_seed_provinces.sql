-- ════════════════════════════════════════════════════════════════
-- 전원일기 — 9개 도(plaza)별 시군(level=1) + 동/읍/면(level=2) regions 시드
-- 옛 광장(chuncheon/gangneung)으로만 시드돼 있어 도 단위 plaza 에서 "설정된 지역이 없습니다"
-- 가 뜨던 문제 해결. 출처: apps/web/lib/constants/korea-regions.ts (자동 생성).
-- 멱등: 이미 있으면 건너뜀. 재실행 안전.
-- ════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE regions ADD COLUMN IF NOT EXISTS plaza_id TEXT;
CREATE INDEX IF NOT EXISTS regions_plaza_id_idx ON regions(plaza_id);

CREATE OR REPLACE FUNCTION _seed_city(p_plaza TEXT, p_name TEXT, p_order INT) RETURNS UUID
LANGUAGE plpgsql AS $fn$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM regions WHERE plaza_id = p_plaza AND parent_id IS NULL AND name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO regions (plaza_id, name, parent_id, level, sort_order, order_index, is_active)
    VALUES (p_plaza, p_name, NULL, 1, p_order, p_order, true) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION _seed_dongs(p_plaza TEXT, p_parent UUID, p_names TEXT[]) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE i INT := 0; n TEXT;
BEGIN
  FOREACH n IN ARRAY p_names LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM regions WHERE parent_id = p_parent AND name = n) THEN
      INSERT INTO regions (plaza_id, name, parent_id, level, sort_order, order_index, is_active)
      VALUES (p_plaza, n, p_parent, 2, i, i, true);
    END IF;
  END LOOP;
END $fn$;

-- ─── gangwon (강원특별자치도) : 시군 18개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('gangwon', '춘천시', 1);
  PERFORM _seed_dongs('gangwon', c, ARRAY['교동','조운동','약사명동','근화동','소양동','후평1동','후평2동','후평3동','석사동','퇴계동','효자1동','효자2동','효자3동','강남동','신사우동','온의동','신북읍','동면','동산면','신동면','동내면','남면','남산면','서면','사북면','북산면']);
  c := _seed_city('gangwon', '원주시', 2);
  PERFORM _seed_dongs('gangwon', c, ARRAY['중앙동','원인동','개운동','명륜동','단구동','일산동','학성동','단계동','우산동','태장동','봉산동','행구동','무실동','반곡동','관설동','문막읍','소초면','호저면','지정면','부론면','귀래면','흥업면','판부면','신림면']);
  c := _seed_city('gangwon', '강릉시', 3);
  PERFORM _seed_dongs('gangwon', c, ARRAY['홍제동','중앙동','옥천동','교동','포남동','초당동','송정동','내곡동','강동면','옥계면','주문진읍','연곡면','사천면','성산면','구정면','왕산면']);
  c := _seed_city('gangwon', '동해시', 4);
  PERFORM _seed_dongs('gangwon', c, ARRAY['천곡동','북삼동','발한동']);
  c := _seed_city('gangwon', '태백시', 5);
  PERFORM _seed_dongs('gangwon', c, ARRAY['황지동','장성동','문곡동']);
  c := _seed_city('gangwon', '속초시', 6);
  PERFORM _seed_dongs('gangwon', c, ARRAY['중앙동','교동','청호동']);
  c := _seed_city('gangwon', '삼척시', 7);
  PERFORM _seed_dongs('gangwon', c, ARRAY['교동','성내동','정라동']);
  c := _seed_city('gangwon', '홍천군', 8);
  PERFORM _seed_dongs('gangwon', c, ARRAY['홍천읍','화촌면','두촌면']);
  c := _seed_city('gangwon', '횡성군', 9);
  PERFORM _seed_dongs('gangwon', c, ARRAY['횡성읍','우천면','안흥면']);
  c := _seed_city('gangwon', '영월군', 10);
  PERFORM _seed_dongs('gangwon', c, ARRAY['영월읍','상동읍','중동면']);
  c := _seed_city('gangwon', '평창군', 11);
  PERFORM _seed_dongs('gangwon', c, ARRAY['평창읍','미탄면','대화면']);
  c := _seed_city('gangwon', '정선군', 12);
  PERFORM _seed_dongs('gangwon', c, ARRAY['정선읍','고한읍','사북읍']);
  c := _seed_city('gangwon', '철원군', 13);
  PERFORM _seed_dongs('gangwon', c, ARRAY['갈말읍','동송읍','김화읍']);
  c := _seed_city('gangwon', '화천군', 14);
  PERFORM _seed_dongs('gangwon', c, ARRAY['화천읍','간동면','하남면']);
  c := _seed_city('gangwon', '양구군', 15);
  PERFORM _seed_dongs('gangwon', c, ARRAY['양구읍','남면','방산면']);
  c := _seed_city('gangwon', '인제군', 16);
  PERFORM _seed_dongs('gangwon', c, ARRAY['인제읍','남면','북면']);
  c := _seed_city('gangwon', '고성군', 17);
  PERFORM _seed_dongs('gangwon', c, ARRAY['간성읍','거진읍','토성면']);
  c := _seed_city('gangwon', '양양군', 18);
  PERFORM _seed_dongs('gangwon', c, ARRAY['양양읍','서면','손양면']);
END $$;

-- ─── gyeonggi (경기도) : 시군 28개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('gyeonggi', '수원시', 1);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['장안구','권선구','팔달구','영통구']);
  c := _seed_city('gyeonggi', '성남시', 2);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['수정구','중원구','분당구']);
  c := _seed_city('gyeonggi', '고양시', 3);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['덕양구','일산동구','일산서구']);
  c := _seed_city('gyeonggi', '용인시', 4);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['처인구','기흥구','수지구']);
  c := _seed_city('gyeonggi', '부천시', 5);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['원미동','심곡동','중동','상동','소사동','역곡동','오정동']);
  c := _seed_city('gyeonggi', '안산시', 6);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['상록구','단원구']);
  c := _seed_city('gyeonggi', '화성시', 7);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['동탄동','병점동','진안동','반월동']);
  c := _seed_city('gyeonggi', '평택시', 8);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['평택동','서정동','송탄동','안중읍']);
  c := _seed_city('gyeonggi', '의정부시', 9);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['의정부동','호원동','장암동']);
  c := _seed_city('gyeonggi', '시흥시', 10);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['대야동','신천동','정왕동']);
  c := _seed_city('gyeonggi', '파주시', 11);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['금촌동','문산읍','운정동']);
  c := _seed_city('gyeonggi', '김포시', 12);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['사우동','장기동','구래동']);
  c := _seed_city('gyeonggi', '광명시', 13);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['광명동','철산동','하안동']);
  c := _seed_city('gyeonggi', '군포시', 14);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['산본동','금정동','당동']);
  c := _seed_city('gyeonggi', '하남시', 15);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['미사동','덕풍동','신장동']);
  c := _seed_city('gyeonggi', '오산시', 16);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['오산동','세마동']);
  c := _seed_city('gyeonggi', '이천시', 17);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['중리동','증포동']);
  c := _seed_city('gyeonggi', '안성시', 18);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['안성동','공도읍']);
  c := _seed_city('gyeonggi', '남양주시', 19);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['호평동','평내동','다산동']);
  c := _seed_city('gyeonggi', '의왕시', 20);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['내손동','오전동']);
  c := _seed_city('gyeonggi', '양평군', 21);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['양평읍','강하면']);
  c := _seed_city('gyeonggi', '여주시', 22);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['여주읍','흥천면']);
  c := _seed_city('gyeonggi', '과천시', 23);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['중앙동','별양동']);
  c := _seed_city('gyeonggi', '양주시', 24);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['양주동','덕계동']);
  c := _seed_city('gyeonggi', '포천시', 25);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['포천동','소흘읍']);
  c := _seed_city('gyeonggi', '동두천시', 26);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['생연동','보산동']);
  c := _seed_city('gyeonggi', '가평군', 27);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['가평읍','청평면']);
  c := _seed_city('gyeonggi', '연천군', 28);
  PERFORM _seed_dongs('gyeonggi', c, ARRAY['연천읍','전곡읍']);
END $$;

-- ─── chungbuk (충청북도) : 시군 11개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('chungbuk', '청주시', 1);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['상당구','서원구','흥덕구','청원구']);
  c := _seed_city('chungbuk', '충주시', 2);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['교현동','성내동','연수동']);
  c := _seed_city('chungbuk', '제천시', 3);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['의림동','화산동','청전동']);
  c := _seed_city('chungbuk', '보은군', 4);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['보은읍']);
  c := _seed_city('chungbuk', '옥천군', 5);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['옥천읍']);
  c := _seed_city('chungbuk', '영동군', 6);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['영동읍']);
  c := _seed_city('chungbuk', '증평군', 7);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['증평읍']);
  c := _seed_city('chungbuk', '진천군', 8);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['진천읍']);
  c := _seed_city('chungbuk', '괴산군', 9);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['괴산읍']);
  c := _seed_city('chungbuk', '음성군', 10);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['음성읍']);
  c := _seed_city('chungbuk', '단양군', 11);
  PERFORM _seed_dongs('chungbuk', c, ARRAY['단양읍']);
END $$;

-- ─── chungnam (충청남도) : 시군 15개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('chungnam', '천안시', 1);
  PERFORM _seed_dongs('chungnam', c, ARRAY['동남구','서북구']);
  c := _seed_city('chungnam', '공주시', 2);
  PERFORM _seed_dongs('chungnam', c, ARRAY['중학동','웅진동']);
  c := _seed_city('chungnam', '보령시', 3);
  PERFORM _seed_dongs('chungnam', c, ARRAY['대천동','명천동']);
  c := _seed_city('chungnam', '아산시', 4);
  PERFORM _seed_dongs('chungnam', c, ARRAY['온천동','배방읍','탕정면']);
  c := _seed_city('chungnam', '서산시', 5);
  PERFORM _seed_dongs('chungnam', c, ARRAY['동문동','읍내동']);
  c := _seed_city('chungnam', '논산시', 6);
  PERFORM _seed_dongs('chungnam', c, ARRAY['취암동','반월동']);
  c := _seed_city('chungnam', '계룡시', 7);
  PERFORM _seed_dongs('chungnam', c, ARRAY['금암동','엄사면']);
  c := _seed_city('chungnam', '당진시', 8);
  PERFORM _seed_dongs('chungnam', c, ARRAY['당진동','읍내동']);
  c := _seed_city('chungnam', '금산군', 9);
  PERFORM _seed_dongs('chungnam', c, ARRAY['금산읍']);
  c := _seed_city('chungnam', '부여군', 10);
  PERFORM _seed_dongs('chungnam', c, ARRAY['부여읍']);
  c := _seed_city('chungnam', '서천군', 11);
  PERFORM _seed_dongs('chungnam', c, ARRAY['서천읍']);
  c := _seed_city('chungnam', '청양군', 12);
  PERFORM _seed_dongs('chungnam', c, ARRAY['청양읍']);
  c := _seed_city('chungnam', '홍성군', 13);
  PERFORM _seed_dongs('chungnam', c, ARRAY['홍성읍']);
  c := _seed_city('chungnam', '예산군', 14);
  PERFORM _seed_dongs('chungnam', c, ARRAY['예산읍']);
  c := _seed_city('chungnam', '태안군', 15);
  PERFORM _seed_dongs('chungnam', c, ARRAY['태안읍']);
END $$;

-- ─── jeonbuk (전북특별자치도) : 시군 14개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('jeonbuk', '전주시', 1);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['완산구','덕진구']);
  c := _seed_city('jeonbuk', '군산시', 2);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['중앙동','나운동','수송동']);
  c := _seed_city('jeonbuk', '익산시', 3);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['영등동','어양동','모현동']);
  c := _seed_city('jeonbuk', '정읍시', 4);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['수성동','시기동']);
  c := _seed_city('jeonbuk', '남원시', 5);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['동충동','향교동']);
  c := _seed_city('jeonbuk', '김제시', 6);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['요촌동','신풍동']);
  c := _seed_city('jeonbuk', '완주군', 7);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['삼례읍','봉동읍']);
  c := _seed_city('jeonbuk', '진안군', 8);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['진안읍']);
  c := _seed_city('jeonbuk', '무주군', 9);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['무주읍']);
  c := _seed_city('jeonbuk', '장수군', 10);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['장수읍']);
  c := _seed_city('jeonbuk', '임실군', 11);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['임실읍']);
  c := _seed_city('jeonbuk', '순창군', 12);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['순창읍']);
  c := _seed_city('jeonbuk', '고창군', 13);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['고창읍']);
  c := _seed_city('jeonbuk', '부안군', 14);
  PERFORM _seed_dongs('jeonbuk', c, ARRAY['부안읍']);
END $$;

-- ─── jeonnam (전라남도) : 시군 22개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('jeonnam', '목포시', 1);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['산정동','용당동','상동']);
  c := _seed_city('jeonnam', '여수시', 2);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['동문동','학동','문수동']);
  c := _seed_city('jeonnam', '순천시', 3);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['중앙동','향동','조례동']);
  c := _seed_city('jeonnam', '나주시', 4);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['성북동','금천동']);
  c := _seed_city('jeonnam', '광양시', 5);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['광양읍','중마동']);
  c := _seed_city('jeonnam', '담양군', 6);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['담양읍']);
  c := _seed_city('jeonnam', '곡성군', 7);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['곡성읍']);
  c := _seed_city('jeonnam', '구례군', 8);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['구례읍']);
  c := _seed_city('jeonnam', '고흥군', 9);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['고흥읍']);
  c := _seed_city('jeonnam', '보성군', 10);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['보성읍']);
  c := _seed_city('jeonnam', '화순군', 11);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['화순읍']);
  c := _seed_city('jeonnam', '장흥군', 12);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['장흥읍']);
  c := _seed_city('jeonnam', '강진군', 13);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['강진읍']);
  c := _seed_city('jeonnam', '해남군', 14);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['해남읍']);
  c := _seed_city('jeonnam', '영암군', 15);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['영암읍']);
  c := _seed_city('jeonnam', '무안군', 16);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['무안읍']);
  c := _seed_city('jeonnam', '함평군', 17);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['함평읍']);
  c := _seed_city('jeonnam', '영광군', 18);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['영광읍']);
  c := _seed_city('jeonnam', '장성군', 19);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['장성읍']);
  c := _seed_city('jeonnam', '완도군', 20);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['완도읍']);
  c := _seed_city('jeonnam', '진도군', 21);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['진도읍']);
  c := _seed_city('jeonnam', '신안군', 22);
  PERFORM _seed_dongs('jeonnam', c, ARRAY['압해읍']);
END $$;

-- ─── gyeongbuk (경상북도) : 시군 23개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('gyeongbuk', '포항시', 1);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['남구','북구']);
  c := _seed_city('gyeongbuk', '경주시', 2);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['동천동','황성동','용강동']);
  c := _seed_city('gyeongbuk', '김천시', 3);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['평화동','자산동']);
  c := _seed_city('gyeongbuk', '안동시', 4);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['명륜동','옥동']);
  c := _seed_city('gyeongbuk', '구미시', 5);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['원평동','송정동','인동동']);
  c := _seed_city('gyeongbuk', '영주시', 6);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['영주동','휴천동']);
  c := _seed_city('gyeongbuk', '영천시', 7);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['완산동','조교동']);
  c := _seed_city('gyeongbuk', '상주시', 8);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['성동동','남성동']);
  c := _seed_city('gyeongbuk', '문경시', 9);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['점촌동','모전동']);
  c := _seed_city('gyeongbuk', '경산시', 10);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['중방동','옥산동','하양읍']);
  c := _seed_city('gyeongbuk', '군위군', 11);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['군위읍']);
  c := _seed_city('gyeongbuk', '의성군', 12);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['의성읍']);
  c := _seed_city('gyeongbuk', '청송군', 13);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['청송읍']);
  c := _seed_city('gyeongbuk', '영양군', 14);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['영양읍']);
  c := _seed_city('gyeongbuk', '영덕군', 15);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['영덕읍']);
  c := _seed_city('gyeongbuk', '청도군', 16);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['화양읍']);
  c := _seed_city('gyeongbuk', '고령군', 17);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['대가야읍']);
  c := _seed_city('gyeongbuk', '성주군', 18);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['성주읍']);
  c := _seed_city('gyeongbuk', '칠곡군', 19);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['왜관읍']);
  c := _seed_city('gyeongbuk', '예천군', 20);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['예천읍']);
  c := _seed_city('gyeongbuk', '봉화군', 21);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['봉화읍']);
  c := _seed_city('gyeongbuk', '울진군', 22);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['울진읍']);
  c := _seed_city('gyeongbuk', '울릉군', 23);
  PERFORM _seed_dongs('gyeongbuk', c, ARRAY['울릉읍']);
END $$;

-- ─── gyeongnam (경상남도) : 시군 18개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('gyeongnam', '창원시', 1);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['의창구','성산구','마산합포구','마산회원구','진해구']);
  c := _seed_city('gyeongnam', '진주시', 2);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['성북동','강남동','칠암동']);
  c := _seed_city('gyeongnam', '통영시', 3);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['도천동','무전동']);
  c := _seed_city('gyeongnam', '사천시', 4);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['선구동','동금동']);
  c := _seed_city('gyeongnam', '김해시', 5);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['내동','삼계동','장유동']);
  c := _seed_city('gyeongnam', '밀양시', 6);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['내일동','삼문동']);
  c := _seed_city('gyeongnam', '거제시', 7);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['고현동','장승포동']);
  c := _seed_city('gyeongnam', '양산시', 8);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['남부동','물금읍']);
  c := _seed_city('gyeongnam', '의령군', 9);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['의령읍']);
  c := _seed_city('gyeongnam', '함안군', 10);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['가야읍']);
  c := _seed_city('gyeongnam', '창녕군', 11);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['창녕읍']);
  c := _seed_city('gyeongnam', '고성군', 12);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['고성읍']);
  c := _seed_city('gyeongnam', '남해군', 13);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['남해읍']);
  c := _seed_city('gyeongnam', '하동군', 14);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['하동읍']);
  c := _seed_city('gyeongnam', '산청군', 15);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['산청읍']);
  c := _seed_city('gyeongnam', '함양군', 16);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['함양읍']);
  c := _seed_city('gyeongnam', '거창군', 17);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['거창읍']);
  c := _seed_city('gyeongnam', '합천군', 18);
  PERFORM _seed_dongs('gyeongnam', c, ARRAY['합천읍']);
END $$;

-- ─── jeju (제주특별자치도) : 시군 2개 ───
DO $$
DECLARE c UUID;
BEGIN
  c := _seed_city('jeju', '제주시', 1);
  PERFORM _seed_dongs('jeju', c, ARRAY['일도동','이도동','삼도동','용담동','건입동','화북동','삼양동','봉개동','아라동','오라동','연동','노형동','외도동','이호동','도두동','한림읍','애월읍','구좌읍','조천읍','한경면','추자면','우도면']);
  c := _seed_city('jeju', '서귀포시', 2);
  PERFORM _seed_dongs('jeju', c, ARRAY['송산동','정방동','중앙동','천지동','효돈동','영천동','동홍동','서홍동','대륜동','대천동','중문동','예래동','대정읍','남원읍','성산읍','안덕면','표선면']);
END $$;

DROP FUNCTION IF EXISTS _seed_city(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS _seed_dongs(TEXT, UUID, TEXT[]);

NOTIFY pgrst, 'reload schema';
COMMIT;
