/**
 * 도메인 화면 공통 셸 — 경매장·대여처럼 DomainListScreen(공용 리스트) 을 못 쓰는
 * 커스텀 데이터 화면이 농기구/자재와 "똑같은 크롬"을 갖도록 묶어주는 래퍼.
 *
 * 헤더(뒤로+제목+검색·로그인·햄버거) + 도메인 탭바 + 사진 히어로 + 면책 띠를
 * DomainListScreen 과 1:1 동일한 스타일/치수로 렌더. 본문(children)만 도메인별로 다름.
 *
 * → 농기구/자재 → 경매장 → 대여 탭을 오갈 때 상단 셸·배경·여백·히어로가 동일하게 유지됨.
 */
import type { ReactNode } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { ImageBackground } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { HeaderActions } from "@/components/HeaderActions"
import { DomainTabBar } from "@/components/DomainTabBar"
import { PlatformDisclaimerBand } from "@/components/legal/PlatformDisclaimerBand"

const GREEN = "#225a39"

export function DomainScreenShell({
  title,
  tab,
  heroImage,
  heroIcon,
  heroSub,
  refreshing = false,
  onRefresh,
  children,
}: {
  /** 헤더 제목 (= 히어로 제목) */
  title: string
  /** DomainTabBar 현재 탭 key */
  tab: string
  /** 히어로 배경 사진 (require) */
  heroImage: any
  /** 히어로 아이콘 (Ionicons) */
  heroIcon: any
  /** 히어로 부제 */
  heroSub?: string
  refreshing?: boolean
  onRefresh?: () => void
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* 헤더 — DomainListScreen 과 동일 */}
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.barTitle}>{title}</Text>
        <HeaderActions />
      </View>

      {/* 도메인 탭 바 */}
      <DomainTabBar current={tab} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 8 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} />
          ) : undefined
        }
      >
        {/* 사진 히어로 — DomainListScreen heroImage 와 동일 (130 / 34 / 20 / 13) */}
        <ImageBackground source={heroImage} style={styles.hero} contentFit="cover">
          <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.6)"]} style={styles.heroOverlay}>
            <Ionicons name={heroIcon} size={34} color="#fff" />
            <Text style={styles.heroTitle}>{title}</Text>
            {heroSub ? <Text style={styles.heroSub}>{heroSub}</Text> : null}
          </LinearGradient>
        </ImageBackground>

        {children}

        {/* 통신판매중개자 면책 띠 — 각 도메인 메인 하단 (전상법 제20조의2) */}
        <PlatformDisclaimerBand />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
  },
  barTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900, flex: 1, lineHeight: 24, marginLeft: 4 },
  hero: { width: "100%", height: 130 },
  heroOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 6 },
  heroSub: { color: "#fff", fontSize: 13, marginTop: 2 },
})
