/**
 * ProfileCard — 광장 web 의 components/profile/profile-card.tsx 1:1 미러.
 *
 * 웹 구조 (정독 기준):
 *   <div class="relative px-4 sm:px-6 pt-9">
 *     <div class="flex items-end gap-5 -mt-[84px] pb-1">
 *       Avatar (96/112px, ring-4 ring-background shadow-md, 카메라 뱃지 우하단)
 *       Info (이름 + 역할 뱃지 [icon + label] + admin 뱃지, 위치)
 *     </div>
 *     <ProfileCounters mt-4 />
 *     <CTA mt-4 (self: 프로필 편집 / 공유 — flex-1 min-w-[120px]) />
 *
 * 명시적 차이점 vs 기존 RN:
 *   - bio 표시 안 함 (웹은 location 만)
 *   - avatar 96px, ring 4px (흰색 background)
 *   - 카메라 뱃지 우하단 ring-2 ring-background, p-1.5
 *   - 이름 옆 역할 뱃지에 아이콘 (icon w-3 h-3 + label)
 *   - admin 은 빨강 (#ef4444), superadmin 은 검정 (#000)
 */

import { Pressable, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { ProfileCardData } from "@gwangjang/features/profile"
import type { RoleConfig } from "./role-config"
import { ProfileCounters, type CounterKind } from "./ProfileCounters"

// 시도 prefix 제거 — "강원특별자치도 춘천시 동내면" → "춘천시 동내면"
function stripRegionPrefix(addr: string): string {
  return addr.replace(
    /^(강원특별자치도|강원도|서울특별시|경기도|충청남도|충청북도|전라남도|전라북도|경상남도|경상북도|제주특별자치도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)\s*/,
    "",
  )
}

interface Props {
  data: ProfileCardData
  role: RoleConfig
  isAdmin?: boolean
  isSuperAdmin?: boolean
  onCounterPress?: (kind: CounterKind) => void
  onEditProfile?: () => void
  onShare?: () => void
  onAvatarPress?: () => void
}

export function ProfileCard({
  data,
  role,
  isAdmin,
  isSuperAdmin,
  onCounterPress,
  onEditProfile,
  onShare,
  onAvatarPress,
}: Props) {
  const name = data.nickname || "사용자"
  const badgeLabel = role.shortLabel || role.label
  const isUser = role.type === "user"

  return (
    <View style={styles.container}>
      {/* Avatar + Info — 가로 정렬, 아바타가 커버에 절반 걸침 */}
      <View style={styles.topRow}>
        <Pressable
          style={styles.avatarWrap}
          onPress={onAvatarPress}
          hitSlop={6}
        >
          {/* ring-4 ring-background 효과 — 흰 외곽 + shadow */}
          <View style={styles.avatarRing}>
            {data.avatar_url ? (
              <Image
                source={{ uri: data.avatar_url }}
                style={styles.avatarImg}
                cachePolicy="memory-disk"
                contentFit="cover"
                recyclingKey={data.avatar_url}
                transition={0}
              />
            ) : (
              <View style={[styles.avatarImg, styles.avatarFallback]}>
                <Ionicons name="person" size={44} color={lightColors.primary} />
              </View>
            )}
          </View>
          {/* 카메라 뱃지 — 우하단, ring-2 ring-background */}
          {onAvatarPress && (
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={12} color="#ffffff" />
            </View>
          )}
        </Pressable>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {/* 역할 뱃지 — user 는 표시 안 함 (웹과 동일) */}
            {!isUser && (
              <View style={[styles.roleBadge, { backgroundColor: role.badgeBg }]}>
                <Ionicons
                  name={role.iconName as any}
                  size={12}
                  color={role.badgeFg}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.roleBadgeText, { color: role.badgeFg }]}>
                  {badgeLabel}
                </Text>
              </View>
            )}
            {(isAdmin || isSuperAdmin) && (
              <View
                style={[
                  styles.roleBadge,
                  { backgroundColor: isSuperAdmin ? "#000000" : "#ef4444" },
                ]}
              >
                <Text style={[styles.roleBadgeText, { color: "#ffffff" }]}>
                  {isSuperAdmin ? "슈퍼관리자" : "관리자"}
                </Text>
              </View>
            )}
          </View>

          {data.location ? (
            <View style={styles.locationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={lightColors.ink700}
                style={{ flexShrink: 0 }}
              />
              <Text style={styles.locationText} numberOfLines={1}>
                {stripRegionPrefix(data.location)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Counters — 카드 paddingTop 10 합산하여 시각상 배너↔닉네임 과 비슷 (~22) */}
      <View style={{ marginTop: 12 }}>
        <ProfileCounters
          followers={data.followersCount}
          following={data.followingCount}
          trustScore={data.trustScore}
          reviewCount={data.reviewCount}
          onClick={onCounterPress}
        />
      </View>

      {/* CTA — 본인일 때만 "프로필 편집" + "공유" 둘 다 노출, 타인이면 "공유" 만 */}
      {(onEditProfile || onShare) && (
        <View style={styles.actions}>
          {onEditProfile && (
            <Pressable
              onPress={onEditProfile}
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnPrimaryText}>프로필 편집</Text>
            </Pressable>
          )}
          {onShare && (
            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.btnOutlined, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.btnOutlinedText}>공유</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

// 웹 sm:w-28 = 112px, mobile w-24 = 96px. 모바일 기준 96 사용.
const AVATAR_SIZE = 96
const AVATAR_RING = 4 // ring-4

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4], // px-4
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
    backgroundColor: "#f7f6f0",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    // 배너 제거(어르신 가독성) — 상단 호흡은 container paddingTop 으로 확보.
    marginTop: 0,
    paddingBottom: 4,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    flexShrink: 0,
    position: "relative",
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightColors.background,
    padding: AVATAR_RING,
    // shadow-md
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarImg: {
    width: AVATAR_SIZE - AVATAR_RING * 2,
    height: AVATAR_SIZE - AVATAR_RING * 2,
    borderRadius: (AVATAR_SIZE - AVATAR_RING * 2) / 2,
    backgroundColor: lightColors.muted,
  },
  avatarFallback: {
    backgroundColor: "rgba(59,130,246,0.1)", // primary/10
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: -2, // -right-0.5
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: lightColors.background, // ring-2 ring-background
    // shadow-md
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // marginTop 으로 호흡 확보했으니 translateY 보정 불필요
  info: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 6,                  // 뱃지가 2번째 줄로 떨어질 때 자연스러운 간격
    columnGap: 6,               // web gap-1.5
  },
  name: {
    fontSize: 20,               // web sm:text-xl (20px)
    fontWeight: "700",          // font-bold
    color: lightColors.ink900,
    letterSpacing: -0.4,
    lineHeight: 26,             // 명시 — 뱃지와 정확히 같은 높이로 맞춤
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: 24,                 // 닉네임 lineHeight 26 과 가깝게 맞춰 베이스라인 안정화
    borderRadius: 999,          // pill
    gap: 4,                     // web gap-1
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,               // 닉네임 영역과 충분히 떨어뜨려 호흡감 확보
  },
  locationText: {
    fontSize: 13,               // web text-xs sm:text-sm (13)
    color: lightColors.ink700,  // 더 진하게 — 주소 가독성 향상
    fontWeight: "500",
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8, // gap-2
    marginTop: spacing[4], // mt-4
  },
  btnPrimary: {
    flex: 1,
    minWidth: 120,
    height: 40,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  btnOutlined: {
    flex: 1,
    minWidth: 120,
    height: 40,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.background,
  },
  btnOutlinedText: {
    color: lightColors.ink900,
    fontSize: 14,
    fontWeight: "500",
  },
})
