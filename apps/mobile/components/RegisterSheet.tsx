/**
 * 등록 시트 — 광장 web RegisterSheet 1:1 미러.
 *
 * 하단 탭의 "등록" 누르면 페이지 이동이 아니라 바텀 시트 (모달) 로 노출.
 * web 의 register-sheet.tsx 와 동일한 권한 매트릭스 적용.
 */

import { useEffect, useState } from "react"
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"

interface Props {
  visible: boolean
  onClose: () => void
}

interface RegisterAction {
  icon: any
  label: string
  route: string
  iconColor: string
  bgColor: string
  /** 허용 계정 타입 — undefined 면 모두 공통 */
  roles?: string[]
}

const FARM_ROLES = ["user", "producer", "business"]

const REGISTER_ACTIONS: RegisterAction[] = [
  // ── 모든 계정 공통 (농촌 직거래·커뮤니티) ────
  { icon: "bag-handle",      label: "농기구",            route: "/secondhand/register",   iconColor: "#d97706", bgColor: "#f59e0b1A" },
  { icon: "gift",            label: "나눔",              route: "/sharing/register",      iconColor: "#ef4444", bgColor: "#ef44441A" },
  { icon: "briefcase",       label: "일손",              route: "/jobs/register",         iconColor: "#0d9488", bgColor: "#14b8a61A" },
  { icon: "chatbox",         label: "마을 소식",         route: "/board/create",          iconColor: "#3b82f6", bgColor: "#3b82f61A" },

  // ── 역할 전용 ────
  { icon: "leaf",            label: "로컬 푸드 등록",    route: "/local-food/register",   iconColor: "#22c55e", bgColor: "#22c55e1A", roles: ["producer"] },
]

export function RegisterSheet({ visible, onClose }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [accountType, setAccountType] = useState<string>("user")

  const plaza = useCurrentPlaza()
  useEffect(() => {
    if (!visible || !user) return
    ;(async () => {
      // 🅲 광장 격리 — plaza_profiles.account_type 우선
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
        plaza
          ? supabase
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", plaza)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      const t = ((ppRes?.data as any)?.account_type ?? (profRes?.data as any)?.account_type) || "user"
      setAccountType(t === "individual" ? "user" : t)
    })()
  }, [visible, user, plaza])

  // 권한 필터
  const KNOWN_ROLES = new Set(FARM_ROLES)
  const role = KNOWN_ROLES.has(accountType) ? accountType : "user"
  const actions = REGISTER_ACTIONS.filter(
    (a) => !a.roles || a.roles.includes(role),
  )

  // 잠긴 카드 — 일반인 (user) 에게만 (로컬푸드 생산자 전환 안내)
  const lockedActions =
    role === "user"
      ? [
          { icon: "leaf",          label: "로컬 푸드",   color: "#22c55e" },
        ]
      : []

  function go(route: string) {
    onClose()
    setTimeout(() => router.push(route as any), 50)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* drag handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>무엇을 등록할까요?</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={lightColors.ink500} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {/* 2-col grid */}
            <View style={styles.grid}>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  style={({ pressed }) => [
                    styles.gridCard,
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => go(a.route)}
                >
                  <View style={[styles.gridIcon, { backgroundColor: a.bgColor }]}>
                    <Ionicons name={a.icon} size={20} color={a.iconColor} />
                  </View>
                  <Text style={styles.gridLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* 잠긴 카테고리 — 일반인 전용 */}
            {lockedActions.length > 0 && (
              <Pressable
                style={styles.lockedCta}
                onPress={() => go("/mypage/account-upgrade")}
              >
                <View style={styles.lockedIcons}>
                  {lockedActions.slice(0, 4).map((a, i) => (
                    <View
                      key={a.label}
                      style={[
                        styles.lockedIcon,
                        {
                          backgroundColor: a.color + "1A",
                          marginLeft: i === 0 ? 0 : -6,
                        },
                      ]}
                    >
                      <Ionicons name={a.icon as any} size={11} color={a.color} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="lock-closed" size={11} color={lightColors.ink900} />
                    <Text style={styles.lockedTitle}>
                      로컬푸드 생산자 계정 전환 시 등록 가능
                    </Text>
                  </View>
                  <Text style={styles.lockedSub} numberOfLines={1}>
                    직접 키운 농산물을 로컬푸드로 판매해보세요
                  </Text>
                </View>
                <Text style={styles.lockedArrow}>신청 →</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  handleRow: { alignItems: "center", paddingTop: 8 },
  handle: {
    width: 40, height: 4, borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "600", color: lightColors.ink900 },
  closeBtn: { padding: 4, borderRadius: 999 },

  body: { paddingHorizontal: 20, paddingBottom: 12 },

  // 2-col grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridCard: {
    width: "48.5%",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#ffffff",
  },
  gridIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  gridLabel: {
    fontSize: 13, fontWeight: "500", color: lightColors.ink900,
  },

  // Locked CTA
  lockedCta: {
    marginTop: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1, borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.15)",
  },
  lockedIcons: { flexDirection: "row", alignItems: "center" },
  lockedIcon: {
    width: 24, height: 24, borderRadius: 999,
    borderWidth: 2, borderColor: lightColors.background,
    alignItems: "center", justifyContent: "center",
  },
  lockedTitle: { fontSize: 11, fontWeight: "500", color: lightColors.ink900 },
  lockedSub: { fontSize: 10, color: lightColors.ink500, marginTop: 2 },
  lockedArrow: { fontSize: 12, fontWeight: "500", color: lightColors.primary },
})
