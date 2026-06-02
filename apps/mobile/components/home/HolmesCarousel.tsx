/**
 * HolmesCarousel — 우리동네 홈즈 가로 캐러셀 + 카테고리 칩.
 * Extracted from apps/mobile/app/(tabs)/index.tsx.
 */
import { memo, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, spacing } from "@gwangjang/tokens"
import { FavoriteButton } from "@/components/FavoriteButton"
import { ScrollFadeHint } from "@/components/ScrollFadeHint"
import { useHorizontalEnd } from "@/lib/use-horizontal-end"
import { HOLMES_CATS, type HolmesType, type DomainPost } from "./constants"
import { formatHolmesPrice, formatPostedAgo, stripRegionPrefix } from "./formatters"

export { type HolmesType } from "./constants"

export const HolmesCarousel = memo(function HolmesCarousel({
  interior,
  moving,
  cleaning,
  repair,
  onMore,
  onCardPress,
}: {
  interior: DomainPost[]
  moving: DomainPost[]
  cleaning: DomainPost[]
  repair: DomainPost[]
  onMore: (t: HolmesType) => void
  onCardPress: (t: HolmesType, id: string) => void
}) {
  const [active, setActive] = useState<HolmesType>("interior")
  const map: Record<HolmesType, DomainPost[]> = {
    interior, moving, cleaning, repair,
  }
  const list = map[active]
  const cat = HOLMES_CATS.find((c) => c.key === active)!
  // 가로 스크롤 끝 표시
  const holmesScrollRef = useRef<ScrollView>(null)
  const holmesEnd = useHorizontalEnd()

  return (
    <View style={holmesStyles.section}>
      {/* 카테고리 — iOS 세그먼트 토글 (active 만 흰 카드 양각) */}
      <View style={holmesStyles.segmentWrap}>
        <View style={holmesStyles.segment}>
          {HOLMES_CATS.map((c) => {
            const on = active === c.key
            return (
              <Pressable
                key={c.key}
                onPress={() => setActive(c.key)}
                style={[
                  holmesStyles.segItem,
                  on && holmesStyles.segItemActive,
                  on && { backgroundColor: c.color },
                ]}
              >
                <Ionicons
                  name={c.icon}
                  size={12}
                  color={on ? "#ffffff" : lightColors.ink500}
                />
                <Text
                  style={[
                    holmesStyles.segText,
                    on
                      ? { color: "#ffffff", fontWeight: "700" }
                      : { color: lightColors.ink500 },
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* 카드 가로 슬라이드 */}
      {list.length === 0 ? (
        <View style={holmesStyles.empty}>
          <Text style={holmesStyles.emptyText}>등록된 업체가 없어요</Text>
        </View>
      ) : (
        <View style={{ position: "relative" }}>
        <ScrollView
          ref={holmesScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={holmesStyles.cardRow}
          decelerationRate="fast"
          onScroll={holmesEnd.onScroll}
          onContentSizeChange={(w) => holmesEnd.onContentSize(w)}
          onLayout={(e) => holmesEnd.onLayout(e.nativeEvent.layout.width)}
          scrollEventThrottle={32}
        >
          {list.slice(0, 7).map((p: any) => {
            const subCategory = p.sub_category ?? p.category ?? null
            const priceRange = formatHolmesPrice(p)
            const ago = p.created_at ? formatPostedAgo(p.created_at) : null
            // 서비스 지역 — service_region + district 우선, 없으면 location/address
            const serviceArea = [p.service_region, p.service_district]
              .filter(Boolean)
              .join(" ")
            const location = serviceArea
              ? stripRegionPrefix(serviceArea)
              : stripRegionPrefix(p.location ?? p.address ?? "")
            const careerYears =
              typeof p.career_years === "number" && p.career_years > 0
                ? p.career_years
                : null
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  holmesStyles.card,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                onPress={() => onCardPress(active, p.id)}
              >
                <View style={holmesStyles.thumbWrap}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={holmesStyles.thumb} cachePolicy="memory-disk" transition={150} contentFit="cover" />
                  ) : (
                    <View
                      style={[holmesStyles.thumb, { backgroundColor: lightColors.muted }]}
                    />
                  )}
                  {!!subCategory && (
                    <View
                      style={[holmesStyles.subCatBadge, { backgroundColor: cat.color }]}
                    >
                      <Ionicons name={cat.icon} size={10} color="#ffffff" />
                      <Text style={holmesStyles.subCatText} numberOfLines={1}>
                        {subCategory}
                      </Text>
                    </View>
                  )}
                  <FavoriteButton
                    kind={active}
                    targetId={p.id}
                    style={holmesStyles.heartBtn}
                  />
                </View>
                <View style={holmesStyles.body}>
                  <Text style={holmesStyles.cardTitle} numberOfLines={1}>
                    {p.title ?? ""}
                  </Text>
                  {!!priceRange && (
                    <Text style={holmesStyles.price}>{priceRange}</Text>
                  )}
                  {(!!location || careerYears) && (
                    <View style={holmesStyles.locRow}>
                      {!!location && (
                        <>
                          <Ionicons
                            name="location-outline"
                            size={11}
                            color={lightColors.ink500}
                          />
                          <Text style={holmesStyles.loc} numberOfLines={1}>
                            {location}
                          </Text>
                        </>
                      )}
                      {careerYears !== null && (
                        <View style={holmesStyles.careerRight}>
                          <Ionicons
                            name="ribbon-outline"
                            size={11}
                            color={lightColors.ink500}
                          />
                          <Text style={holmesStyles.career}>
                            경력 {careerYears}년
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={holmesStyles.footer}>
                    {!!ago && <Text style={holmesStyles.ago}>{ago}</Text>}
                    <View style={holmesStyles.stats}>
                      <Ionicons
                        name="eye-outline"
                        size={11}
                        color={lightColors.ink500}
                      />
                      <Text style={holmesStyles.statText}>{p.views ?? 0}</Text>
                      <Ionicons
                        name="heart-outline"
                        size={11}
                        color={lightColors.ink500}
                      />
                      <Text style={holmesStyles.statText}>{p.likes ?? 0}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            )
          })}
          {/* 더 보기 카드 — 도메인 섹션과 동일 패턴 */}
          <Pressable
            onPress={() => onMore(active)}
            style={({ pressed }) => [
              holmesStyles.moreCard,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={[holmesStyles.moreIcon, { backgroundColor: cat.color + "1A" }]}>
              <Ionicons name="arrow-forward" size={20} color={cat.color} />
            </View>
            <Text style={holmesStyles.moreText}>더 보기</Text>
          </Pressable>
        </ScrollView>
        <ScrollFadeHint atEnd={holmesEnd.atEnd} onPress={() => holmesEnd.advance(holmesScrollRef)} />
        </View>
      )}
    </View>
  )
})

export const holmesStyles = StyleSheet.create({
  // 섹션
  section: {
    marginTop: spacing[6],
    marginBottom: 0,
  },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    marginBottom: 12,
  },
  headIconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: lightColors.primary,
    alignItems: "center", justifyContent: "center",
  },
  title: {
    fontSize: 16, fontWeight: "800", color: lightColors.ink900,
    letterSpacing: -0.3,
  },
  sub: { fontSize: 11, color: lightColors.ink500, marginTop: 1 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontSize: 12, color: lightColors.primary, fontWeight: "600" },

  // 카테고리 세그먼트 토글 — iOS Toss 스타일
  segmentWrap: {
    paddingHorizontal: spacing[4],
    marginBottom: 12,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    borderRadius: 999,
    padding: 3,
  },
  segItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 999,
  },
  segItemActive: {
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segText: { fontSize: 12, fontWeight: "500" },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    marginBottom: 12,
    gap: 6,
  },
  chipsLeft: {
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  chipText: { fontSize: 12, fontWeight: "500", color: lightColors.ink900 },

  // 카드 가로 슬라이드
  cardRow: {
    paddingHorizontal: spacing[4],
    gap: 12,
  },
  card: {
    width: 200,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  thumbWrap: { position: "relative", aspectRatio: 5 / 4 },
  thumb: { width: "100%", height: "100%" },
  subCatBadge: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    maxWidth: "75%",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  subCatText: { color: "#ffffff", fontSize: 10, fontWeight: "700", flexShrink: 1 },
  heartBtn: {
    position: "absolute", top: 6, right: 6,
  },

  body: { padding: 12, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  loc: { fontSize: 11, color: lightColors.ink500, flexShrink: 1 },
  careerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: "auto",
    paddingLeft: 4,
  },
  career: { fontSize: 11, color: lightColors.ink500 },
  price: { fontSize: 14, fontWeight: "800", color: lightColors.primary, marginTop: 2 },

  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 6, paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: lightColors.border,
  },
  ago: { fontSize: 10, color: lightColors.ink500 },
  stats: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 10, color: lightColors.ink500 },

  // 빈 상태
  empty: {
    marginHorizontal: spacing[4],
    paddingVertical: 40, alignItems: "center", justifyContent: "center",
    borderRadius: 14, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  emptyText: { fontSize: 12, color: lightColors.ink500 },

  // 더 보기 카드
  moreCard: {
    width: 200,
    height: 260,
    borderRadius: 12,
    borderWidth: 1, borderStyle: "dashed",
    borderColor: lightColors.border,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center", justifyContent: "center",
    gap: 8,
  },
  moreIcon: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  moreText: { fontSize: 12, fontWeight: "600", color: lightColors.ink900 },

  // (legacy)
  cell: { width: "48%", gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: lightColors.ink900 },
  more: { flexDirection: "row", alignItems: "center", gap: 1 },
  desc: { fontSize: 11, color: lightColors.ink500 },
})
