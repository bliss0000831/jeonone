/**
 * 채팅 사용자 환경설정 (mute / block / 전체 알림 off) — AsyncStorage 영속화.
 *
 * 핵심 로직은 @gwangjang/features/chat 의 createChatPrefs.
 * 이 파일은 AsyncStorage 어댑터를 주입하는 thin wrapper.
 */

import AsyncStorage from "@react-native-async-storage/async-storage"
import { createChatPrefs } from "@gwangjang/features/chat"

// SSR (Expo web static export) 환경에서는 window 가 없어 AsyncStorage(web) 가 터짐.
const isClient =
  typeof window !== "undefined" || typeof document !== "undefined"

const noopStorage = {
  getItem: (_key: string) => null as string | null,
  setItem: (_key: string, _value: string) => {},
}

export const chatPrefs = createChatPrefs(
  isClient ? AsyncStorage : noopStorage,
)
