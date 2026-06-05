/**
 * DomainSection & TabbedDomainGroup — 홈 화면 도메인 미리보기 카드 섹션.
 * Extracted from apps/mobile/app/(tabs)/index.tsx.
 */
import { memo, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors, spacing } from "@gwangjang/tokens"
import { useRouter } from "expo-router"
import { ScrollFadeHint } from "@/components/ScrollFadeHint"
import { useHorizontalEnd } from "@/lib/use-horizontal-end"
import type { DomainPost } from "./constants"

export interface DomainTabConfig {
  key: string
  title: string
  icon: string
  color: string
  posts: DomainPost[]
  basePath: string
  showPrice?: boolean
  showDiscount?: boolean
  useStoreName?: boolean
  onMore: () => void
}

export const TabbedDomainGroup = memo(function TabbedDomainGroup({ tabs }: { tabs: DomainTabConfig[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.key)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  if (!current) return null

  return (
    <View style={domainTabStyles.section}>
      {/* 세그먼트 토글 + 우측 전체보기 — 한 줄 (iOS Toss 톤) */}
      <View style={domainTabStyles.segmentRow}>
        <View style={domainTabStyles.segment}>
          {tabs.map((t) => {
            const on = active === t.key
            return (
              <Pressable
                key={t.key}
                onPress={() => setActive(t.key)}
                style={[
                  domainTabStyles.segItem,
                  on && domainTabStyles.segItemActive,
                ]}
              >
                <Ionicons
                  name={t.icon as any}
                  size={13}
                  color={on ? lightColors.ink900 : lightColors.ink500}
                />
                <Text
                  style={[
                    domainTabStyles.segText,
                    on
                      ? { color: lightColors.ink900, fontWeight: "700" }
                      : { color: lightColors.ink500 },
                  ]}
                >
                  {t.title}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Pressable onPress={current.onMore} hitSlop={8} style={domainTabStyles.viewAll}>
          <Text style={domainTabStyles.viewAllText}>전체보기</Text>
          <Ionicons name="chevron-forward" size={12} color={lightColors.primary} />
        </Pressable>
      </View>

      {/* 활성 탭의 컨텐츠 — title/header 모두 hideHeader 로 제거 */}
      <DomainSection
        title={current.title}
        icon={current.icon}
        color={current.color}
        posts={current.posts}
        basePath={current.basePath}
        showPrice={current.showPrice}
        showDiscount={current.showDiscount}
        useStoreName={current.useStoreName}
        onMore={current.onMore}
        hideHeader
      />
    </View>
  )
})

export const domainTabStyles = StyleSheet.create({
  section: {
    marginTop: 20,
  },
  segmentRow: {
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    borderRadius: 999,
    padding: 3,
  },
  segItem: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999,
  },
  segItemActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segText: { fontSize: 13, fontWeight: "500" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontSize: 12, color: lightColors.primary, fontWeight: "600" },
})

export const DomainSection = memo(function DomainSection({
  title,
  icon,
  color,
  posts,
  basePath,
  showPrice,
  showDiscount,
  useStoreName,
  onMore,
  hideHeader,
}: {
  title: string
  icon: string
  color: string
  posts: DomainPost[]
  basePath: string
  showPrice?: boolean
  showDiscount?: boolean
  useStoreName?: boolean
  onMore: () => void
  hideHeader?: boolean
}) {
  const router = useRouter()
  // 가로 스크롤 끝 표시
  const domainScrollRef = useRef<ScrollView>(null)
  const domainEnd = useHorizontalEnd()
  if (posts.length === 0) return null
  return (
    <>
      {!hideHeader && (
        <View style={domainSectionStyles.sectionHead}>
          {/* 단독 pill — 활성 모임 segment 와 정확히 동일 */}
          <View style={domainSectionStyles.sectionStandalonePill}>
            <Ionicons name={icon as any} size={13} color={lightColors.ink900} />
            <Text style={domainSectionStyles.sectionStandalonePillText}>{title}</Text>
          </View>
          <Pressable onPress={onMore} style={domainSectionStyles.viewAll}>
            <Text style={domainSectionStyles.viewAllText}>전체보기</Text>
            <Ionicons name="chevron-forward" size={12} color={lightColors.primary} />
          </Pressable>
        </View>
      )}
      <View style={{ position: "relative" }}>
      <ScrollView
        ref={domainScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[4], gap: spacing[3] }}
        onScroll={domainEnd.onScroll}
        onContentSizeChange={(w) => domainEnd.onContentSize(w)}
        onLayout={(e) => domainEnd.onLayout(e.nativeEvent.layout.width)}
        scrollEventThrottle={32}
      >
        {posts.slice(0, 7).map((p) => {
          const thumb = p.images?.[0] ?? p.thumbnail ?? null
          const labelTitle = useStoreName ? p.store_name ?? p.title : p.title
          // 가격 표기 — 할인 노출 도메인은 [퍼센트] + 원가취소선 + 최종가, 아니면 최종가만
          const showsDiscount =
            !!showDiscount && !!p.original_price && !!p.group_price &&
            p.original_price > p.group_price
          const discountPct = showsDiscount
            ? Math.round(((p.original_price! - p.group_price!) / p.original_price!) * 100)
            : 0
          const finalPrice = showsDiscount
            ? p.group_price!
            : (p.group_price ?? p.price ?? null)
          const originalPrice = showsDiscount ? p.original_price! : null
          const hasPrice = showsDiscount || (showPrice && typeof finalPrice === "number")
          // 도메인별 sub info (홈 카드용 — basePath 로 분기)
          const any = p as any
          let subInfo: { text: string; color?: string } | null = null
          if (basePath === "/sharing" && any.location) {
            subInfo = { text: any.location }
          } else if (basePath === "/jobs") {
            const wage = any.hourly_wage ?? any.hourlyWage
            const wageText =
              typeof wage === "number" && wage > 0
                ? `시급 ${wage.toLocaleString()}원`
                : null
            const daysText = any.work_days ? String(any.work_days) : null
            if (wageText || daysText) {
              subInfo = {
                text: "__jobs__",
                color,
                jobsDays: daysText,
                jobsWage: wageText,
              } as any
            }
          }
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`${basePath}/${p.id}` as any)}
              style={({ pressed }) => [
                domainSectionStyles.domainCard,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={domainSectionStyles.domainThumb} cachePolicy="memory-disk" transition={150} contentFit="cover" />
              ) : (
                <View style={[domainSectionStyles.domainThumb, { overflow: "hidden" }]}>
                  <LinearGradient
                    colors={[color + "33", color + "55", color + "22"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {/* 장식용 큰 원 (좌상/우하) */}
                  <View
                    style={{
                      position: "absolute",
                      top: -22, left: -22,
                      width: 70, height: 70, borderRadius: 999,
                      backgroundColor: color + "33",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      bottom: -28, right: -16,
                      width: 60, height: 60, borderRadius: 999,
                      backgroundColor: color + "22",
                    }}
                  />
                  {/* 흰 아이콘 박스 가운데 */}
                  <View
                    style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, bottom: 0,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 44, height: 44, borderRadius: 14,
                        backgroundColor: "rgba(255,255,255,0.9)",
                        alignItems: "center", justifyContent: "center",
                        shadowColor: color, shadowOpacity: 0.25, shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                      }}
                    >
                      <Ionicons name={icon as any} size={22} color={color} />
                    </View>
                  </View>
                </View>
              )}
              <Text style={domainSectionStyles.domainTitle} numberOfLines={2}>{labelTitle}</Text>
              {subInfo && (subInfo as any).text === "__clubs__" ? (
                <View style={domainSectionStyles.domainClubsRow}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: "500",
                      color: lightColors.ink500,
                      lineHeight: 20,
                      textAlignVertical: "center",
                      includeFontPadding: false,
                    }}
                    numberOfLines={1}
                  >
                    {(subInfo as any).clubsDate ?? ""}
                  </Text>
                  {!!(subInfo as any).clubsMembers && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        lineHeight: 20,
                        textAlignVertical: "center",
                        includeFontPadding: false,
                        color: (subInfo as any).clubsIsFull
                          ? lightColors.ink500
                          : (subInfo.color ?? color),
                      }}
                      numberOfLines={1}
                    >
                      {(subInfo as any).clubsMembers}
                    </Text>
                  )}
                </View>
              ) : subInfo && (subInfo as any).text === "__jobs__" ? (
                <View style={domainSectionStyles.domainClubsRow}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: "500",
                      color: lightColors.ink500,
                      lineHeight: 20,
                      textAlignVertical: "center",
                      includeFontPadding: false,
                    }}
                    numberOfLines={1}
                  >
                    {(subInfo as any).jobsDays ?? ""}
                  </Text>
                  {!!(subInfo as any).jobsWage && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: subInfo.color ?? color,
                        lineHeight: 20,
                        textAlignVertical: "center",
                        includeFontPadding: false,
                      }}
                      numberOfLines={1}
                    >
                      {(subInfo as any).jobsWage}
                    </Text>
                  )}
                </View>
              ) : subInfo ? (
                <Text
                  style={[
                    domainSectionStyles.domainPrice,
                    subInfo.color ? { color: subInfo.color } : { color: lightColors.ink500 },
                  ]}
                  numberOfLines={1}
                >
                  {subInfo.text}
                </Text>
              ) : null}
              {showsDiscount ? (
                <View style={domainSectionStyles.domainPriceRow}>
                  <Text style={domainSectionStyles.domainDiscountPct}>{discountPct}%</Text>
                  <Text style={domainSectionStyles.domainOriginalPrice} numberOfLines={1}>
                    {originalPrice!.toLocaleString()}
                  </Text>
                  <Text style={[domainSectionStyles.domainFinalPrice, { color }]} numberOfLines={1}>
                    {(finalPrice ?? 0).toLocaleString()}원
                  </Text>
                </View>
              ) : basePath === "/local-food" && hasPrice ? (
                <View style={domainSectionStyles.domainPriceRow}>
                  <Text
                    style={domainSectionStyles.domainFarmName}
                    numberOfLines={1}
                  >
                    {(any.farm_name as string | null)?.trim() || "농가"}
                  </Text>
                  <Text style={[domainSectionStyles.domainFinalPrice, { color }]} numberOfLines={1}>
                    {(finalPrice ?? 0).toLocaleString()}원
                  </Text>
                </View>
              ) : basePath === "/secondhand" && hasPrice ? (
                <View style={domainSectionStyles.domainPriceRow}>
                  <Text style={domainSectionStyles.domainFarmName} numberOfLines={1}>
                    {(any.condition as string | null)?.trim() || "상태 미입력"}
                  </Text>
                  <Text style={[domainSectionStyles.domainFinalPrice, { color }]} numberOfLines={1}>
                    {(finalPrice ?? 0).toLocaleString()}원
                  </Text>
                </View>
              ) : hasPrice ? (
                <Text style={[domainSectionStyles.domainPrice, { color }]} numberOfLines={1}>
                  {(finalPrice ?? 0).toLocaleString()}원
                </Text>
              ) : !subInfo ? (
                <View style={domainSectionStyles.domainPriceFiller} />
              ) : null}
            </Pressable>
          )
        })}
        {/* "더 보기" 카드 — 가로 슬라이드 끝 */}
        <Pressable
          onPress={onMore}
          style={({ pressed }) => [
            domainSectionStyles.domainMoreCard,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={[domainSectionStyles.domainMoreIcon, { backgroundColor: color + "1A" }]}>
            <Ionicons name="arrow-forward" size={20} color={color} />
          </View>
          <Text style={domainSectionStyles.domainMoreText}>더 보기</Text>
        </Pressable>
      </ScrollView>
      <ScrollFadeHint atEnd={domainEnd.atEnd} onPress={() => domainEnd.advance(domainScrollRef)} />
      </View>
    </>
  )
})

// DomainSection 에서 사용하는 스타일 — index.tsx 의 makeStyles 에서 가져온 것
// lightColors 를 하드코딩 (DomainSection 은 항상 라이트 모드에서 사용)
const domainSectionStyles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingTop: 18, paddingBottom: spacing[2],
    zIndex: 50,
  },
  sectionStandalonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#eef0f3",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sectionStandalonePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontSize: 12, color: lightColors.primary, fontWeight: "600" },
  domainCard: {
    width: 150,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  domainThumb: {
    width: "100%", height: 140,
    backgroundColor: lightColors.muted,
  },
  domainTitle: {
    fontSize: 12, color: lightColors.ink900,
    marginTop: 6, fontWeight: "600",
    paddingHorizontal: 8,
    lineHeight: 16,
    height: 40,
  },
  domainClubsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 8,
    marginTop: 6,
    marginBottom: 8,
    height: 20,
  },
  domainPrice: {
    fontSize: 12, fontWeight: "700",
    marginTop: 6, marginBottom: 8,
    paddingHorizontal: 8,
    height: 20,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  domainPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 8,
    height: 20,
    overflow: "hidden",
  },
  domainPriceFiller: {
    height: 20,
    marginTop: 6,
    marginBottom: 8,
  },
  domainDiscountPct: {
    fontSize: 12,
    fontWeight: "800",
    color: "#dc2626",
  },
  domainOriginalPrice: {
    fontSize: 11,
    color: lightColors.ink500,
    textDecorationLine: "line-through",
    textDecorationColor: lightColors.ink500,
    flexShrink: 1,
    minWidth: 0,
  },
  domainFinalPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: lightColors.ink900,
    marginLeft: "auto",
    flexShrink: 0,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  domainFarmName: {
    fontSize: 11,
    color: lightColors.ink500,
    fontWeight: "500",
    flexShrink: 1,
    minWidth: 0,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  domainMoreCard: {
    width: 150,
    height: 222,
    borderRadius: 12,
    borderWidth: 1, borderStyle: "dashed",
    borderColor: lightColors.border,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center", justifyContent: "center",
    gap: 6,
  },
  domainMoreIcon: {
    width: 36, height: 36, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  domainMoreText: {
    fontSize: 11, fontWeight: "600", color: lightColors.ink900,
  },
})
