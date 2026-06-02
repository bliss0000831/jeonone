/**
 * 중고거래 카테고리. 페이지 파일에서 import 하면 빌드 의존도 망가지므로
 * 상수는 lib 으로 분리.
 */
export const SECONDHAND_CATEGORIES = [
  "디지털기기",
  "생활가전",
  "가구/인테리어",
  "유아동",
  "의류",
  "잡화",
  "뷰티/미용",
  "스포츠/레저",
  "취미/게임",
  "반려동물",
  "도서",
  "티켓/교환권",
  "가공식품",
  "건강/의료",
  "생활용품",
  "기타",
] as const

export type SecondhandCategory = (typeof SECONDHAND_CATEGORIES)[number]
