/**
 * /mypage 하위 라우트 공통 레이아웃.
 * 각 화면이 자체 ScreenHeader 를 렌더링하므로 Stack 기본 헤더는 끔.
 */

import { Stack } from "expo-router"

export default function MyPageLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
