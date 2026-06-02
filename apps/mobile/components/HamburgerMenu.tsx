/**
 * 햄버거 메뉴 — 광장 web HeaderActions 의 햄버거 DropdownMenu 미러.
 *
 * 정독 매핑 (apps/web/components/header-actions.tsx, line 475+):
 *   - {도시명} 정보 섹션:
 *     · 춘천 소식 (Newspaper, emerald-600)
 *     · 화장실 (MapPin, blue-500)
 *     · 주유소 (Fuel, rose-500)
 *   - 우리동네 섹션:
 *     · 부동산 (expandable: 공인중개사 / 일반인 / 구해주세요)
 *     · 홈즈 (expandable: 인테리어 / 이사 / 청소 / 수리)
 *     · 신장개업
 *     · 모임
 *   - 동네장터 섹션:
 *     · 중고거래 / 나눔 / 구인구직 / 공동구매 / 로컬푸드
 *   - 게시판 섹션:
 *     · 자유게시판 / 식당리뷰 / etc
 *
 * 디자인:
 *   - Modal 우상단 280px width
 *   - 섹션 헤더: text-xs font-bold text-primary uppercase tracking-wider
 *   - 각 항목: 40x40 round bg-{color}/10 + icon, label text-sm + helper text-[10px]
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
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"

interface Props {
  visible: boolean
  onClose: () => void
  cityName?: string
}

interface CategoryItem {
  icon: any
  iconColor: string
  bgColor: string
  label: string
  helper: string
  route: string
}

interface ExpandableItem {
  key: string
  icon: any
  iconColor: string
  bgColor: string
  label: string
  helper: string
  children: { icon: any; iconColor: string; label: string; route: string }[]
}

export function HamburgerMenu({ visible, onClose, cityName = "춘천" }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [holmesOpen, setHolmesOpen] = useState(false)
  // 관리자 페이지는 웹에서만 접근 — 모바일 어드민 제거됨

  function go(route: string) {
    onClose()
    setTimeout(() => router.push(route as any), 50)
  }

  function openWeb(path: string, title: string) {
    onClose()
    setTimeout(() => {
      // 광장별 admin 은 광장 서브도메인 (예: chuncheon.gwangjang.app/admin)
      // plaza 미선택이면 hub (www) 로 폴백
      const host = plazaId ? `${plazaId}.gwangjang.app` : "www.gwangjang.app"
      const url = `https://${host}${path}`
      router.push({
        pathname: "/webview",
        params: { url, title },
      } as any)
    }, 50)
  }

  // {도시} 정보 섹션
  const cityItems: CategoryItem[] = [
    {
      icon: "newspaper",
      iconColor: "#059669", // emerald-600
      bgColor: "rgba(16,185,129,0.1)",
      label: `${cityName} 소식`,
      helper: "지역 뉴스 · 행사 · 날씨",
      route: "/news",
    },
    {
      icon: "location",
      iconColor: "#3b82f6", // blue-500
      bgColor: "rgba(59,130,246,0.1)",
      label: "공중 화장실",
      helper: "근처 깨끗한 화장실",
      route: "/toilets",
    },
    {
      icon: "car",
      iconColor: "#f43f5e", // rose-500
      bgColor: "rgba(244,63,94,0.1)",
      label: "주유소 가격",
      helper: "최저가 주유소 찾기",
      route: "/gas-stations",
    },
  ]

  // 우리동네 expandable 항목
  const propertyItem: ExpandableItem = {
    key: "property",
    icon: "business",
    iconColor: lightColors.primary,
    bgColor: lightColors.primary + "1A",
    label: "동네 부동산",
    helper: "매매 · 전세 · 월세 매물",
    children: [
      { icon: "briefcase",     iconColor: "#3b82f6", label: "공인중개사 매물", route: "/property?seller=agent" },
      { icon: "person-circle", iconColor: "#f59e0b", label: "일반인 매물",     route: "/property?seller=individual" },
      { icon: "hand-left",     iconColor: "#f43f5e", label: "구해주세요(의뢰)", route: "/requests" },
    ],
  }

  const holmesItem: ExpandableItem = {
    key: "holmes",
    icon: "home",
    iconColor: "#0d9488", // teal-600
    bgColor: "rgba(20,184,166,0.1)",
    label: "홈즈",
    helper: "인테리어 · 이사 · 청소 · 수리",
    children: [
      { icon: "color-palette", iconColor: "#9333ea", label: "인테리어", route: "/interior" },
      { icon: "car-sport",     iconColor: "#ca8a04", label: "이사",     route: "/moving" },
      { icon: "sparkles",      iconColor: "#ec4899", label: "청소",     route: "/cleaning" },
      { icon: "construct",     iconColor: "#ea580c", label: "수리",     route: "/repair" },
      { icon: "help-circle",   iconColor: "#10b981", label: "도와주세요(의뢰)", route: "/service-requests" },
    ],
  }

  const dongnaeFlat: CategoryItem[] = [
    {
      icon: "storefront",
      iconColor: "#f59e0b", // amber-500
      bgColor: "rgba(245,158,11,0.1)",
      label: "신장개업",
      helper: "동네 새 가게 소식",
      route: "/new-store",
    },
    {
      icon: "people",
      iconColor: "#6366f1", // indigo-500
      bgColor: "rgba(99,102,241,0.1)",
      label: "모임",
      helper: "동호회 · 운동 모임",
      route: "/clubs",
    },
  ]

  // 동네장터 섹션
  const marketItems: CategoryItem[] = [
    {
      icon: "bag-handle",
      iconColor: "#d97706", // amber-600
      bgColor: "rgba(217,119,6,0.1)",
      label: "중고거래",
      helper: "안전한 동네 직거래",
      route: "/secondhand",
    },
    {
      icon: "gift",
      iconColor: "#ef4444", // red-500
      bgColor: "rgba(239,68,68,0.1)",
      label: "나눔",
      helper: "이웃과 함께 나눠요",
      route: "/sharing",
    },
    {
      icon: "briefcase",
      iconColor: "#0d9488", // teal-600
      bgColor: "rgba(13,148,136,0.1)",
      label: "구인구직",
      helper: "동네 일자리",
      route: "/jobs",
    },
    {
      icon: "cart",
      iconColor: "#3b82f6", // blue-500
      bgColor: "rgba(59,130,246,0.1)",
      label: "공동구매",
      helper: "함께 사면 더 저렴",
      route: "/group-buying",
    },
    {
      icon: "leaf",
      iconColor: "#22c55e", // green-500
      bgColor: "rgba(34,197,94,0.1)",
      label: "로컬푸드",
      helper: "신선한 동네 농산물",
      route: "/local-food",
    },
  ]

  // 게시판 섹션 — web 5개 카테고리 1:1
  const boardItems: CategoryItem[] = [
    {
      icon: "chatbubbles",
      iconColor: "#3b82f6", // blue-500
      bgColor: "rgba(59,130,246,0.1)",
      label: "자유게시판",
      helper: "동네 이야기 자유롭게",
      route: "/board?category=free",
    },
    {
      icon: "restaurant",
      iconColor: "#f97316", // orange-500
      bgColor: "rgba(249,115,22,0.1)",
      label: "맛집 추천",
      helper: "기분좋은 가게",
      route: "/board?category=restaurant",
    },
    {
      icon: "bulb",
      iconColor: "#eab308", // yellow-500 (web Lightbulb)
      bgColor: "rgba(234,179,8,0.1)",
      label: "생활 정보",
      helper: "꿀팁 모음",
      route: "/board?category=living",
    },
    {
      icon: "camera",
      iconColor: "#ec4899", // pink-500 (web Camera)
      bgColor: "rgba(236,72,153,0.1)",
      label: "일상 공유",
      helper: "오늘의 한 컷",
      route: "/board?category=daily",
    },
    {
      icon: "help-circle",
      iconColor: "#a855f7", // purple-500 (web HelpCircle)
      bgColor: "rgba(168,85,247,0.1)",
      label: "질문 답변",
      helper: "동네에 물어보기",
      route: "/board?category=qna",
    },
  ]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 8, paddingBottom: 24 }}
            showsVerticalScrollIndicator={true}
          >

            {/* {도시} 정보 */}
            <Text style={styles.sectionLabel}>{cityName} 정보</Text>
            {cityItems.map((it) => (
              <CategoryRow
                key={it.label}
                item={it}
                onPress={() => go(it.route)}
              />
            ))}

            <View style={styles.sep} />

            {/* 우리동네 */}
            <Text style={styles.sectionLabel}>우리동네</Text>
            <ExpandableRow
              item={propertyItem}
              open={propertyOpen}
              onToggle={() => setPropertyOpen((v) => !v)}
              onChildPress={(route) => go(route)}
            />
            <ExpandableRow
              item={holmesItem}
              open={holmesOpen}
              onToggle={() => setHolmesOpen((v) => !v)}
              onChildPress={(route) => go(route)}
            />
            {dongnaeFlat.map((it) => (
              <CategoryRow
                key={it.label}
                item={it}
                onPress={() => go(it.route)}
              />
            ))}

            <View style={styles.sep} />

            {/* 동네장터 */}
            <Text style={styles.sectionLabel}>동네장터</Text>
            {marketItems.map((it) => (
              <CategoryRow
                key={it.label}
                item={it}
                onPress={() => go(it.route)}
              />
            ))}

            <View style={styles.sep} />

            {/* 게시판 */}
            <Text style={styles.sectionLabel}>게시판</Text>
            {boardItems.map((it) => (
              <CategoryRow
                key={it.label}
                item={it}
                onPress={() => go(it.route)}
              />
            ))}

            <View style={styles.sep} />

            {/* 지원 — 공지/포인트/FAQ/고객센터 (web 미러) */}
            <SimpleRow
              icon="megaphone-outline"
              iconColor={lightColors.ink500}
              label="공지사항"
              onPress={() => go("/support/notice")}
            />
            <SimpleRow
              icon="cash-outline"
              iconColor="#f59e0b"
              label="포인트 제도"
              onPress={() => go("/support/points-guide")}
            />
            <SimpleRow
              icon="help-circle-outline"
              iconColor={lightColors.ink500}
              label="자주 묻는 질문"
              onPress={() => go("/support/faq")}
            />
            <SimpleRow
              icon="mail-outline"
              iconColor={lightColors.ink500}
              label="고객센터"
              onPress={() => go("/support/support")}
            />

            <View style={styles.sep} />

            {/* 정책 */}
            <SimpleRow
              icon="document-text-outline"
              iconColor={lightColors.ink500}
              label="이용약관"
              muted
              onPress={() => go("/legal/terms")}
            />
            <SimpleRow
              icon="shield-outline"
              iconColor={lightColors.ink500}
              label="개인정보처리방침"
              muted
              onPress={() => go("/legal/privacy")}
            />

            {/* 관리자 페이지는 웹에서만 접근 */}

          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function SimpleRow({
  icon,
  iconColor,
  label,
  onPress,
  muted,
  primary,
}: {
  icon: any
  iconColor: string
  label: string
  onPress: () => void
  muted?: boolean
  primary?: boolean
}) {
  return (
    <Pressable style={styles.simpleRow} onPress={onPress}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text
        style={[
          styles.simpleRowLabel,
          muted && { color: lightColors.ink500, fontSize: 13 },
          primary && { color: lightColors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function CategoryRow({
  item,
  onPress,
}: {
  item: CategoryItem
  onPress: () => void
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.iconBox}>
        <Ionicons name={item.icon} size={28} color={item.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        <Text style={styles.rowHelper}>{item.helper}</Text>
      </View>
    </Pressable>
  )
}

function ExpandableRow({
  item,
  open,
  onToggle,
  onChildPress,
}: {
  item: ExpandableItem
  open: boolean
  onToggle: () => void
  onChildPress: (route: string) => void
}) {
  return (
    <View>
      <Pressable style={styles.row} onPress={onToggle}>
        <View style={styles.iconBox}>
          <Ionicons name={item.icon} size={28} color={item.iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Text style={styles.rowHelper}>{item.helper}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={lightColors.ink500}
        />
      </Pressable>
      {open && (
        <View style={styles.childWrap}>
          {item.children.map((c) => (
            <Pressable
              key={c.label}
              style={styles.childRow}
              onPress={() => onChildPress(c.route)}
            >
              <Ionicons name={c.icon} size={22} color={c.iconColor} />
              <Text style={styles.childLabel}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
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
    marginBottom: 16,
    flex: 1,                     // 가능한 최대 높이 차지
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },

  // Row — web py-2.5 px-3 rounded-lg flex gap-3
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  iconBox: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    // 배경 제거 — 아이콘만 표시 (사용자 피드백)
  },
  rowLabel: {
    fontSize: 14, fontWeight: "500",
    color: colors.ink900,
  },
  rowHelper: {
    fontSize: 10, color: colors.ink500,
    marginTop: 1,
  },

  // Expandable children — web ml-11 pl-3 border-l-2 border-muted
  childWrap: {
    marginLeft: 44,
    paddingLeft: 12,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  childLabel: {
    fontSize: 14, fontWeight: "500",
    color: colors.ink900,
  },

  // 지원/정책/관리자 — 작은 행
  simpleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  simpleRowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.ink900,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
