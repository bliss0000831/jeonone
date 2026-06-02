/**
 * 모바일 등록/수정 폼 — 뒤로가기 시 미저장 변경사항 경고.
 *
 * Expo Router 의 @react-navigation `beforeRemove` 이벤트 +
 * Android 하드웨어 BackHandler 를 함께 처리.
 *
 * 사용:
 *   const [dirty, setDirty] = useState(false)
 *   useUnsavedChangesGuard(dirty)
 *   // 폼 입력 시 setDirty(true), 제출 성공 시 setDirty(false)
 */

import { useEffect } from "react"
import { Alert, BackHandler, Platform } from "react-native"
import { useNavigation } from "expo-router"

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation()

  // React Navigation beforeRemove — iOS 스와이프 + 소프트 뒤로가기
  useEffect(() => {
    if (!isDirty) return

    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault()

      Alert.alert(
        "작성 중인 내용이 있습니다",
        "페이지를 나가면 입력한 내용이 사라집니다.\n정말 나가시겠습니까?",
        [
          { text: "계속 작성", style: "cancel" },
          {
            text: "나가기",
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      )
    })

    return unsubscribe
  }, [isDirty, navigation])

  // Android 하드웨어 Back 버튼 — beforeRemove 와 별도로 처리 필요
  useEffect(() => {
    if (Platform.OS !== "android" || !isDirty) return

    const handler = () => {
      Alert.alert(
        "작성 중인 내용이 있습니다",
        "페이지를 나가면 입력한 내용이 사라집니다.\n정말 나가시겠습니까?",
        [
          { text: "계속 작성", style: "cancel" },
          {
            text: "나가기",
            style: "destructive",
            onPress: () => navigation.goBack(),
          },
        ],
      )
      return true // 기본 동작 차단
    }

    const sub = BackHandler.addEventListener("hardwareBackPress", handler)
    return () => sub.remove()
  }, [isDirty, navigation])
}
