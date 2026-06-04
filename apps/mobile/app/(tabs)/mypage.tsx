/**
 * MY 탭 대시보드 — 당근마켓 스타일.
 *
 * 구조:
 *   - 헤더: 우측 끝 설정 아이콘만
 *   - 프로필 카드: 아바타 + 닉네임 + > (탭 시 /mypage/profile — 기존 mypage 풀 뷰)
 *   - 포인트 카드: 잔액 + 충전/적립내역/사용내역
 *   - 서비스 그리드 (2x4)
 *   - 관심목록 / 최근 본 글 / 혜택 (Quick row)
 *   - 나의 거래: 판매관리 / 구매내역 / 가격찾기 / 거래가계부
 *   - 나의 관심: 관심목록
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, spacing } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { getProfileCard, getPointBalance, type ProfileCardData } from "@gwangjang/features/profile"

import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza, useCurrentPlazaState } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"
import { useUnreadCounts } from "@/lib/use-unread-counts"
import { getMyPageCache, prefetchMyPage, clearMyPageCache } from "@/lib/mypage-prefetch"

// 서비스 그리드 — 홈 화면과 동일한 3D 이모지 아이콘 사용
// 전원일기 카테고리: 농기구 / 로컬푸드 / 경매 / 대여 / 일손 / 마을소식 / 무료나눔
const SERVICES: Array<{
  label: string
  img: any
  href: string
}> = [
  { label: "농기구/자재", img: require("@/assets/icons/category/shopping-cart.png"),   href: "/secondhand" },
  { label: "로컬푸드",    img: require("@/assets/icons/category/leafy-green.png"),     href: "/local-food" },
  { label: "경매장",      img: require("@/assets/icons/category/handshake.png"),       href: "/auction" },
  { label: "농기구 대여", img: require("@/assets/icons/category/delivery-truck.png"),  href: "/rental" },
  { label: "일손찾기",    img: require("@/assets/icons/category/briefcase.png"),       href: "/jobs" },
  { label: "마을소식",    img: require("@/assets/icons/category/speech-balloon.png"), href: "/board" },
  { label: "무료나눔",    img: require("@/assets/icons/category/party-popper.png"),    href: "/sharing" },
]

// 거래 메뉴 — badgeKey 는 useUnreadCounts 의 카테고리와 매핑 (없으면 점 없음)
const TX_MENU: Array<{
  label: string
  icon: keyof typeof Ionicons.glyphMap
  href: string
  badgeKey?: "orders" | "sales" | "posts" | "notice"
}> = [
  { label: "내 거래",    icon: "construct-outline",     href: "/mypage/trades" },
  { label: "판매내역",   icon: "receipt-outline",       href: "/mypage/sales",  badgeKey: "sales" },
  { label: "구매내역",   icon: "bag-outline",           href: "/mypage/orders", badgeKey: "orders" },
  { label: "내 글 관리", icon: "document-text-outline", href: "/mypage/posts",  badgeKey: "posts" },
  { label: "포인트 내역", icon: "wallet-outline",        href: "/mypage/points" },
]

// 고객지원 메뉴 — HamburgerMenu 의 지원/정책 섹션과 동일 routes
const SUPPORT_MENU: Array<{
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  href: string
  badgeKey?: "orders" | "sales" | "posts" | "notice"
}> = [
  { label: "공지사항",         icon: "megaphone-outline",   href: "/support/notice", badgeKey: "notice" },
  { label: "자주 묻는 질문",   icon: "help-circle-outline", href: "/support/faq" },
  { label: "고객센터",         icon: "mail-outline",        href: "/support/support" },
  { label: "포인트 제도",      icon: "cash-outline",        iconColor: "#f59e0b", href: "/support/points-guide" },
  { label: "이용약관",         icon: "document-text-outline", href: "/legal/terms" },
  { label: "개인정보처리방침", icon: "shield-checkmark-outline", href: "/legal/privacy" },
]



export default function MyPageTab() {
  const styles = useThemedStyles(makeStyles)
  const { user, signOut } = useAuth()
  const plazaId = useCurrentPlaza()
  const plaza = useCurrentPlazaState()
  const router = useRouter()
  // 인메모리 프리페치 캐시에서 동기 초기값 — 탭 진입 시 즉시 렌더
  const prefetched = getMyPageCache()
  const [card, setCard] = useState<ProfileCardData | null>(prefetched?.card ?? null)
  const [cardLoaded, setCardLoaded] = useState(!!prefetched)
  const [freshLoaded, setFreshLoaded] = useState(!!prefetched)
  const [points, setPoints] = useState<number>(prefetched?.points ?? 0)
  const [refreshing, setRefreshing] = useState(false)
  const unread = useUnreadCounts(user?.id ?? null)

  // 광장 전환 시 이전 프로필/포인트 즉시 초기화
  const prevPlazaRef = useRef(plazaId)
  useEffect(() => {
    if (prevPlazaRef.current === plazaId) return
    prevPlazaRef.current = plazaId
    clearMyPageCache()
    setCard(null)
    setPoints(0)
    setCardLoaded(false)
    setFreshLoaded(false)
  }, [plazaId])

  // 프로필/포인트 직접 로드 — prefetchMyPage 의 dedup 가드를 우회하여 항상 최신 데이터
  const load = useCallback(async () => {
    if (!user?.id) return
    try {
      const supabase = getSupabase()
      const [c, p] = await Promise.all([
        getProfileCard(supabase, user.id, plazaId ?? undefined),
        getPointBalance(supabase, user.id, plazaId ?? undefined),
      ])
      setCard(c)
      setPoints(p ?? 0)
    } catch {
      /* noop */
    } finally {
      setCardLoaded(true)
      setFreshLoaded(true)
    }
  }, [user?.id, plazaId])

  useEffect(() => {
    load()
  }, [load])

  // useFocusEffect 는 mount 시에도 fire — useEffect(load) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      load()
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  // 비로그인 — 안내 화면 (설정 아이콘 숨김)
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.emptyAuth}>
          <Ionicons name="person-circle-outline" size={64} color={lightColors.ink500} />
          <Text style={styles.emptyTitle}>로그인이 필요해요</Text>
          <Pressable
            style={styles.loginBtn}
            onPress={() => router.push("/auth/login" as any)}
          >
            <Text style={styles.loginBtnText}>로그인 / 회원가입</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ProfileCardData 필드는 nickname (DB profiles 테이블)
  // 프리페치로 card 가 이미 있으므로 닉네임 우선, 없을 때만 user_metadata 폴백
  const nickname =
    card?.nickname ||
    (user as any)?.user_metadata?.nickname ||
    (user as any)?.user_metadata?.username ||
    (cardLoaded ? (user as any)?.user_metadata?.full_name : "") ||
    (cardLoaded && user.email ? user.email.split("@")[0] : "") ||
    ""
  const avatar = card?.avatar_url || (cardLoaded ? (user as any)?.user_metadata?.avatar_url : null) || null
  const trustScore = card?.trustScore ?? null

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 녹색 프로필 헤더 (레퍼런스) */}
        <View style={styles.greenHeader}>
          <Pressable
            style={({ pressed }) => [styles.greenProfile, pressed && { opacity: 0.9 }]}
            onPress={() => router.push("/(tabs)/mypage-profile" as any)}
          >
            <View style={styles.greenAvatarWrap}>
              {avatar ? (
                <Image source={{ uri: avatar }} cachePolicy="memory-disk" style={styles.greenAvatar} />
              ) : (
                <View style={[styles.greenAvatar, styles.greenAvatarFallback]}>
                  <Ionicons name="person" size={36} color="#ffffff" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greenNickname} numberOfLines={1}>{nickname || "농부"}님</Text>
              <Text style={styles.greenSub}>{plaza.name} 회원</Text>
              {typeof trustScore === "number" && (
                <View style={styles.greenTrust}>
                  <Ionicons name="leaf" size={12} color="#ffffff" />
                  <Text style={styles.greenTrustText}>신뢰도 {trustScore}</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable style={styles.greenSettings} onPress={() => router.push("/mypage/settings" as any)} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color="#ffffff" />
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 10, marginTop: -14 }}>
        {/* 지역 미설정 배너 — fresh fetch 완료 후에만 표시 (캐시 기반 깜빡임 방지) */}
        {freshLoaded && (!card?.location || !card.location.trim()) && (
          <Pressable
            onPress={() => router.push("/mypage/edit" as any)}
            style={styles.regionBanner}
          >
            <Ionicons name="location-outline" size={20} color="#b45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.regionBannerTitle}>지역을 설정해주세요</Text>
              <Text style={styles.regionBannerSub}>
                활동 지역(시/군)을 설정하면 관심 글이 더 잘 보여요
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#b45309" />
          </Pressable>
        )}

        {/* Quick row — 내 글 / 관심목록 / 최근 본 글 (3분할) */}
        <View style={[styles.card, styles.quickCard]}>
          <Pressable
            style={styles.quickItem}
            onPress={() => router.push("/mypage/posts" as any)}
          >
            <Ionicons name="document-text-outline" size={22} color={lightColors.ink900} />
            <Text style={styles.quickLabel}>내 글</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable
            style={styles.quickItem}
            onPress={() => router.push("/mypage/favorites" as any)}
          >
            <Ionicons name="heart-outline" size={22} color={lightColors.ink900} />
            <Text style={styles.quickLabel}>관심목록</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable
            style={styles.quickItem}
            onPress={() => router.push("/mypage/recent" as any)}
          >
            <Ionicons name="time-outline" size={22} color={lightColors.ink900} />
            <Text style={styles.quickLabel}>최근 본 글</Text>
          </Pressable>
        </View>

        {/* 포인트 카드 — 충전 버튼 자리에 "적립·사용 내역" */}
        <View style={[styles.card, styles.pointCard]}>
          <View style={styles.pointHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.pointIcon}>
                <Ionicons name="diamond" size={14} color="#ffffff" />
              </View>
              <Text style={styles.pointBalance}>
                {points.toLocaleString()}
                <Text style={styles.pointUnit}> P</Text>
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/mypage/points" as any)}
              style={({ pressed }) => [
                styles.historyBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.historyBtnText}>적립·사용 내역</Text>
              <Ionicons name="chevron-forward" size={14} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* 서비스 그리드 — 포인트 아래 */}
        <View style={[styles.card, { padding: 16 }]}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>서비스</Text>
          </View>
          <View style={styles.servicesGrid}>
            {SERVICES.map((s) => (
              <Pressable
                key={s.label}
                style={({ pressed }) => [
                  styles.serviceItem,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => router.push(s.href as any)}
              >
                <View style={styles.serviceIcon}>
                  <Image source={s.img} style={styles.serviceImg} contentFit="contain" />
                </View>
                <Text style={styles.serviceLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 나의 거래 */}
        <View style={styles.card}>
          <View style={[styles.sectionHead, { paddingHorizontal: 16, paddingTop: 16 }]}>
            <Text style={styles.sectionTitle}>나의 거래</Text>
          </View>
          <View style={{ paddingBottom: 8 }}>
            {TX_MENU.map((m) => {
              const hasDot = m.badgeKey ? unread[m.badgeKey] > 0 : false
              return (
                <Pressable
                  key={m.label}
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: "#f8fafc" },
                  ]}
                  onPress={() => router.push(m.href as any)}
                >
                  <Ionicons name={m.icon} size={20} color={lightColors.ink900} />
                  <Text style={styles.menuLabel}>{m.label}</Text>
                  {hasDot && <View style={styles.menuDot} />}
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* 나의 관심 */}
        <View style={styles.card}>
          <View style={[styles.sectionHead, { paddingHorizontal: 16, paddingTop: 16 }]}>
            <Text style={styles.sectionTitle}>나의 관심</Text>
          </View>
          <View style={{ paddingBottom: 8 }}>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { backgroundColor: "#f8fafc" },
              ]}
              onPress={() => router.push("/mypage/favorites" as any)}
            >
              <Ionicons name="heart-outline" size={20} color={lightColors.ink900} />
              <Text style={styles.menuLabel}>관심목록</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { backgroundColor: "#f8fafc" },
              ]}
              onPress={() => router.push("/mypage/followers" as any)}
            >
              <Ionicons name="people-outline" size={20} color={lightColors.ink900} />
              <Text style={styles.menuLabel}>팔로우</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
            </Pressable>
          </View>
        </View>

        {/* 고객지원 */}
        <View style={styles.card}>
          <View style={[styles.sectionHead, { paddingHorizontal: 16, paddingTop: 16 }]}>
            <Text style={styles.sectionTitle}>고객지원</Text>
          </View>
          <View style={{ paddingBottom: 8 }}>
            {SUPPORT_MENU.map((m) => {
              const hasDot = m.badgeKey ? unread[m.badgeKey] > 0 : false
              return (
                <Pressable
                  key={m.label}
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: "#f8fafc" },
                  ]}
                  onPress={() => router.push(m.href as any)}
                >
                  <Ionicons
                    name={m.icon}
                    size={20}
                    color={m.iconColor ?? lightColors.ink900}
                  />
                  <Text style={styles.menuLabel}>{m.label}</Text>
                  {hasDot && <View style={styles.menuDot} />}
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* 로그아웃 */}
        {user && (
          <Pressable
            onPress={async () => {
              const doLogout = async () => {
                await signOut()
                router.replace("/(tabs)" as any)
              }
              // RN Web 에서는 Alert.alert 버튼 콜백이 실행되지 않아 window.confirm 사용
              if (Platform.OS === "web") {
                const ok = typeof window !== "undefined" ? window.confirm("정말 로그아웃 하시겠어요?") : true
                if (ok) await doLogout()
                return
              }
              Alert.alert("로그아웃", "정말 로그아웃 하시겠어요?", [
                { text: "취소", style: "cancel" },
                { text: "로그아웃", style: "destructive", onPress: doLogout },
              ])
            }}
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="log-out-outline" size={16} color={lightColors.ink500} style={{ marginRight: 4 }} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f6f0" },

  // 녹색 프로필 헤더 (레퍼런스)
  greenHeader: {
    backgroundColor: "#225a39",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  greenProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  greenAvatarWrap: { width: 64, height: 64, borderRadius: 32, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" },
  greenAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)" },
  greenAvatarFallback: { alignItems: "center", justifyContent: "center" },
  greenNickname: { fontSize: 22, fontWeight: "900", color: "#ffffff" },
  greenSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 3 },
  greenTrust: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 6, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  greenTrustText: { fontSize: 11, fontWeight: "700", color: "#ffffff" },
  greenSettings: { padding: 4, marginLeft: 6 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: "#f1f5f9",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
  },

  // 지역 미설정 배너
  regionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: 10,
  },
  regionBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
  },
  regionBannerSub: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 2,
  },

  // 프로필 카드
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  avatarWrap: {
    width: 48, height: 48,
    borderRadius: 999,
    overflow: "hidden",
  },
  avatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: "#e2e8f0" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  nickname: { fontSize: 17, fontWeight: "800", color: colors.ink900 },
  profileSub: { fontSize: 11, color: colors.ink500 },
  tempBadge: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tempText: { fontSize: 11, color: "#ea580c", fontWeight: "700" },

  // 포인트 카드
  pointCard: { padding: 16 },
  pointHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pointIcon: {
    width: 22, height: 22, borderRadius: 999,
    backgroundColor: "#f59e0b",
    alignItems: "center", justifyContent: "center",
  },
  pointBalance: { fontSize: 20, fontWeight: "800", color: colors.ink900 },
  pointUnit: { fontSize: 13, fontWeight: "700", color: colors.ink500 },
  chargeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.ink900,
  },
  chargeBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.ink900,
  },
  historyBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  pointFooter: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pointAction: { flex: 1, alignItems: "center", paddingVertical: 4 },
  pointActionText: { fontSize: 12, color: colors.ink700 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  // 서비스 그리드
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.ink900 },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 0,
    rowGap: 14,
  },
  serviceItem: {
    width: "25%",
    alignItems: "center",
    gap: 6,
  },
  serviceIcon: {
    width: 44, height: 44,
    alignItems: "center", justifyContent: "center",
  },
  serviceImg: {
    width: 36, height: 36,
  },
  serviceLabel: {
    fontSize: 12, color: colors.ink900, fontWeight: "600",
  },

  // Quick row
  quickCard: {
    flexDirection: "row",
    paddingVertical: 14,
  },
  quickItem: { flex: 1, alignItems: "center", gap: 6 },
  quickLabel: { fontSize: 12, color: colors.ink900, fontWeight: "600" },
  quickDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  quickDot: {
    position: "absolute",
    top: 0,
    right: -2,
    width: 6, height: 6,
    borderRadius: 999,
    backgroundColor: "#f97316",
  },

  // 메뉴 row
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLabel: { fontSize: 14, color: colors.ink900, fontWeight: "500" },
  menuDot: {
    width: 6, height: 6,
    borderRadius: 999,
    backgroundColor: "#f97316",
    marginLeft: -6,
    marginBottom: 12,
  },

  // 비로그인
  emptyAuth: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.ink900 },
  loginBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  loginBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
  },
  logoutText: {
    fontSize: 14,
    color: colors.ink700,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
