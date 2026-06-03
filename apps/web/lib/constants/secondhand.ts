/**
 * 중고거래 카테고리. 페이지 파일에서 import 하면 빌드 의존도 망가지므로
 * 상수는 lib 으로 분리.
 */
// 전원일기 — 농기구/자재 카테고리
export const SECONDHAND_CATEGORIES = [
  "트랙터",
  "경운기",
  "이양기",
  "수확기",
  "관리기",
  "방제기/드론",
  "운반기",
  "하우스자재",
  "부품/소모품",
  "농자재",
  "기타",
] as const

export type SecondhandCategory = (typeof SECONDHAND_CATEGORIES)[number]
