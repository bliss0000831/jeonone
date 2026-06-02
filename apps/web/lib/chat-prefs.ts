/**
 * 채팅방 클라이언트 설정 — localStorage 기반.
 *
 * 핵심 로직은 @gwangjang/features/chat 의 createChatPrefs.
 * 이 파일은 localStorage 어댑터를 주입하는 thin wrapper.
 */

import { createChatPrefs } from "@gwangjang/features/chat"

const isClient = typeof window !== "undefined"

/** localStorage 어댑터 — 동기 API 를 ChatPrefsStorage 인터페이스에 맞춤 */
const localStorageAdapter = {
  getItem(key: string): string | null {
    if (!isClient) return null
    return localStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    if (!isClient) return
    localStorage.setItem(key, value)
  },
}

export const chatPrefs = createChatPrefs(
  localStorageAdapter,
  // onChange — 다른 컴포넌트도 갱신할 수 있도록 CustomEvent 발행
  () => {
    if (isClient) {
      window.dispatchEvent(new CustomEvent("chat-prefs-change"))
    }
  },
)
