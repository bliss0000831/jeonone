/**
 * 크로스플랫폼 Alert — react-native 의 Alert.alert 는 Expo 웹에서 화면에 안 뜬다.
 * 웹에서는 window.alert / window.confirm 으로 폴백해 검증·에러 메시지가 보이게 한다.
 *
 * 사용: `import { Alert } from "@/lib/alert"` 로 react-native 의 Alert 를 대체.
 * 네이티브에서는 기존 RN Alert 그대로.
 */
import { Alert as RNAlert, Platform, type AlertButton } from "react-native"

function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title
  if (typeof window === "undefined") return

  // 버튼 0~1개 → 단순 알림
  if (!buttons || buttons.length <= 1) {
    window.alert(text)
    buttons?.[0]?.onPress?.()
    return
  }

  // 버튼 2개 이상 → confirm (확인/취소). 확인 = 마지막 비-cancel 버튼.
  const cancelBtn = buttons.find((b) => b.style === "cancel")
  const confirmBtn = [...buttons].reverse().find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1]
  const ok = window.confirm(text)
  if (ok) confirmBtn?.onPress?.()
  else cancelBtn?.onPress?.()
}

export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: Parameters<typeof RNAlert.alert>[3],
  ) {
    if (Platform.OS === "web") return webAlert(title, message, buttons)
    return RNAlert.alert(title, message, buttons, options)
  },
}
