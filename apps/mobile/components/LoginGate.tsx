/**
 * 전역 로그인 게이트 — 비로그인 시 액션을 막고 "로그인이 필요해요" 모달 표시.
 *
 * 사용:
 *   const { requireLogin } = useLoginGate()
 *   onPress={() => { if (requireLogin("글쓰기")) router.push("/board/create") }}
 *
 * requireLogin(label?) → 로그인돼 있으면 true(진행), 아니면 모달 띄우고 false.
 * 모달은 앱 톤(딥그린)으로 통일. 루트(_layout)에서 Provider 1회 렌더.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"

type LoginGateCtx = {
  /** 로그인돼 있으면 true. 아니면 모달 표시 후 false. label 은 "{label} 기능은 로그인 후…" */
  requireLogin: (label?: string) => boolean
}

const Ctx = createContext<LoginGateCtx>({ requireLogin: () => true })

export function useLoginGate() {
  return useContext(Ctx)
}

export function LoginGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const [label, setLabel] = useState<string | null>(null)

  const requireLogin = useCallback(
    (lbl?: string) => {
      if (user) return true
      setLabel(lbl ?? "이 기능")
      return false
    },
    [user],
  )

  return (
    <Ctx.Provider value={{ requireLogin }}>
      {children}
      <Modal
        visible={label !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLabel(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setLabel(null)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={26} color={lightColors.primary} />
            </View>
            <Text style={styles.title}>로그인이 필요해요</Text>
            <Text style={styles.body}>
              <Text style={{ fontWeight: "700", color: lightColors.ink900 }}>{label}</Text>
              {" 기능은 로그인 후 이용할 수 있어요."}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => setLabel(null)}
                accessibilityRole="button"
                accessibilityLabel="취소"
                style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.btnSecondaryText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setLabel(null)
                  router.push("/auth/login" as any)
                }}
                accessibilityRole="button"
                accessibilityLabel="로그인"
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.btnPrimaryText}>로그인</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.5)", justifyContent: "center", alignItems: "center", padding: 32 },
  card: { width: "100%", maxWidth: 340, backgroundColor: "#ffffff", borderRadius: 20, padding: 24, alignItems: "center" },
  iconWrap: {
    width: 52, height: 52, borderRadius: 999,
    backgroundColor: "rgba(34,90,57,0.12)", // 딥그린 틴트 (앱 톤)
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: lightColors.ink900, marginBottom: 6 },
  body: { fontSize: 14, color: lightColors.ink500, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnSecondary: { backgroundColor: "#f1f5f9" },
  btnSecondaryText: { fontSize: 15, fontWeight: "700", color: lightColors.ink900 },
  btnPrimary: { backgroundColor: lightColors.primary },
  btnPrimaryText: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
})
