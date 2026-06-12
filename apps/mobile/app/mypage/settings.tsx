/**
 * 환경 설정 — 광장 web /mypage/settings 1:1 미러.
 *
 * 정독 매핑 (apps/web/app/(plaza)/mypage/settings/page.tsx):
 *   - 헤더: ← 설정 (sticky)
 *   - 상단 프로필 카드 (그라디언트, 아바타 + 닉네임 + 역할 뱃지 + 관리자
 *     뱃지 + 이메일, "프로필 보기 →" 텍스트)
 *   - 섹션 5개 (계정 / 공개 설정 / 알림 설정 / 고객지원 / 약관)
 *     각 섹션: title + 메타 (예 "3개 활성") + 항목 카드 (rounded-2xl)
 *   - 항목: iconBg(/10 opacity) + iconColor + label + helper + chevron/Switch
 *   - 토글: posts_public / 채팅·매물·마케팅 알림 (DB persist)
 *   - 로그아웃 버튼 (outline, h-12)
 *   - Danger zone — 회원 탈퇴 (rounded-2xl, destructive border)
 *   - 앱 버전 표시
 */

import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza, useCurrentPlazaState } from "@/lib/plaza"
import Constants from "expo-constants"
import { themePref, useThemePref, type ThemePref } from "@/components/useColorScheme"
import { localePref, useLocalePref, LOCALE_LABEL, type LocalePref } from "@/lib/locale"
import { useIsAdmin } from "@/lib/useIsAdmin"

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  user: "일반",
  agent: "공인중개사",
  interior: "인테리어",
  moving: "이사 업체",
  cleaning: "청소 업체",
  repair: "수리 업체",
  producer: "로컬푸드 생산자",
  business: "사업자",
}

interface Profile {
  nickname: string | null
  avatar_url: string | null
  account_type: string | null
  role: string | null
}

interface NotifPrefs {
  chat: boolean
  property: boolean
  marketing: boolean
}

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { id: plazaId, name: plazaName } = useCurrentPlazaState()
  const isAdmin = useIsAdmin()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [postsPublic, setPostsPublic] = useState(true)
  const [notif, setNotif] = useState<NotifPrefs>({
    chat: true,
    property: true,
    marketing: false,
  })

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        // 🅲 광장 격리 — nickname/avatar/account_type 은 plaza_profiles 우선
        // role / posts_public / notif_* 는 글로벌 profiles 사용
        const [profRes, ppRes] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "nickname, avatar_url, account_type, role, posts_public, notif_chat, notif_property, notif_marketing",
            )
            .eq("id", user.id)
            .maybeSingle(),
          plazaId
            ? supabase
                .from("plaza_profiles")
                .select("nickname, avatar_url, account_type")
                .eq("user_id", user.id)
                .eq("plaza_id", plazaId)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        if (cancelled) return
        const data: any = profRes.data
        const pp: any = ppRes?.data || {}
        if (!data) return
        setProfile({
          nickname: pp.nickname ?? data.nickname,
          avatar_url: pp.avatar_url ?? data.avatar_url,
          account_type: pp.account_type ?? data.account_type,
          role: data.role,
        })
        if (typeof data.posts_public === "boolean") setPostsPublic(data.posts_public)
        setNotif({
          chat: data.notif_chat ?? true,
          property: data.notif_property ?? true,
          marketing: data.notif_marketing ?? false,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, plazaId])

  async function persistNotif(key: keyof NotifPrefs, next: boolean) {
    if (!user) return
    const prev = notif
    setNotif({ ...notif, [key]: next })
    const column =
      key === "chat"
        ? "notif_chat"
        : key === "property"
        ? "notif_property"
        : "notif_marketing"
    const { error } = await getSupabase()
      .from("profiles")
      .update({ [column]: next })
      .eq("id", user.id)
    if (error) {
      setNotif(prev)
      Alert.alert("실패", "알림 설정 저장에 실패했습니다")
    }
  }

  async function persistPostsPublic() {
    if (!user) return
    const next = !postsPublic
    setPostsPublic(next)
    const { error } = await getSupabase()
      .from("profiles")
      .update({ posts_public: next })
      .eq("id", user.id)
    if (error) {
      setPostsPublic(!next)
      Alert.alert("실패", "공개 설정 저장에 실패했습니다")
    }
  }

  function handleLogout() {
    Alert.alert("로그아웃", "정말 로그아웃 하시겠어요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await signOut()
          // 세션 해제 후 홈 탭으로 이동 — 사용자가 뒤로가기 없이도 바로 확인 가능
          router.replace("/(tabs)" as any)
        },
      },
    ])
  }

  function handleDeleteAccount() {
    Alert.alert(
      "회원 탈퇴",
      "정말로 회원 탈퇴하시겠습니까?\n\n탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "다음",
          style: "destructive",
          onPress: () =>
            Alert.alert("최종 확인", "마지막 확인입니다. 정말로 탈퇴하시겠습니까?", [
              { text: "취소", style: "cancel" },
              {
                text: "탈퇴",
                style: "destructive",
                onPress: async () => {
                  try {
                    const res = await gwangjangFetch("/api/account/delete", {
                      method: "POST",
                    })
                    if (!res.ok) throw new Error(`상태 ${res.status}`)
                    await signOut()
                    Alert.alert("완료", "회원 탈퇴가 완료되었습니다", [
                      {
                        text: "확인",
                        onPress: () => router.replace("/(tabs)" as any),
                      },
                    ])
                  } catch (e: any) {
                    Alert.alert("실패", e?.message || "탈퇴에 실패했습니다")
                  }
                },
              },
            ]),
        },
      ],
    )
  }

  const notifActive = useMemo(
    () => [notif.chat, notif.property, notif.marketing].filter(Boolean).length,
    [notif],
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 프로필 카드 */}
        <Pressable
          style={styles.profileCard}
          onPress={() => router.push("/(tabs)/mypage")}
        >
          <View style={styles.profileAvatar}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} cachePolicy="memory-disk" style={styles.profileAvatarImg} />
            ) : (
              <Ionicons name="person" size={28} color={lightColors.ink500} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName} numberOfLines={1}>
                {profile?.nickname || "닉네임 없음"}
              </Text>
              {profile?.account_type && (
                <View style={styles.profileTypeBadge}>
                  <Text style={styles.profileTypeBadgeText}>
                    {ACCOUNT_TYPE_LABEL[profile.account_type] || profile.account_type}
                  </Text>
                </View>
              )}
              {isAdmin && (
                <View style={styles.profileAdminBadge}>
                  <Text style={styles.profileAdminText}>관리자</Text>
                </View>
              )}
            </View>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email || ""}
            </Text>
            <Text style={styles.profileLink}>프로필 보기 →</Text>
          </View>
        </Pressable>

        {/* 계정 */}
        <Section title="계정">
          <Row
            item={{
              type: "link",
              icon: "person-outline",
              iconColor: "#2563eb",
              iconBg: "rgba(59,130,246,0.1)",
              label: "프로필 정보 편집",
              helper: "닉네임, 프로필 사진, 자기소개",
              onPress: () => router.push("/mypage/edit"),
            }}
            divider
          />
          <Row
            item={{
              type: "link",
              icon: "lock-closed-outline",
              iconColor: "#e11d48",
              iconBg: "rgba(244,63,94,0.1)",
              label: "비밀번호 변경",
              helper: "보안을 위해 정기적으로 변경하세요",
              onPress: () => router.push("/auth/change-password" as any),
            }}
          />
        </Section>

        {/* 공개 설정 */}
        <Section title="공개 설정">
          <Row
            item={{
              type: "toggle",
              icon: "eye-outline",
              iconColor: "#4f46e5",
              iconBg: "rgba(99,102,241,0.1)",
              label: "내 게시물 공개",
              helper: "다른 사용자가 내 프로필에서 게시글을 볼 수 있어요",
              value: postsPublic,
              onChange: persistPostsPublic,
            }}
            divider
          />
          <Row
            item={{
              type: "link",
              icon: "ban-outline",
              iconColor: "#dc2626",
              iconBg: "rgba(220,38,38,0.1)",
              label: "차단 사용자 관리",
              helper: "차단한 사용자의 글·채팅을 가립니다",
              onPress: () => router.push("/mypage/blocked" as any),
            }}
          />
        </Section>

        {/* 표시 설정 (테마) */}
        <ThemeSection />

        {/* 언어 설정 */}
        <LocaleSection />

        {/* 알림 설정 */}
        <Section title="알림 설정" meta={`${notifActive}개 활성`}>
          <Row
            item={{
              type: "toggle",
              icon: "chatbubble-outline",
              iconColor: "#2563eb",
              iconBg: "rgba(59,130,246,0.1)",
              label: "채팅 알림",
              helper: "새 메시지가 오면 알려드려요",
              value: notif.chat,
              onChange: () => persistNotif("chat", !notif.chat),
            }}
            divider
          />
          <Row
            item={{
              type: "toggle",
              icon: "home-outline",
              iconColor: "#059669",
              iconBg: "rgba(16,185,129,0.1)",
              label: "관심 글 알림",
              helper: "찜한 글 가격 변경·새 댓글",
              value: notif.property,
              onChange: () => persistNotif("property", !notif.property),
            }}
            divider
          />
          <Row
            item={{
              type: "toggle",
              icon: "megaphone-outline",
              iconColor: "#7c3aed",
              iconBg: "rgba(139,92,246,0.1)",
              label: "마케팅 정보 수신",
              helper: "이벤트·프로모션 소식",
              value: notif.marketing,
              onChange: () => persistNotif("marketing", !notif.marketing),
            }}
          />
        </Section>


        {/* 고객지원 */}
        <Section title="고객지원">
          <Row
            item={{
              type: "link",
              icon: "megaphone-outline",
              iconColor: "#d97706",
              iconBg: "rgba(245,158,11,0.1)",
              label: "공지사항",
              onPress: () => router.push("/support/notice"),
            }}
            divider
          />
          <Row
            item={{
              type: "link",
              icon: "help-circle-outline",
              iconColor: "#0891b2",
              iconBg: "rgba(6,182,212,0.1)",
              label: "자주 묻는 질문",
              onPress: () => router.push("/support/faq"),
            }}
            divider
          />
          <Row
            item={{
              type: "link",
              icon: "mail-outline",
              iconColor: "#059669",
              iconBg: "rgba(16,185,129,0.1)",
              label: "고객센터",
              onPress: () => router.push("/support/support"),
            }}
          />
        </Section>

        {/* 약관 및 정책 */}
        <Section title="약관 및 정책">
          <Row
            item={{
              type: "link",
              icon: "document-text-outline",
              iconColor: "#475569",
              iconBg: "rgba(100,116,139,0.1)",
              label: "이용약관",
              onPress: () => router.push("/legal/terms"),
            }}
            divider
          />
          <Row
            item={{
              type: "link",
              icon: "shield-outline",
              iconColor: "#475569",
              iconBg: "rgba(100,116,139,0.1)",
              label: "개인정보처리방침",
              onPress: () => router.push("/legal/privacy"),
            }}
          />
        </Section>

        {/* 로그아웃 */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="log-out-outline" size={18} color={lightColors.ink900} />
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>

        {/* Danger zone */}
        <View style={styles.dangerSectionTitle}>
          <Ionicons name="warning-outline" size={14} color="#dc2626" />
          <Text style={styles.dangerTitleText}>위험 구역</Text>
        </View>
        <View style={styles.dangerCard}>
          <Text style={styles.dangerLabel}>회원 탈퇴</Text>
          <Text style={styles.dangerHelper}>
            계정을 삭제하면 모든 게시물·채팅·포인트가 사라지며 복구할 수 없습니다.
          </Text>
          <Pressable
            onPress={handleDeleteAccount}
            style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="trash-outline" size={16} color="#ffffff" />
            <Text style={styles.dangerBtnText}>회원 탈퇴</Text>
          </Pressable>
        </View>

        {/* 앱 버전 */}
        <View style={styles.versionWrap}>
          <Text style={styles.versionMain}>{plazaName} v{Constants.expoConfig?.version ?? "1.0.0"}</Text>
          <Text style={styles.versionSub}>이웃과 함께하는 농촌 생활</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── 표시 설정 (테마 선택) ──────────────────────────────────────────

function ThemeSection() {
  const pref = useThemePref()
  const OPTIONS: Array<{ key: ThemePref; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: "light", label: "라이트", icon: "sunny-outline" },
    { key: "dark", label: "다크", icon: "moon-outline" },
    { key: "system", label: "시스템", icon: "phone-portrait-outline" },
  ]
  return (
    <View style={{ marginTop: spacing[4] }}>
      <Text style={themeStyles.sectionTitle}>표시 설정</Text>
      <View style={themeStyles.card}>
        <View style={themeStyles.segRow}>
          {OPTIONS.map((opt) => {
            const active = pref === opt.key
            return (
              <Pressable
                key={opt.key}
                onPress={() => themePref.set(opt.key)}
                style={[themeStyles.seg, active && themeStyles.segActive]}
              >
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={active ? "#ffffff" : lightColors.ink700}
                />
                <Text style={[themeStyles.segText, active && themeStyles.segTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={themeStyles.helper}>
          ※ 일부 화면은 라이트 테마로 고정될 수 있습니다.
        </Text>
      </View>
    </View>
  )
}

const themeStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink500,
    marginBottom: spacing[2],
    paddingHorizontal: spacing[1],
  },
  card: {
    backgroundColor: lightColors.card,
    borderRadius: radius.lg,
    padding: spacing[3],
  },
  segRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
  },
  segActive: { backgroundColor: lightColors.primary },
  segText: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink700 },
  segTextActive: { color: "#ffffff" },
  helper: {
    marginTop: spacing[2],
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
})

// ─── 언어 설정 ─────────────────────────────────────────────

function LocaleSection() {
  const pref = useLocalePref()
  const OPTIONS: LocalePref[] = ["auto", "ko", "en"]
  return (
    <View style={{ marginTop: spacing[4] }}>
      <Text style={themeStyles.sectionTitle}>언어</Text>
      <View style={themeStyles.card}>
        {OPTIONS.map((opt, i) => {
          const active = pref === opt
          const disabled = opt === "en" // 영어 미구현 — 선택 불가
          return (
            <Pressable
              key={opt}
              disabled={disabled}
              onPress={() => localePref.set(opt)}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: spacing[3],
                },
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: lightColors.border,
                },
                disabled && { opacity: 0.45 },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
                <Ionicons
                  name="language-outline"
                  size={18}
                  color={active ? lightColors.primary : lightColors.ink500}
                />
                <Text
                  style={{
                    fontSize: fontSize.md,
                    color: disabled ? lightColors.ink500 : lightColors.ink900,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {LOCALE_LABEL[opt]}
                </Text>
              </View>
              {disabled && (
                <Text style={{ fontSize: 12, color: lightColors.ink500 }}>준비 중</Text>
              )}
              {active && !disabled && (
                <Ionicons name="checkmark" size={20} color={lightColors.primary} />
              )}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ─── Section / Row ──────────────────────────────────────────

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ marginTop: spacing[4] }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

interface ToggleItem {
  type: "toggle"
  icon: any
  iconColor: string
  iconBg: string
  label: string
  helper?: string
  value: boolean
  onChange: () => void
}
interface LinkItem {
  type: "link"
  icon: any
  iconColor: string
  iconBg: string
  label: string
  helper?: string
  onPress: () => void
}
type Item = ToggleItem | LinkItem

function Row({ item, divider }: { item: Item; divider?: boolean }) {
  const inner = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
        <Ionicons name={item.icon} size={20} color={item.iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        {item.helper ? <Text style={styles.rowHelper}>{item.helper}</Text> : null}
      </View>
    </>
  )

  if (item.type === "toggle") {
    return (
      <View style={[styles.row, divider && styles.rowDivider]}>
        {inner}
        <Switch
          value={item.value}
          onValueChange={item.onChange}
          trackColor={{ false: lightColors.border, true: lightColors.primary }}
        />
      </View>
    )
  }

  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.row,
        divider && styles.rowDivider,
        pressed && { backgroundColor: lightColors.muted },
      ]}
    >
      {inner}
      <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
    </Pressable>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.background,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },

  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    marginTop: spacing[4],
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.background,
  },
  profileAvatarImg: { width: "100%", height: "100%" },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  profileName: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },
  profileTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  profileTypeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  profileAdminBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(245,158,11,0.2)",
  },
  profileAdminText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  profileEmail: {
    fontSize: fontSize.xs,
    color: colors.ink500,
    marginTop: 2,
  },
  profileLink: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "500",
    marginTop: 4,
  },

  // Section
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: spacing[2],
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink700,
    marginBottom: 2,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  sectionCard: {
    backgroundColor: "#fafbfc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.6)",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.ink900,
  },
  rowHelper: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 2,
  },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    marginTop: spacing[4],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  logoutText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.ink900,
  },

  // Danger
  dangerSectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  dangerTitleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#dc2626",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  dangerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.3)",
    backgroundColor: "rgba(220,38,38,0.05)",
    padding: spacing[4],
  },
  dangerLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: 4,
  },
  dangerHelper: {
    fontSize: 11,
    color: colors.ink500,
    marginBottom: spacing[3],
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[3],
    height: 36,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  dangerBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Version
  versionWrap: {
    paddingTop: spacing[4],
    alignItems: "center",
  },
  versionMain: {
    fontSize: 11,
    color: colors.ink500,
  },
  versionSub: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 2,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
