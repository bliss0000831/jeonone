/**
 * PropertyMiniCard + ClubPlaceholder — 홈 화면 매물/모임 카드.
 * Extracted from apps/mobile/app/(tabs)/index.tsx.
 */
import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors } from "@gwangjang/tokens"
import { FavoriteButton } from "@/components/FavoriteButton"
import { isVideoUrl } from "@/components/MediaItem"
import type { Property } from "./constants"
import { formatPropertyPrice, formatPostedAgo, stripRegionPrefix, pickClubTheme } from "./formatters"

export const PropertyMiniCard = memo(function PropertyMiniCard({
  post,
  onPress,
  highlighted,
  fillWidth,
}: {
  post: Property
  onPress: () => void
  highlighted?: boolean
  fillWidth?: boolean
}) {
  // 동영상이 섞여 있어도 썸네일은 이미지 우선 (raw Image 는 video 렌더 불가)
  const thumb = post.images?.find((u) => !isVideoUrl(u)) ?? post.images?.[0]
  const formattedPrice = formatPropertyPrice(post)
  const txColor =
    post.transaction_type === "매매" ? lightColors.primary
    : post.transaction_type === "전세" ? "#f59e0b"
    : "#e11d48"
  const sellerColor = (post.seller_type ?? "individual") === "agent" ? "#2563eb" : "#059669"
  const sellerIcon = (post.seller_type ?? "individual") === "agent" ? "business" : "person"
  const sellerLabel = (post.seller_type ?? "individual") === "agent" ? "중개" : "일반"
  const ago = formatPostedAgo(post.created_at)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        propStyles.propCard,
        fillWidth && { width: "100%" },
        pressed && { transform: [{ scale: 0.98 }] },
        highlighted && {
          borderWidth: 2, borderColor: "#facc15",
        },
      ]}
    >
      {highlighted && (
        <View style={propStyles.propHighlightBadge}>
          <Ionicons name="star" size={10} color="#78350f" />
          <Text style={propStyles.propHighlightText}>오늘의 매물!</Text>
        </View>
      )}
      <View style={propStyles.propThumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={propStyles.propThumb} cachePolicy="memory-disk" transition={150} contentFit="cover" />
        ) : (
          <View style={[propStyles.propThumb, propStyles.propThumbEmpty]}>
            <Ionicons name="business" size={32} color={lightColors.ink500} />
          </View>
        )}
        {/* Gradient bottom overlay */}
        <LinearGradient
          colors={["transparent", "transparent", "rgba(15,23,42,0.45)"]}
          style={StyleSheet.absoluteFill as any}
          pointerEvents="none"
        />
        {/* Top-left badges — property_type + transaction */}
        <View style={propStyles.propTopLeftBadges}>
          {!!post.property_type && (
            <View style={propStyles.propTypeBadge}>
              <Text style={propStyles.propTypeText}>{post.property_type}</Text>
            </View>
          )}
          <View style={[propStyles.propTxBadge, { backgroundColor: txColor }]}>
            <Text style={propStyles.propTxText}>{post.transaction_type}</Text>
          </View>
        </View>
        {/* Heart button */}
        {!highlighted && (
          <FavoriteButton
            kind="property"
            targetId={post.id}
            style={propStyles.propHeartBtn}
          />
        )}
        {/* Seller badge — bottom-left */}
        <View style={[propStyles.propSellerBadge, { backgroundColor: sellerColor }]}>
          <Ionicons name={sellerIcon as any} size={10} color="#ffffff" />
          <Text style={propStyles.propSellerText}>{sellerLabel}</Text>
        </View>
      </View>
      <View style={propStyles.propBody}>
        <Text style={propStyles.propPrice} numberOfLines={1}>{formattedPrice}</Text>
        <Text style={propStyles.propTitle} numberOfLines={2}>{post.title}</Text>
        <View style={propStyles.propChips}>
          {post.area != null && (
            <View style={propStyles.propChip}>
              <Text style={propStyles.propChipText}>{post.area}m²</Text>
            </View>
          )}
          {(post as any).floor != null && (
            <View style={propStyles.propChip}>
              <Text style={propStyles.propChipText}>{(post as any).floor}층</Text>
            </View>
          )}
        </View>
        <View style={propStyles.propAddrRow}>
          <Ionicons name="location-outline" size={11} color={lightColors.ink500} />
          <Text style={propStyles.propAddr} numberOfLines={1}>
            {stripRegionPrefix(post.address ?? "")}
          </Text>
        </View>
        <View style={propStyles.propFooter}>
          <Text style={propStyles.propAgo}>{ago}</Text>
          <View style={propStyles.propStats}>
            <Ionicons name="eye-outline" size={11} color={lightColors.ink500} />
            <Text style={propStyles.propStatText}>{post.views ?? 0}</Text>
            <Ionicons name="heart-outline" size={11} color={lightColors.ink500} />
            <Text style={propStyles.propStatText}>{post.likes ?? 0}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
})

export const ClubPlaceholder = memo(function ClubPlaceholder({ title }: { title: string }) {
  const theme = pickClubTheme(title)
  return (
    <View style={[clubStyles.domainThumb, { overflow: "hidden" }]}>
      <Image
        source={{ uri: theme.thumb }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
    </View>
  )
})

const clubStyles = StyleSheet.create({
  domainThumb: {
    width: "100%", height: 140,
    backgroundColor: lightColors.muted,
  },
})

const propStyles = StyleSheet.create({
  propCard: {
    width: "48.5%",
    backgroundColor: lightColors.background,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    position: "relative",
  },
  propHighlightBadge: {
    position: "absolute", top: 8, right: 8, zIndex: 30,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#facc15",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  propHighlightText: { color: "#78350f", fontSize: 10, fontWeight: "800" },
  propThumbWrap: { position: "relative", aspectRatio: 4 / 3 },
  propThumb: { width: "100%", height: "100%", backgroundColor: lightColors.muted },
  propThumbEmpty: { alignItems: "center", justifyContent: "center" },
  propTopLeftBadges: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  propTypeBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  propTypeText: { color: lightColors.ink900, fontSize: 10, fontWeight: "700" },
  propTxBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  propTxText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  propHeartBtn: {
    position: "absolute", top: 6, right: 6,
  },
  propSellerBadge: {
    position: "absolute", bottom: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  propSellerText: { color: "#ffffff", fontSize: 10, fontWeight: "600" },
  propBody: { padding: 12, gap: 6 },
  propPrice: {
    fontSize: 18, fontWeight: "800", color: lightColors.primary,
    letterSpacing: -0.3,
  },
  propTitle: {
    fontSize: 13, fontWeight: "600", color: lightColors.ink900,
    lineHeight: 18,
  },
  propChips: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  propChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  propChipText: { fontSize: 11, color: "#475569", fontWeight: "500" },
  propAddrRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  propAddr: { fontSize: 11, color: lightColors.ink500, flex: 1 },
  propFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: lightColors.border,
  },
  propAgo: { fontSize: 10, color: lightColors.ink500 },
  propStats: { flexDirection: "row", alignItems: "center", gap: 3 },
  propStatText: { fontSize: 10, color: lightColors.ink500, marginRight: 3 },
})
