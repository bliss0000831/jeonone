/**
 * ParticipantStrip — 헤더 아래 가로 참가자 아바타 strip.
 * 광장 web 의 ParticipantStrip 과 1:1 매칭.
 */

import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export interface StripParticipant {
  id: string
  nickname: string | null
  avatar_url?: string | null
  /** owner / host / seller — 아바타 우측 하단 색 점 */
  badge?: "owner" | "host" | "seller" | null
}

interface Props {
  participants: StripParticipant[]
  total?: number
  max?: number | null
  onInvite?: () => void
  inviteLabel?: string
  statusLabel?: string
  /** 아바타 최대 표시 (이상은 +N) */
  maxAvatars?: number
  onParticipantPress?: () => void
}

const BADGE_COLOR: Record<NonNullable<StripParticipant["badge"]>, string> = {
  owner: "#f59e0b",
  host: "#6366f1",
  seller: lightColors.primary,
}

export function ParticipantStrip({
  participants,
  total,
  max,
  onInvite,
  inviteLabel = "초대",
  statusLabel,
  maxAvatars = 6,
  onParticipantPress,
}: Props) {
  const visible = participants.slice(0, maxAvatars)
  const overflow = participants.length - visible.length

  return (
    <Pressable
      style={styles.container}
      onPress={onParticipantPress}
      disabled={!onParticipantPress}
    >
      <View style={styles.countBadge}>
        <Ionicons name="people" size={12} color={lightColors.ink500} />
        <Text style={styles.countText}>
          참가자{" "}
          <Text style={styles.countNum}>{total ?? participants.length}</Text>
          {typeof max === "number" && max > 0 ? (
            <Text style={styles.countMax}>/{max}</Text>
          ) : null}
        </Text>
        {statusLabel && (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.avatarRow}
        contentContainerStyle={styles.avatarRowContent}
      >
        {visible.map((p) => {
          const initial = p.nickname?.[0] || "?"
          return (
            <View key={p.id} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {p.avatar_url ? (
                  <Image
                    source={{ uri: p.avatar_url }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <Text style={styles.avatarLetter}>{initial}</Text>
                )}
              </View>
              {p.badge && (
                <View
                  style={[
                    styles.badgeDot,
                    { backgroundColor: BADGE_COLOR[p.badge] },
                  ]}
                />
              )}
            </View>
          )
        })}
        {overflow > 0 && (
          <View style={styles.overflowDot}>
            <Text style={styles.overflowText}>+{overflow}</Text>
          </View>
        )}
      </ScrollView>

      {onInvite && (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [
            styles.inviteBtn,
            pressed && styles.inviteBtnPressed,
          ]}
          hitSlop={4}
        >
          <Ionicons
            name="person-add"
            size={14}
            color={lightColors.primary}
          />
          <Text style={styles.inviteText}>{inviteLabel}</Text>
        </Pressable>
      )}
    </Pressable>
  )
}

const AVATAR_SIZE = 28

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: lightColors.muted,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    gap: spacing[2],
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countText: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  countNum: {
    fontWeight: "600",
    color: lightColors.ink900,
  },
  countMax: {
    color: lightColors.ink500,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: lightColors.background,
    marginLeft: 4,
  },
  statusText: {
    fontSize: 10,
    color: lightColors.ink500,
  },
  avatarRow: { flex: 1 },
  avatarRowContent: {
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    fontSize: 11,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  badgeDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: lightColors.muted,
  },
  overflowDot: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  overflowText: {
    fontSize: 10,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radius["2xl"],
    gap: 3,
  },
  inviteBtnPressed: {
    opacity: 0.6,
  },
  inviteText: {
    fontSize: fontSize.xs,
    color: lightColors.primary,
    fontWeight: "500",
  },
})
