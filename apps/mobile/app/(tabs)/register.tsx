/**
 * 등록 탭 — 글/매물/모임/공구 등록 진입 시트.
 * 광장 web 의 RegisterSheet 1:1 미러 (계정별 분기).
 *
 * 권한 매트릭스 (web register-sheet.tsx 정독):
 *   [공통 — 공인중개사 제외]
 *     매물 등록 / 구해주세요 / 게시판 / 나눔 / 중고거래 / 구인구직 / 모임 / 신장개업
 *   [agent]   → 공인중개사 매물 등록
 *   [producer] → +로컬푸드
 *   [business] → +공동구매
 *   [interior] → +인테리어
 *   [moving]   → +이사
 *   [cleaning] → +청소
 *   [repair]   → +수리
 */

import { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"

interface RegisterAction {
  icon: any
  label: string
  desc: string
  route: string
  color: string
  /** 허용 계정 타입 — undefined 면 모든 사용자 (단 agent 는 매물 등록 분기) */
  roles?: string[]
}

const NON_AGENT_ROLES = ["user", "producer", "business", "interior", "moving", "cleaning", "repair"]

const ALL_ACTIONS: RegisterAction[] = [
  // 매물 등록 — agent 와 그 외 분기
  { icon: "home-outline",          label: "매물 등록",        desc: "전세·월세·매매 등록", route: "/property/register",  color: "#2563eb", roles: NON_AGENT_ROLES },
  { icon: "home",                  label: "공인중개사 매물 등록", desc: "검증된 매물 등록",   route: "/property/register",  color: "#1d4ed8", roles: ["agent"] },
  { icon: "hand-left-outline",     label: "구해주세요(의뢰)",  desc: "원하는 집 요청",      route: "/requests/new",       color: "#e11d48", roles: NON_AGENT_ROLES },
  // 공통
  { icon: "document-text-outline", label: "게시판 글쓰기",    desc: "동네 이야기 / 질문",   route: "/board/create",       color: "#0284c7" },
  { icon: "gift-outline",          label: "나눔 글쓰기",      desc: "이웃과 무료 나눔",     route: "/sharing/register",   color: "#10b981" },
  { icon: "bag-handle-outline",    label: "중고거래 글쓰기",  desc: "안 쓰는 물건 판매",    route: "/secondhand/register", color: "#f59e0b" },
  { icon: "briefcase-outline",     label: "구인구직 글쓰기",  desc: "알바·일자리 공고",     route: "/jobs/register",      color: "#0d9488" },
  { icon: "people-outline",        label: "모임 글쓰기",      desc: "취미·운동·동호회",     route: "/clubs/register",     color: "#6366f1" },
  { icon: "storefront-outline",    label: "신장개업 등록",    desc: "오픈 알림",            route: "/new-store/register", color: "#f97316", roles: ["business"] },
  // 역할 전용
  { icon: "leaf-outline",          label: "로컬푸드 등록",    desc: "지역 농산물 판매",     route: "/local-food/register", color: "#22c55e", roles: ["producer"] },
  { icon: "cart-outline",          label: "공동구매 글쓰기",  desc: "함께 사면 더 저렴",    route: "/group-buying/register", color: "#8b5cf6", roles: ["business"] },
  { icon: "construct-outline",     label: "인테리어 등록",    desc: "시공·리모델링",        route: "/interior/register",  color: "#a855f7", roles: ["interior"] },
  { icon: "car-outline",           label: "이사 등록",        desc: "이사 서비스",          route: "/moving/register",    color: "#eab308", roles: ["moving"] },
  { icon: "sparkles-outline",      label: "청소 등록",        desc: "청소 서비스",          route: "/cleaning/register",  color: "#ec4899", roles: ["cleaning"] },
  { icon: "build-outline",         label: "수리 등록",        desc: "수리 서비스",          route: "/repair/register",    color: "#ea580c", roles: ["repair"] },
]

export default function RegisterTab() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { user } = useAuth()
  const DEFAULT_PLAZA = useCurrentPlaza()
  const [accountType, setAccountType] = useState<string>("user")

  useEffect(() => {
    if (!user) return
    ;(async () => {
      // 🅲 account_type 은 현재 광장 plaza_profiles 우선
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .maybeSingle(),
        DEFAULT_PLAZA
          ? supabase
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", DEFAULT_PLAZA)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      const prof: any = profRes?.data || {}
      const pp: any = (ppRes as any)?.data || {}
      const t = pp.account_type ?? prof.account_type
      if (t) setAccountType(t as string)
    })()
  }, [user, DEFAULT_PLAZA])

  // 비로그인 — 로그인 유도 화면 (chat/mypage 동일 톤)
  if (!user) {
    return (
      <SafeAreaView style={loginStyles.center} edges={["top"]}>
        <Ionicons name="add-circle-outline" size={64} color={lightColors.ink300} />
        <Text style={loginStyles.title}>로그인이 필요해요</Text>
        <Text style={loginStyles.sub}>등록하려면 로그인 해주세요</Text>
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={loginStyles.btn}
        >
          <Text style={loginStyles.btnText}>로그인/회원가입 하기</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  // 계정별 노출 항목 필터
  const ITEMS = ALL_ACTIONS.filter((a) => {
    if (!a.roles) return true
    return a.roles.includes(accountType)
  })

  // 잠긴 액션 — 일반인 (user) 에게만 보이는 전문가 권한 카테고리 안내
  // (web register-sheet.tsx line 256+ 정독)
  const isUser = accountType === "user" || accountType === "individual"
  const lockedActions = isUser
    ? [
        { icon: "leaf-outline",        label: "로컬 푸드 등록",      color: "#22c55e" },
        { icon: "cart-outline",        label: "공동구매",            color: "#8b5cf6" },
        { icon: "storefront-outline",  label: "신장개업 등록",       color: "#f97316" },
        { icon: "construct-outline",   label: "인테리어 등록",       color: "#a855f7" },
        { icon: "car-outline",         label: "이사 서비스 등록",    color: "#eab308" },
        { icon: "sparkles-outline",    label: "청소 서비스 등록",    color: "#ec4899" },
        { icon: "build-outline",       label: "수리 서비스 등록",    color: "#ea580c" },
      ]
    : []

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 — web RegisterSheet 1:1: "무엇을 등록할까요?" + X */}
      <View style={styles.header}>
        <Text style={styles.title}>무엇을 등록할까요?</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={lightColors.ink500} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* 2 col grid — web grid-cols-2 gap-2 */}
        <View style={styles.grid}>
          {ITEMS.map((it) => (
            <Pressable
              key={it.label}
              style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(it.route as any)}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${it.color}1A` }]}>
                <Ionicons name={it.icon} size={20} color={it.color} />
              </View>
              <Text style={styles.gridLabel}>{it.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 잠긴 카테고리 CTA — 일반인 전용 (web 1:1) */}
        {lockedActions.length > 0 && (
          <Pressable
            onPress={() => router.push("/mypage/account-upgrade" as any)}
            style={styles.lockedCta}
          >
            <View style={styles.lockedIcons}>
              {lockedActions.slice(0, 4).map((a, i) => (
                <View
                  key={a.label}
                  style={[
                    styles.lockedIcon,
                    { backgroundColor: a.color + "1A", marginLeft: i === 0 ? 0 : -6 },
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
                  전문가 · 사업자 계정 전환 시 더 많은 등록 가능
                </Text>
              </View>
              <Text style={styles.lockedSub} numberOfLines={1}>
                로컬푸드 · 공동구매 · 인테리어 · 이사 · 청소 · 수리
              </Text>
            </View>
            <Text style={styles.lockedArrow}>신청 →</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Header — web RegisterSheet "무엇을 등록할까요?" + X
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,        // p-5
    paddingTop: 20,
    paddingBottom: 16,            // mb-4
  },
  title: {
    fontSize: 16,                 // text-base
    fontWeight: "600",            // font-semibold
    color: colors.ink900,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 999,
  },
  list: {
    paddingHorizontal: 20,        // p-5
    paddingBottom: 30,
  },

  // Grid — web grid-cols-2 gap-2
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,                       // gap-2
  },
  gridCard: {
    width: "48.5%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,                       // gap-2
    padding: 16,                  // p-4
    borderRadius: 12,             // rounded-xl
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)", // border-border/60
  },
  gridIcon: {
    width: 44,                    // w-11
    height: 44,                   // h-11
    borderRadius: 12,             // rounded-xl
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: {
    fontSize: 13,                 // text-sm
    fontWeight: "500",            // font-medium
    color: colors.ink900,
  },

  // Locked CTA — web mt-3 px-3 py-2.5 rounded-xl border-dashed
  lockedCta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.15)",
  },
  lockedIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  lockedIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.ink900,
  },
  lockedSub: {
    fontSize: 10,
    color: colors.ink500,
    marginTop: 2,
  },
  lockedArrow: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.primary,
  },
})
}

// 비로그인 화면 (chat/mypage 동일 톤)
const loginStyles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
    marginTop: 16,
  },
  sub: {
    fontSize: 13,
    color: lightColors.ink500,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  btn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
  },
  btnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
})
