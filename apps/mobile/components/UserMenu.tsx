/**
 * 사용자 메뉴 — 광장 web HeaderActions 사용자 DropdownMenu 미러 (아바타 클릭 시).
 *
 * 정독 매핑 (apps/web/components/header-actions.tsx 사용자 메뉴):
 *   - 사용자 헤더 (아바타 + 닉네임 + "프로필 보기") — bg-rose-50/70
 *   - 포인트 카드 (amber-500/25 border)
 *   - 메인 메뉴:
 *     · 글쓰기 → register-sheet (RN 은 (tabs)/register 진입)
 *     · 마이페이지
 *     · 찜 목록 (favCount 배지)
 *     · 채팅 (chatUnread 배지)
 *     · 구매 내역 / 판매 관리
 *     · 계정 유형 신청 / 설정
 *     · 로그아웃 (destructive)
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
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegisterSheet } from "./RegisterSheet"

interface Props {
  visible: boolean
  onClose: () => void
}

interface MenuItem {
  icon: any
  iconColor?: string
  label: string
  route: string
  badge?: number
  destructive?: boolean
  separatorBefore?: boolean
}

export function UserMenu({ visible, onClose }: Props) {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const plazaId = useCurrentPlaza()
  const [profile, setProfile] = useState<{
    nickname: string | null
    avatar_url: string | null
    points: number | null
    account_type: string | null
  }>({ nickname: null, avatar_url: null, points: null, account_type: null })
  const [registerOpen, setRegisterOpen] = useState(false)

  useEffect(() => {
    if (!visible || !user) return
    ;(async () => {
      const supabase = getSupabase()
      // 광장 통합: profiles에서 표시 필드, plaza_profiles에서 account_type만
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("nickname, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        plazaId
          ? (supabase as any)
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", plazaId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      const profRaw: any = profRes?.data || {}
      const prof = {
        nickname: profRaw.nickname ?? null,
        avatar_url: profRaw.avatar_url ?? null,
        account_type: ppRes?.data?.account_type ?? "user",
      }
      const at = prof.account_type
      // 포인트 — 광장 격리 해제됨. user_id 만으로 조회 (전 광장 공유)
      let points: number | null = null
      {
        const { data: bal } = await supabase
          .from("user_points")
          .select("available")
          .eq("user_id", user.id)
          .maybeSingle()
        points = (bal as any)?.available ?? 0
      }
      if (prof || points != null) {
        setProfile({
          nickname: prof?.nickname ?? null,
          avatar_url: prof?.avatar_url ?? null,
          points,
          account_type: at,
        })
      }
    })()
  }, [visible, user, plazaId])

  function go(route: string) {
    onClose()
    setTimeout(() => router.push(route as any), 50)
  }

  async function handleLogout() {
    onClose()
    await signOut()
    // 로그아웃 후 홈 탭으로 — 즉시 비로그인 상태 확인
    router.replace("/(tabs)" as any)
  }

  const menuItems: MenuItem[] = [
    { icon: "create-outline",       label: "글쓰기",         route: "/(tabs)/register" },
    { icon: "person-outline",       label: "마이페이지",     route: "/(tabs)/mypage" },
    { icon: "heart",                label: "찜 목록",        route: "/mypage/favorites" },
    { icon: "chatbubble-outline",   label: "채팅",           route: "/(tabs)/chat" },
    { icon: "cart-outline",         label: "구매 내역",      route: "/mypage/orders", separatorBefore: true },
    { icon: "storefront-outline",   label: "판매 관리",      route: "/mypage/sales" },
    { icon: "shield-checkmark-outline", label: "계정 유형 신청", route: "/mypage/account-upgrade", separatorBefore: true },
    { icon: "settings-outline",     label: "설정",           route: "/mypage/settings" },
  ]

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* User header */}
          {user ? (
            <View style={styles.userHeader}>
              <Pressable
                style={styles.userInfo}
                onPress={() => go("/mypage/profile")}
              >
                <View style={styles.avatarWrap}>
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} cachePolicy="memory-disk" style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Ionicons name="person" size={22} color={lightColors.ink500} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userNick}>
                    <Text style={{ fontWeight: "700" }}>{profile.nickname ?? "이웃"}</Text>
                    <Text style={{ fontWeight: "400", color: lightColors.ink500 }}> 님</Text>
                  </Text>
                  <Text style={styles.userSub}>프로필 보기</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
              </Pressable>

              {/* Point card */}
              <Pressable
                style={styles.pointCard}
                onPress={() => go("/mypage/points")}
              >
                <View style={styles.pointLeft}>
                  <View style={styles.pointCoin}>
                    <Text style={styles.pointCoinText}>P</Text>
                  </View>
                  <Text style={styles.pointLabel}>내 포인트</Text>
                </View>
                <Text style={styles.pointValue}>
                  {profile.points != null ? `${profile.points.toLocaleString()}P` : "—"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.loginCta}
              onPress={() => go("/auth/login")}
            >
              <Ionicons name="log-in-outline" size={20} color={lightColors.primary} />
              <Text style={styles.loginCtaText}>로그인 / 회원가입</Text>
            </Pressable>
          )}

          <ScrollView style={{ maxHeight: 480 }}>
            {/* 메인 메뉴 + 로그아웃 — 한 섹션으로 묶음 (구분선 간격 최소화) */}
            {user && (
              <View style={styles.section}>
                {menuItems.map((it, i) => (
                  <View key={i}>
                    {it.separatorBefore && <View style={styles.sep} />}
                    <Pressable
                      style={styles.row}
                      onPress={() => {
                        // 글쓰기 → 라우팅 대신 RegisterSheet 바텀시트
                        if (it.label === "글쓰기") {
                          onClose()
                          setTimeout(() => setRegisterOpen(true), 50)
                        } else {
                          go(it.route)
                        }
                      }}
                    >
                      <Ionicons
                        name={it.icon}
                        size={18}
                        color={lightColors.ink900}
                      />
                      <Text style={styles.rowLabel}>{it.label}</Text>
                      {it.badge != null && it.badge > 0 && (
                        <View style={styles.rowBadge}>
                          <Text style={styles.rowBadgeText}>
                            {it.badge > 99 ? "99+" : String(it.badge)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                ))}
                <View style={styles.sep} />
                <Pressable style={styles.row} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                  <Text style={[styles.rowLabel, { color: "#dc2626" }]}>로그아웃</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* 글쓰기 바텀시트 — Modal 외부에 별도 렌더 */}
    <RegisterSheet
      visible={registerOpen}
      onClose={() => setRegisterOpen(false)}
    />
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  sheet: {
    width: 280,
    marginTop: 60,
    marginRight: 8,
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },

  // User header — web bg-rose-50/70 톤
  userHeader: {
    backgroundColor: "#fff1f2", // rose-50/70
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  userNick: { fontSize: 14, color: lightColors.ink900 },
  userSub: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },

  pointCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)", // amber-500/25
  },
  pointLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  pointCoin: {
    width: 22, height: 22, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f59e0b", // amber-500 (web 매핑)
  },
  pointCoinText: {
    fontSize: 12, fontWeight: "800", color: "#ffffff",
    lineHeight: 14,
  },
  pointLabel: { fontSize: 13, fontWeight: "500", color: lightColors.ink900 },
  pointValue: { fontSize: 13, fontWeight: "700", color: "#b45309" }, // amber-700

  // Login CTA (when logged out)
  loginCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: lightColors.primary + "0F",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  loginCtaText: { fontSize: 14, color: lightColors.primary, fontWeight: "600" },

  section: { paddingVertical: 6, paddingHorizontal: 6 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: lightColors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  rowLabel: { fontSize: 14, fontWeight: "500", color: lightColors.ink900, flex: 1 },
  rowBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightColors.border,
    marginHorizontal: 12,
    marginVertical: 2,
  },

  plazaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  plazaIcon: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  plazaLabel: { fontSize: 14, fontWeight: "500", color: lightColors.ink900 },
})
