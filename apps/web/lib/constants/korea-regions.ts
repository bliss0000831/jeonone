// 한국 행정구역 데이터 (시/도 → 시/군/구 → 동/읍/면)
// 실제 서비스에서는 API로 가져오는 것이 좋습니다

export interface Region {
  name: string
  subRegions?: Region[]
}

export const koreaRegions: Region[] = [
  {
    name: "서울특별시",
    subRegions: [
      {
        name: "강남구",
        subRegions: [
          { name: "역삼동" }, { name: "개포동" }, { name: "청담동" }, { name: "삼성동" },
          { name: "대치동" }, { name: "신사동" }, { name: "논현동" }, { name: "압구정동" },
          { name: "세곡동" }, { name: "자곡동" }, { name: "율현동" }, { name: "일원동" },
          { name: "수서동" }, { name: "도곡동" }
        ]
      },
      {
        name: "강동구",
        subRegions: [
          { name: "강일동" }, { name: "상일동" }, { name: "명일동" }, { name: "고덕동" },
          { name: "암사동" }, { name: "천호동" }, { name: "성내동" }, { name: "길동" },
          { name: "둔촌동" }
        ]
      },
      {
        name: "강북구",
        subRegions: [
          { name: "미아동" }, { name: "번동" }, { name: "수유동" }, { name: "우이동" }
        ]
      },
      {
        name: "강서구",
        subRegions: [
          { name: "염창동" }, { name: "등촌동" }, { name: "화곡동" }, { name: "가양동" },
          { name: "마곡동" }, { name: "내발산동" }, { name: "외발산동" }, { name: "공항동" },
          { name: "방화동" }
        ]
      },
      {
        name: "관악구",
        subRegions: [
          { name: "봉천동" }, { name: "신림동" }, { name: "남현동" }
        ]
      },
      {
        name: "광진구",
        subRegions: [
          { name: "중곡동" }, { name: "능동" }, { name: "구의동" }, { name: "광장동" },
          { name: "자양동" }, { name: "화양동" }, { name: "군자동" }
        ]
      },
      {
        name: "구로구",
        subRegions: [
          { name: "신도림동" }, { name: "구로동" }, { name: "가리봉동" }, { name: "고척동" },
          { name: "개봉동" }, { name: "오류동" }, { name: "궁동" }, { name: "온수동" },
          { name: "천왕동" }, { name: "항동" }
        ]
      },
      {
        name: "금천구",
        subRegions: [
          { name: "가산동" }, { name: "독산동" }, { name: "시흥동" }
        ]
      },
      {
        name: "노원구",
        subRegions: [
          { name: "월계동" }, { name: "공릉동" }, { name: "하계동" }, { name: "중계동" },
          { name: "상계동" }
        ]
      },
      {
        name: "도봉구",
        subRegions: [
          { name: "쌍문동" }, { name: "방학동" }, { name: "창동" }, { name: "도봉동" }
        ]
      },
      {
        name: "동대문구",
        subRegions: [
          { name: "신설동" }, { name: "용두동" }, { name: "제기동" }, { name: "전농동" },
          { name: "답십리동" }, { name: "장안동" }, { name: "청량리동" }, { name: "회기동" },
          { name: "휘경동" }, { name: "이문동" }
        ]
      },
      {
        name: "동작구",
        subRegions: [
          { name: "노량진동" }, { name: "상도동" }, { name: "흑석동" }, { name: "동작동" },
          { name: "사당동" }, { name: "대방동" }, { name: "신대방동" }
        ]
      },
      {
        name: "마포구",
        subRegions: [
          { name: "아현동" }, { name: "공덕동" }, { name: "신공덕동" }, { name: "도화동" },
          { name: "용강동" }, { name: "대흥동" }, { name: "염리동" }, { name: "신수동" },
          { name: "서강동" }, { name: "서교동" }, { name: "합정동" }, { name: "망원동" },
          { name: "연남동" }, { name: "성산동" }, { name: "상암동" }
        ]
      },
      {
        name: "서대문구",
        subRegions: [
          { name: "충정로동" }, { name: "북아현동" }, { name: "신촌동" }, { name: "연희동" },
          { name: "홍제동" }, { name: "홍은동" }, { name: "남가좌동" }, { name: "북가좌동" }
        ]
      },
      {
        name: "서초구",
        subRegions: [
          { name: "서초동" }, { name: "잠원동" }, { name: "반포동" }, { name: "방배동" },
          { name: "양재동" }, { name: "내곡동" }
        ]
      },
      {
        name: "성동구",
        subRegions: [
          { name: "상왕십리동" }, { name: "하왕십리동" }, { name: "홍익동" }, { name: "도선동" },
          { name: "마장동" }, { name: "사근동" }, { name: "행당동" }, { name: "응봉동" },
          { name: "금호동" }, { name: "옥수동" }, { name: "성수동" }, { name: "송정동" }
        ]
      },
      {
        name: "성북구",
        subRegions: [
          { name: "성북동" }, { name: "삼선동" }, { name: "동선동" }, { name: "돈암동" },
          { name: "안암동" }, { name: "보문동" }, { name: "정릉동" }, { name: "길음동" },
          { name: "종암동" }, { name: "월곡동" }, { name: "장위동" }, { name: "석관동" }
        ]
      },
      {
        name: "송파구",
        subRegions: [
          { name: "잠실동" }, { name: "신천동" }, { name: "풍납동" }, { name: "송파동" },
          { name: "석촌동" }, { name: "삼전동" }, { name: "가락동" }, { name: "문정동" },
          { name: "장지동" }, { name: "위례동" }, { name: "거여동" }, { name: "마천동" },
          { name: "오금동" }, { name: "방이동" }
        ]
      },
      {
        name: "양천구",
        subRegions: [
          { name: "목동" }, { name: "신월동" }, { name: "신정동" }
        ]
      },
      {
        name: "영등포구",
        subRegions: [
          { name: "영등포동" }, { name: "여의도동" }, { name: "당산동" }, { name: "문래동" },
          { name: "양평동" }, { name: "신길동" }, { name: "대림동" }, { name: "도림동" }
        ]
      },
      {
        name: "용산구",
        subRegions: [
          { name: "후암동" }, { name: "용산동" }, { name: "남영동" }, { name: "청파동" },
          { name: "원효로동" }, { name: "효창동" }, { name: "용문동" }, { name: "한강로동" },
          { name: "이촌동" }, { name: "이태원동" }, { name: "한남동" }, { name: "서빙고동" },
          { name: "보광동" }
        ]
      },
      {
        name: "은평구",
        subRegions: [
          { name: "녹번동" }, { name: "불광동" }, { name: "갈현동" }, { name: "구산동" },
          { name: "대조동" }, { name: "응암동" }, { name: "역촌동" }, { name: "신사동" },
          { name: "증산동" }, { name: "수색동" }, { name: "진관동" }
        ]
      },
      {
        name: "종로구",
        subRegions: [
          { name: "청운동" }, { name: "신교동" }, { name: "궁정동" }, { name: "효자동" },
          { name: "창성동" }, { name: "통의동" }, { name: "적선동" }, { name: "통인동" },
          { name: "누상동" }, { name: "누하동" }, { name: "옥인동" }, { name: "체부동" },
          { name: "필운동" }, { name: "내자동" }, { name: "사직동" }, { name: "도렴동" },
          { name: "당주동" }, { name: "내수동" }, { name: "세종로" }, { name: "신문로동" },
          { name: "청진동" }, { name: "서린동" }, { name: "수송동" }, { name: "중학동" },
          { name: "종로동" }, { name: "공평동" }, { name: "관훈동" }, { name: "견지동" },
          { name: "와룡동" }, { name: "권농동" }, { name: "운니동" }, { name: "익선동" },
          { name: "경운동" }, { name: "관철동" }, { name: "인사동" }, { name: "낙원동" },
          { name: "종로5가" }, { name: "종로6가" }, { name: "이화동" }, { name: "연건동" },
          { name: "충신동" }, { name: "동숭동" }, { name: "혜화동" }, { name: "명륜동" },
          { name: "창신동" }, { name: "숭인동" }, { name: "교남동" }, { name: "평동" },
          { name: "송월동" }, { name: "홍파동" }, { name: "교북동" }, { name: "행촌동" },
          { name: "구기동" }, { name: "평창동" }, { name: "부암동" }, { name: "홍지동" },
          { name: "신영동" }, { name: "무악동" }
        ]
      },
      {
        name: "중구",
        subRegions: [
          { name: "무교동" }, { name: "다동" }, { name: "태평로동" }, { name: "을지로동" },
          { name: "남대문로동" }, { name: "북창동" }, { name: "삼각동" }, { name: "수하동" },
          { name: "장교동" }, { name: "수표동" }, { name: "소공동" }, { name: "회현동" },
          { name: "명동" }, { name: "필동" }, { name: "장충동" }, { name: "광희동" },
          { name: "을지로3가" }, { name: "을지로4가" }, { name: "을지로5가" }, { name: "주자동" },
          { name: "충무로동" }, { name: "묵정동" }, { name: "신당동" }, { name: "흥인동" },
          { name: "황학동" }, { name: "중림동" }
        ]
      },
      {
        name: "중랑구",
        subRegions: [
          { name: "면목동" }, { name: "상봉동" }, { name: "중화동" }, { name: "묵동" },
          { name: "망우동" }, { name: "신내동" }
        ]
      }
    ]
  },
  {
    name: "경기도",
    subRegions: [
      {
        name: "수원시",
        subRegions: [
          { name: "장안구" }, { name: "권선구" }, { name: "팔달구" }, { name: "영통구" }
        ]
      },
      {
        name: "성남시",
        subRegions: [
          { name: "수정구" }, { name: "중원구" }, { name: "분당구" }
        ]
      },
      {
        name: "고양시",
        subRegions: [
          { name: "덕양구" }, { name: "일산동구" }, { name: "일산서구" }
        ]
      },
      {
        name: "용인시",
        subRegions: [
          { name: "처인구" }, { name: "기흥구" }, { name: "수지구" }
        ]
      },
      {
        name: "부천시",
        subRegions: [
          { name: "원미동" }, { name: "심곡동" }, { name: "중동" }, { name: "상동" },
          { name: "소사동" }, { name: "역곡동" }, { name: "오정동" }
        ]
      },
      {
        name: "안산시",
        subRegions: [
          { name: "상록구" }, { name: "단원구" }
        ]
      },
      {
        name: "화성시",
        subRegions: [
          { name: "동탄동" }, { name: "병점동" }, { name: "진안동" }, { name: "반월동" }
        ]
      },
      {
        name: "평택시",
        subRegions: [
          { name: "평택동" }, { name: "서정동" }, { name: "송탄동" }, { name: "안중읍" }
        ]
      },
      { name: "의정부시", subRegions: [{ name: "의정부동" }, { name: "호원동" }, { name: "장암동" }] },
      { name: "시흥시", subRegions: [{ name: "대야동" }, { name: "신천동" }, { name: "정왕동" }] },
      { name: "파주시", subRegions: [{ name: "금촌동" }, { name: "문산읍" }, { name: "운정동" }] },
      { name: "김포시", subRegions: [{ name: "사우동" }, { name: "장기동" }, { name: "구래동" }] },
      { name: "광명시", subRegions: [{ name: "광명동" }, { name: "철산동" }, { name: "하안동" }] },
      { name: "군포시", subRegions: [{ name: "산본동" }, { name: "금정동" }, { name: "당동" }] },
      { name: "하남시", subRegions: [{ name: "미사동" }, { name: "덕풍동" }, { name: "신장동" }] },
      { name: "오산시", subRegions: [{ name: "오산동" }, { name: "세마동" }] },
      { name: "이천시", subRegions: [{ name: "중리동" }, { name: "증포동" }] },
      { name: "안성시", subRegions: [{ name: "안성동" }, { name: "공도읍" }] },
      { name: "남양주시", subRegions: [{ name: "호평동" }, { name: "평내동" }, { name: "다산동" }] },
      { name: "의왕시", subRegions: [{ name: "내손동" }, { name: "오전동" }] },
      { name: "양평군", subRegions: [{ name: "양평읍" }, { name: "강하면" }] },
      { name: "여주시", subRegions: [{ name: "여주읍" }, { name: "흥천면" }] },
      { name: "과천시", subRegions: [{ name: "중앙동" }, { name: "별양동" }] },
      { name: "양주시", subRegions: [{ name: "양주동" }, { name: "덕계동" }] },
      { name: "포천시", subRegions: [{ name: "포천동" }, { name: "소흘읍" }] },
      { name: "동두천시", subRegions: [{ name: "생연동" }, { name: "보산동" }] },
      { name: "가평군", subRegions: [{ name: "가평읍" }, { name: "청평면" }] },
      { name: "연천군", subRegions: [{ name: "연천읍" }, { name: "전곡읍" }] }
    ]
  },
  {
    name: "인천광역시",
    subRegions: [
      { name: "중구", subRegions: [{ name: "관동" }, { name: "신포동" }, { name: "연안동" }] },
      { name: "동구", subRegions: [{ name: "송현동" }, { name: "화수동" }] },
      { name: "미추홀구", subRegions: [{ name: "주안동" }, { name: "숭의동" }, { name: "용현동" }] },
      { name: "연수구", subRegions: [{ name: "송도동" }, { name: "연수동" }, { name: "청학동" }] },
      { name: "남동구", subRegions: [{ name: "구월동" }, { name: "간석동" }, { name: "만수동" }] },
      { name: "부평구", subRegions: [{ name: "부평동" }, { name: "삼산동" }, { name: "갈산동" }] },
      { name: "계양구", subRegions: [{ name: "계산동" }, { name: "작전동" }, { name: "효성동" }] },
      { name: "서구", subRegions: [{ name: "검암동" }, { name: "청라동" }, { name: "경서동" }] },
      { name: "강화군", subRegions: [{ name: "강화읍" }, { name: "선원면" }] },
      { name: "옹진군", subRegions: [{ name: "영흥면" }, { name: "북도면" }] }
    ]
  },
  {
    name: "강원특별자치도",
    subRegions: [
      {
        name: "춘천시",
        subRegions: [
          { name: "교동" }, { name: "조운동" }, { name: "약사명동" }, { name: "근화동" },
          { name: "소양동" }, { name: "후평1동" }, { name: "후평2동" }, { name: "후평3동" },
          { name: "석사동" }, { name: "퇴계동" }, { name: "효자1동" }, { name: "효자2동" },
          { name: "효자3동" }, { name: "강남동" }, { name: "신사우동" }, { name: "온의동" },
          { name: "신북읍" }, { name: "동면" }, { name: "동산면" }, { name: "신동면" },
          { name: "동내면" }, { name: "남면" }, { name: "남산면" }, { name: "서면" },
          { name: "사북면" }, { name: "북산면" }
        ]
      },
      {
        name: "원주시",
        subRegions: [
          { name: "중앙동" }, { name: "원인동" }, { name: "개운동" }, { name: "명륜동" },
          { name: "단구동" }, { name: "일산동" }, { name: "학성동" }, { name: "단계동" },
          { name: "우산동" }, { name: "태장동" }, { name: "봉산동" }, { name: "행구동" },
          { name: "무실동" }, { name: "반곡동" }, { name: "관설동" }, { name: "문막읍" },
          { name: "소초면" }, { name: "호저면" }, { name: "지정면" }, { name: "부론면" },
          { name: "귀래면" }, { name: "흥업면" }, { name: "판부면" }, { name: "신림면" }
        ]
      },
      {
        name: "강릉시",
        subRegions: [
          { name: "홍제동" }, { name: "중앙동" }, { name: "옥천동" }, { name: "교동" },
          { name: "포남동" }, { name: "초당동" }, { name: "송정동" }, { name: "내곡동" },
          { name: "강동면" }, { name: "옥계면" }, { name: "주문진읍" }, { name: "연곡면" },
          { name: "사천면" }, { name: "성산면" }, { name: "구정면" }, { name: "왕산면" }
        ]
      },
      { name: "동해시", subRegions: [{ name: "천곡동" }, { name: "북삼동" }, { name: "발한동" }] },
      { name: "태백시", subRegions: [{ name: "황지동" }, { name: "장성동" }, { name: "문곡동" }] },
      { name: "속초시", subRegions: [{ name: "중앙동" }, { name: "교동" }, { name: "청호동" }] },
      { name: "삼척시", subRegions: [{ name: "교동" }, { name: "성내동" }, { name: "정라동" }] },
      { name: "홍천군", subRegions: [{ name: "홍천읍" }, { name: "화촌면" }, { name: "두촌면" }] },
      { name: "횡성군", subRegions: [{ name: "횡성읍" }, { name: "우천면" }, { name: "안흥면" }] },
      { name: "영월군", subRegions: [{ name: "영월읍" }, { name: "상동읍" }, { name: "중동면" }] },
      { name: "평창군", subRegions: [{ name: "평창읍" }, { name: "미탄면" }, { name: "대화면" }] },
      { name: "정선군", subRegions: [{ name: "정선읍" }, { name: "고한읍" }, { name: "사북읍" }] },
      { name: "철원군", subRegions: [{ name: "갈말읍" }, { name: "동송읍" }, { name: "김화읍" }] },
      { name: "화천군", subRegions: [{ name: "화천읍" }, { name: "간동면" }, { name: "하남면" }] },
      { name: "양구군", subRegions: [{ name: "양구읍" }, { name: "남면" }, { name: "방산면" }] },
      { name: "인제군", subRegions: [{ name: "인제읍" }, { name: "남면" }, { name: "북면" }] },
      { name: "고성군", subRegions: [{ name: "간성읍" }, { name: "거진읍" }, { name: "토성면" }] },
      { name: "양양군", subRegions: [{ name: "양양읍" }, { name: "서면" }, { name: "손양면" }] }
    ]
  },
  {
    name: "부산광역시",
    subRegions: [
      { name: "중구", subRegions: [{ name: "중앙동" }, { name: "동광동" }, { name: "대청동" }] },
      { name: "서구", subRegions: [{ name: "동대신동" }, { name: "서대신동" }, { name: "부민동" }] },
      { name: "동구", subRegions: [{ name: "초량동" }, { name: "수정동" }, { name: "좌천동" }] },
      { name: "영도구", subRegions: [{ name: "남항동" }, { name: "영선동" }, { name: "청학동" }] },
      { name: "부산진구", subRegions: [{ name: "부전동" }, { name: "전포동" }, { name: "범천동" }] },
      { name: "동래구", subRegions: [{ name: "수민동" }, { name: "복천동" }, { name: "명장동" }] },
      { name: "남구", subRegions: [{ name: "대연동" }, { name: "용호동" }, { name: "문현동" }] },
      { name: "북구", subRegions: [{ name: "구포동" }, { name: "금곡동" }, { name: "화명동" }] },
      { name: "해운대구", subRegions: [{ name: "우동" }, { name: "중동" }, { name: "좌동" }, { name: "송정동" }] },
      { name: "사하구", subRegions: [{ name: "당리동" }, { name: "하단동" }, { name: "괴정동" }] },
      { name: "금정구", subRegions: [{ name: "부곡동" }, { name: "장전동" }, { name: "남산동" }] },
      { name: "강서구", subRegions: [{ name: "대저동" }, { name: "명지동" }, { name: "지사동" }] },
      { name: "연제구", subRegions: [{ name: "연산동" }, { name: "거제동" }] },
      { name: "수영구", subRegions: [{ name: "광안동" }, { name: "수영동" }, { name: "민락동" }] },
      { name: "사상구", subRegions: [{ name: "삼락동" }, { name: "모라동" }, { name: "괘법동" }] },
      { name: "기장군", subRegions: [{ name: "기장읍" }, { name: "장안읍" }, { name: "정관읍" }] }
    ]
  },
  {
    name: "대구광역시",
    subRegions: [
      { name: "중구", subRegions: [{ name: "동인동" }, { name: "삼덕동" }, { name: "성내동" }] },
      { name: "동구", subRegions: [{ name: "신암동" }, { name: "동촌동" }, { name: "효목동" }] },
      { name: "서구", subRegions: [{ name: "내당동" }, { name: "비산동" }, { name: "평리동" }] },
      { name: "남구", subRegions: [{ name: "봉덕동" }, { name: "대명동" }] },
      { name: "북구", subRegions: [{ name: "산격동" }, { name: "복현동" }, { name: "침산동" }] },
      { name: "수성구", subRegions: [{ name: "범어동" }, { name: "수성동" }, { name: "지산동" }] },
      { name: "달서구", subRegions: [{ name: "상인동" }, { name: "월성동" }, { name: "용산동" }] },
      { name: "달성군", subRegions: [{ name: "화원읍" }, { name: "논공읍" }, { name: "다사읍" }] }
    ]
  },
  {
    name: "광주광역시",
    subRegions: [
      { name: "동구", subRegions: [{ name: "충장동" }, { name: "산수동" }, { name: "지산동" }] },
      { name: "서구", subRegions: [{ name: "양동" }, { name: "농성동" }, { name: "화정동" }] },
      { name: "남구", subRegions: [{ name: "봉선동" }, { name: "주월동" }, { name: "월산동" }] },
      { name: "북구", subRegions: [{ name: "문흥동" }, { name: "두암동" }, { name: "오치동" }] },
      { name: "광산구", subRegions: [{ name: "송정동" }, { name: "수완동" }, { name: "첨단동" }] }
    ]
  },
  {
    name: "대전광역시",
    subRegions: [
      { name: "동구", subRegions: [{ name: "용전동" }, { name: "가양동" }, { name: "삼성동" }] },
      { name: "중구", subRegions: [{ name: "대흥동" }, { name: "선화동" }, { name: "문화동" }] },
      { name: "서구", subRegions: [{ name: "둔산동" }, { name: "월평동" }, { name: "갈마동" }] },
      { name: "유성구", subRegions: [{ name: "봉명동" }, { name: "노은동" }, { name: "지족동" }] },
      { name: "대덕구", subRegions: [{ name: "신탄진동" }, { name: "법동" }, { name: "송촌동" }] }
    ]
  },
  {
    name: "울산광역시",
    subRegions: [
      { name: "중구", subRegions: [{ name: "성남동" }, { name: "복산동" }, { name: "학성동" }] },
      { name: "남구", subRegions: [{ name: "삼산동" }, { name: "달동" }, { name: "무거동" }] },
      { name: "동구", subRegions: [{ name: "화정동" }, { name: "전하동" }, { name: "서부동" }] },
      { name: "북구", subRegions: [{ name: "송정동" }, { name: "양정동" }, { name: "호계동" }] },
      { name: "울주군", subRegions: [{ name: "온산읍" }, { name: "언양읍" }, { name: "범서읍" }] }
    ]
  },
  {
    name: "세종특별자치시",
    subRegions: [
      { name: "조치원읍", subRegions: [{ name: "조치원동" }] },
      { name: "연서면" }, { name: "연동면" }, { name: "부강면" },
      { name: "금남면" }, { name: "장군면" }, { name: "전의면" }, { name: "전동면" },
      { name: "도담동" }, { name: "아름동" }, { name: "종촌동" }, { name: "고운동" },
      { name: "새롬동" }, { name: "다정동" }, { name: "한솔동" }, { name: "나성동" },
      { name: "보람동" }, { name: "대평동" }, { name: "소담동" }
    ]
  },
  {
    name: "충청북도",
    subRegions: [
      { name: "청주시", subRegions: [{ name: "상당구" }, { name: "서원구" }, { name: "흥덕구" }, { name: "청원구" }] },
      { name: "충주시", subRegions: [{ name: "교현동" }, { name: "성내동" }, { name: "연수동" }] },
      { name: "제천시", subRegions: [{ name: "의림동" }, { name: "화산동" }, { name: "청전동" }] },
      { name: "보은군", subRegions: [{ name: "보은읍" }] },
      { name: "옥천군", subRegions: [{ name: "옥천읍" }] },
      { name: "영동군", subRegions: [{ name: "영동읍" }] },
      { name: "증평군", subRegions: [{ name: "증평읍" }] },
      { name: "진천군", subRegions: [{ name: "진천읍" }] },
      { name: "괴산군", subRegions: [{ name: "괴산읍" }] },
      { name: "음성군", subRegions: [{ name: "음성읍" }] },
      { name: "단양군", subRegions: [{ name: "단양읍" }] }
    ]
  },
  {
    name: "충청남도",
    subRegions: [
      { name: "천안시", subRegions: [{ name: "동남구" }, { name: "서북구" }] },
      { name: "공주시", subRegions: [{ name: "중학동" }, { name: "웅진동" }] },
      { name: "보령시", subRegions: [{ name: "대천동" }, { name: "명천동" }] },
      { name: "아산시", subRegions: [{ name: "온천동" }, { name: "배방읍" }, { name: "탕정면" }] },
      { name: "서산시", subRegions: [{ name: "동문동" }, { name: "읍내동" }] },
      { name: "논산시", subRegions: [{ name: "취암동" }, { name: "반월동" }] },
      { name: "계룡시", subRegions: [{ name: "금암동" }, { name: "엄사면" }] },
      { name: "당진시", subRegions: [{ name: "당진동" }, { name: "읍내동" }] },
      { name: "금산군", subRegions: [{ name: "금산읍" }] },
      { name: "부여군", subRegions: [{ name: "부여읍" }] },
      { name: "서천군", subRegions: [{ name: "서천읍" }] },
      { name: "청양군", subRegions: [{ name: "청양읍" }] },
      { name: "홍성군", subRegions: [{ name: "홍성읍" }] },
      { name: "예산군", subRegions: [{ name: "예산읍" }] },
      { name: "태안군", subRegions: [{ name: "태안읍" }] }
    ]
  },
  {
    name: "전북특별자치도",
    subRegions: [
      { name: "전주시", subRegions: [{ name: "완산구" }, { name: "덕진구" }] },
      { name: "군산시", subRegions: [{ name: "중앙동" }, { name: "나운동" }, { name: "수송동" }] },
      { name: "익산시", subRegions: [{ name: "영등동" }, { name: "어양동" }, { name: "모현동" }] },
      { name: "정읍시", subRegions: [{ name: "수성동" }, { name: "시기동" }] },
      { name: "남원시", subRegions: [{ name: "동충동" }, { name: "향교동" }] },
      { name: "김제시", subRegions: [{ name: "요촌동" }, { name: "신풍동" }] },
      { name: "완주군", subRegions: [{ name: "삼례읍" }, { name: "봉동읍" }] },
      { name: "진안군", subRegions: [{ name: "진안읍" }] },
      { name: "무주군", subRegions: [{ name: "무주읍" }] },
      { name: "장수군", subRegions: [{ name: "장수읍" }] },
      { name: "임실군", subRegions: [{ name: "임실읍" }] },
      { name: "순창군", subRegions: [{ name: "순창읍" }] },
      { name: "고창군", subRegions: [{ name: "고창읍" }] },
      { name: "부안군", subRegions: [{ name: "부안읍" }] }
    ]
  },
  {
    name: "전라남도",
    subRegions: [
      { name: "목포시", subRegions: [{ name: "산정동" }, { name: "용당동" }, { name: "상동" }] },
      { name: "여수시", subRegions: [{ name: "동문동" }, { name: "학동" }, { name: "문수동" }] },
      { name: "순천시", subRegions: [{ name: "중앙동" }, { name: "향동" }, { name: "조례동" }] },
      { name: "나주시", subRegions: [{ name: "성북동" }, { name: "금천동" }] },
      { name: "광양시", subRegions: [{ name: "광양읍" }, { name: "중마동" }] },
      { name: "담양군", subRegions: [{ name: "담양읍" }] },
      { name: "곡성군", subRegions: [{ name: "곡성읍" }] },
      { name: "구례군", subRegions: [{ name: "구례읍" }] },
      { name: "고흥군", subRegions: [{ name: "고흥읍" }] },
      { name: "보성군", subRegions: [{ name: "보성읍" }] },
      { name: "화순군", subRegions: [{ name: "화순읍" }] },
      { name: "장흥군", subRegions: [{ name: "장흥읍" }] },
      { name: "강진군", subRegions: [{ name: "강진읍" }] },
      { name: "해남군", subRegions: [{ name: "해남읍" }] },
      { name: "영암군", subRegions: [{ name: "영암읍" }] },
      { name: "무안군", subRegions: [{ name: "무안읍" }] },
      { name: "함평군", subRegions: [{ name: "함평읍" }] },
      { name: "영광군", subRegions: [{ name: "영광읍" }] },
      { name: "장성군", subRegions: [{ name: "장성읍" }] },
      { name: "완도군", subRegions: [{ name: "완도읍" }] },
      { name: "진도군", subRegions: [{ name: "진도읍" }] },
      { name: "신안군", subRegions: [{ name: "압해읍" }] }
    ]
  },
  {
    name: "경상북도",
    subRegions: [
      { name: "포항시", subRegions: [{ name: "남구" }, { name: "북구" }] },
      { name: "경주시", subRegions: [{ name: "동천동" }, { name: "황성동" }, { name: "용강동" }] },
      { name: "김천시", subRegions: [{ name: "평화동" }, { name: "자산동" }] },
      { name: "안동시", subRegions: [{ name: "명륜동" }, { name: "옥동" }] },
      { name: "구미시", subRegions: [{ name: "원평동" }, { name: "송정동" }, { name: "인동동" }] },
      { name: "영주시", subRegions: [{ name: "영주동" }, { name: "휴천동" }] },
      { name: "영천시", subRegions: [{ name: "완산동" }, { name: "조교동" }] },
      { name: "상주시", subRegions: [{ name: "성동동" }, { name: "남성동" }] },
      { name: "문경시", subRegions: [{ name: "점촌동" }, { name: "모전동" }] },
      { name: "경산시", subRegions: [{ name: "중방동" }, { name: "옥산동" }, { name: "하양읍" }] },
      { name: "군위군", subRegions: [{ name: "군위읍" }] },
      { name: "의성군", subRegions: [{ name: "의성읍" }] },
      { name: "청송군", subRegions: [{ name: "청송읍" }] },
      { name: "영양군", subRegions: [{ name: "영양읍" }] },
      { name: "영덕군", subRegions: [{ name: "영덕읍" }] },
      { name: "청도군", subRegions: [{ name: "화양읍" }] },
      { name: "고령군", subRegions: [{ name: "대가야읍" }] },
      { name: "성주군", subRegions: [{ name: "성주읍" }] },
      { name: "칠곡군", subRegions: [{ name: "왜관읍" }] },
      { name: "예천군", subRegions: [{ name: "예천읍" }] },
      { name: "봉화군", subRegions: [{ name: "봉화읍" }] },
      { name: "울진군", subRegions: [{ name: "울진읍" }] },
      { name: "울릉군", subRegions: [{ name: "울릉읍" }] }
    ]
  },
  {
    name: "경상남도",
    subRegions: [
      { name: "창원시", subRegions: [{ name: "의창구" }, { name: "성산구" }, { name: "마산합포구" }, { name: "마산회원구" }, { name: "진해구" }] },
      { name: "진주시", subRegions: [{ name: "성북동" }, { name: "강남동" }, { name: "칠암동" }] },
      { name: "통영시", subRegions: [{ name: "도천동" }, { name: "무전동" }] },
      { name: "사천시", subRegions: [{ name: "선구동" }, { name: "동금동" }] },
      { name: "김해시", subRegions: [{ name: "내동" }, { name: "삼계동" }, { name: "장유동" }] },
      { name: "밀양시", subRegions: [{ name: "내일동" }, { name: "삼문동" }] },
      { name: "거제시", subRegions: [{ name: "고현동" }, { name: "장승포동" }] },
      { name: "양산시", subRegions: [{ name: "남부동" }, { name: "물금읍" }] },
      { name: "의령군", subRegions: [{ name: "의령읍" }] },
      { name: "함안군", subRegions: [{ name: "가야읍" }] },
      { name: "창녕군", subRegions: [{ name: "창녕읍" }] },
      { name: "고성군", subRegions: [{ name: "고성읍" }] },
      { name: "남해군", subRegions: [{ name: "남해읍" }] },
      { name: "하동군", subRegions: [{ name: "하동읍" }] },
      { name: "산청군", subRegions: [{ name: "산청읍" }] },
      { name: "함양군", subRegions: [{ name: "함양읍" }] },
      { name: "거창군", subRegions: [{ name: "거창읍" }] },
      { name: "합천군", subRegions: [{ name: "합천읍" }] }
    ]
  },
  {
    name: "제주특별자치도",
    subRegions: [
      {
        name: "제주시",
        subRegions: [
          { name: "일도동" }, { name: "이도동" }, { name: "삼도동" }, { name: "용담동" },
          { name: "건입동" }, { name: "화북동" }, { name: "삼양동" }, { name: "봉개동" },
          { name: "아라동" }, { name: "오라동" }, { name: "연동" }, { name: "노형동" },
          { name: "외도동" }, { name: "이호동" }, { name: "도두동" }, { name: "한림읍" },
          { name: "애월읍" }, { name: "구좌읍" }, { name: "조천읍" }, { name: "한경면" },
          { name: "추자면" }, { name: "우도면" }
        ]
      },
      {
        name: "서귀포시",
        subRegions: [
          { name: "송산동" }, { name: "정방동" }, { name: "중앙동" }, { name: "천지동" },
          { name: "효돈동" }, { name: "영천동" }, { name: "동홍동" }, { name: "서홍동" },
          { name: "대륜동" }, { name: "대천동" }, { name: "중문동" }, { name: "예래동" },
          { name: "대정읍" }, { name: "남원읍" }, { name: "성산읍" }, { name: "안덕면" },
          { name: "표선면" }
        ]
      }
    ]
  }
]

// 위치를 문자열로 변환 (예: "강원특별자치도 춘천시 후평2동")
export function formatLocation(sido?: string, sigungu?: string, dong?: string): string {
  if (!sido) return ""
  if (!sigungu) return sido
  if (!dong) return `${sido} ${sigungu}`
  return `${sido} ${sigungu} ${dong}`
}

// 짧은 형태로 변환 (예: "춘천시 후평2동")
export function formatShortLocation(sido?: string, sigungu?: string, dong?: string): string {
  if (!sido) return "위치 설정"
  if (!sigungu) return sido.replace(/특별시|광역시|특별자치시|특별자치도|도/g, "")
  const shortSido = sido.replace(/특별시|광역시|특별자치시|특별자치도|도/g, "")
  if (!dong) return `${shortSido} ${sigungu}`
  return `${sigungu} ${dong}`
}
