/**
 * ShareModal — 모든 공유하기 버튼이 띄우는 통일 팝업.
 *
 * 3가지 옵션 (각각 다른 동작):
 *   1) 카카오톡 — 링크 복사 + KakaoTalk 앱 실행 (URL scheme `kakaotalk://`)
 *      → 사용자가 채팅창에 붙여넣기. 카카오 SDK 없이 동작.
 *   2) 링크복사 — expo-clipboard 로 URL 만 복사
 *   3) 다른 앱 — RN 네이티브 Share.share (시스템 공유 시트)
 */

import { useState } from "react"
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"

// 동적 require — expo-clipboard 네이티브 모듈이 빠진 빌드(OTA 만 받은 기기)에서
// 정적 import 가 모듈 로드 시점에 throw 하면서 ShareModal 을 import 하는
// 모든 화면이 진입 즉시 크래시함. require + try 로 가드해서 안전 폴백.
let Clipboard: { setStringAsync?: (s: string) => Promise<void> } | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Clipboard = require("expo-clipboard")
} catch {
  Clipboard = null
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(text)
      return true
    }
  } catch {
    /* fallthrough */
  }
  return false
}

interface Props {
  visible: boolean
  url: string
  title?: string
  message?: string
  onClose: () => void
}

function toast(msg: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT)
  } else {
    Alert.alert(msg)
  }
}

export function ShareModal({ visible, url, title, message, onClose }: Props) {
  const fullMessage = message ?? (title ? `${title}\n${url}` : url)

  async function handleKakao() {
    try {
      const copied = await copyToClipboard(fullMessage)
      if (copied) {
        toast("링크가 복사되었습니다. 카카오톡에 붙여넣어 공유해주세요.")
      }
      const canOpen = await Linking.canOpenURL("kakaotalk://")
      if (canOpen) {
        await Linking.openURL("kakaotalk://")
      } else if (copied) {
        const store =
          Platform.OS === "ios"
            ? "https://apps.apple.com/kr/app/kakaotalk/id362057947"
            : "https://play.google.com/store/apps/details?id=com.kakao.talk"
        await Linking.openURL(store)
      } else {
        // Clipboard 미설치 + 카카오 미설치 → 시스템 share 로 폴백
        await Share.share({ title, message: fullMessage, url })
      }
    } catch {
      toast("카카오톡을 열 수 없습니다")
    } finally {
      onClose()
    }
  }

  async function handleCopy() {
    try {
      const copied = await copyToClipboard(url)
      if (copied) {
        toast("링크가 복사되었습니다")
      } else {
        // Clipboard 미설치 → 시스템 share 시트 (사용자가 "복사" 선택)
        await Share.share({ message: url, url })
      }
    } catch {
      toast("복사 실패")
    } finally {
      onClose()
    }
  }

  async function handleNative() {
    try {
      await Share.share({
        title,
        message: fullMessage,
        url,
      })
    } catch {
      /* user cancelled */
    } finally {
      onClose()
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation && e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>공유하기</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={lightColors.ink900} />
            </Pressable>
          </View>

          <View style={styles.options}>
            <Pressable style={styles.optBtn} onPress={handleKakao}>
              <View style={[styles.optIcon, { backgroundColor: "#fee500" }]}>
                <Ionicons name="chatbubble" size={26} color="#3c1e1e" />
              </View>
              <Text style={styles.optLabel}>카카오톡</Text>
            </Pressable>

            <Pressable style={styles.optBtn} onPress={handleCopy}>
              <View style={[styles.optIcon, { backgroundColor: "#475569" }]}>
                <Ionicons name="link" size={26} color="#ffffff" />
              </View>
              <Text style={styles.optLabel}>링크복사</Text>
            </Pressable>

            <Pressable style={styles.optBtn} onPress={handleNative}>
              <View style={[styles.optIcon, { backgroundColor: "#0284c7" }]}>
                <Ionicons name="share-social" size={26} color="#ffffff" />
              </View>
              <Text style={styles.optLabel}>다른 앱</Text>
            </Pressable>
          </View>

          <Text style={styles.urlText} numberOfLines={1}>{url}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * 편의 훅 — 상태 + 컴포넌트 + open() 함수 한번에 반환.
 *
 *   const share = useShareModal()
 *   <Pressable onPress={() => share.open({ url, title })}>...</Pressable>
 *   {share.element}
 */
export function useShareModal() {
  const [state, setState] = useState<{
    visible: boolean
    url: string
    title?: string
    message?: string
    mounted: boolean
  }>({ visible: false, url: "", mounted: false })
  return {
    open: (args: { url: string; title?: string; message?: string }) =>
      setState({ visible: true, mounted: true, ...args }),
    close: () => setState((s) => ({ ...s, visible: false })),
    // 한번도 열린 적 없으면 null — Modal 트리 자체를 마운트하지 않아 14개 상세 페이지의
    // 진입 비용을 0 으로. open() 호출 후엔 계속 마운트 (애니메이션 부드럽게).
    element: !state.mounted ? null : (
      <ShareModal
        visible={state.visible}
        url={state.url}
        title={state.title}
        message={state.message}
        onClose={() => setState((s) => ({ ...s, visible: false }))}
      />
    ),
  }
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderRadius: 20,
    width: "100%",
    maxWidth: 440,
    paddingBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: lightColors.ink900 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  options: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  optBtn: { alignItems: "center", gap: 8 },
  optIcon: {
    width: 64, height: 64, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  optLabel: { fontSize: 13, fontWeight: "500", color: lightColors.ink900 },
  urlText: {
    textAlign: "center",
    fontSize: 11,
    color: lightColors.ink500,
    paddingHorizontal: 16,
  },
})
