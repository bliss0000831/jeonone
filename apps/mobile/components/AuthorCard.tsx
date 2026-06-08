/**
 * AuthorCard — 모든 상세 페이지 공용 "판매자/작성자 정보" 카드.
 *
 * 디자인:
 *   - "판매자 정보" 또는 "작성자 정보" 섹션 타이틀
 *   - 흰 카드 + 옅은 보더 + 약한 그림자
 *   - 좌측: 원형 아바타 (없으면 첫글자)
 *   - 중앙: 닉네임 + account_type 뱃지 + "가입 N일차"
 *   - 우측: chevron
 *   - 클릭 → /profile/{id}
 */

import { memo, useEffect, useMemo, useState, type ReactNode } from "react"
import { Linking, Pressable, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"

export interface AuthorProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type?: string | null
  created_at?: string | null
}

interface Props {
  profile: AuthorProfile
  /** 섹션 타이틀 (default: "판매자 정보") */
  title?: string
  /** 강조 색 — 지정 시 account_type 뱃지의 배경/텍스트 색에 적용 */
  accentColor?: string
  /** account_type 뱃지 대신/추가로 표시할 도메인 뱃지 */
  extraBadge?: { label: string; color?: string }
  /** 카드 아래에 렌더링할 추가 정보 영역 */
  extra?: ReactNode
  /** 🅲 작성자 광장 — 다른 광장 글일 때 profile/[id] 에 plaza 컨텍스트 전달 */
  authorPlazaId?: string | null
}

// account_type → 표시 라벨
const TYPE_LABELS: Record<string, string> = {
  user: "일반",
  individual: "일반",
  agent: "공인중개사",
  business: "사업자",
  producer: "생산자",
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

function joinDaysAgo(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  const t = Date.parse(createdAt)
  if (!Number.isFinite(t)) return null
  const days = Math.max(1, Math.floor((Date.now() - t) / 86400000))
  return `가입 ${days}일차`
}

// hex → rgba(.., alpha)
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}

// 사업자 계정 유형 — 이 유형일 때만 사업자 정보 조회
const BIZ_ACCOUNT_TYPES = new Set([
  "agent", "business", "producer", "interior", "moving", "cleaning", "repair",
])

interface BizInfo {
  business_name: string | null
  business_number: string | null
  registration_number: string | null
  office_address: string | null
  contact_phone: string | null
}

/** 이웃 별 — 평균 별점(0~5)/후기 수. 후기 없으면 "새 이웃". */
interface NeighborStarInfo {
  trust_score: number | null
  review_count: number | null
}

export const AuthorCard = memo(function AuthorCard({
  profile,
  title = "판매자 정보",
  accentColor,
  extraBadge,
  extra,
  authorPlazaId,
}: Props) {
  const router = useRouter()
  const initial = (profile.nickname || "?").slice(0, 1)
  const joined = useMemo(() => joinDaysAgo(profile.created_at), [profile.created_at])
  const typeLabel = profile.account_type
    ? TYPE_LABELS[profile.account_type] || null
    : null

  // 사업자 정보 조회 — account_type 이 사업자 계정일 때만
  const [bizInfo, setBizInfo] = useState<BizInfo | null>(null)
  useEffect(() => {
    if (!profile.id || !profile.account_type || !BIZ_ACCOUNT_TYPES.has(profile.account_type)) {
      setBizInfo(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await (getSupabase() as any)
          .from("account_type_requests")
          .select("business_name, business_number, registration_number, office_address, contact_phone")
          .eq("user_id", profile.id)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (alive && data && (data.business_name || data.business_number || data.office_address)) {
          setBizInfo(data as BizInfo)
        }
      } catch {}
    })()
    return () => { alive = false }
  }, [profile.id, profile.account_type])

  // 이웃 별(평균 별점/후기 수) — profile.id 로 조회 (bizInfo 와 동일 안전 수준)
  const [star, setStar] = useState<NeighborStarInfo | null>(null)
  useEffect(() => {
    if (!profile.id) {
      setStar(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await (getSupabase() as any)
          .from("profiles")
          .select("trust_score, review_count")
          .eq("id", profile.id)
          .maybeSingle()
        if (alive && data) setStar(data as NeighborStarInfo)
      } catch {}
    })()
    return () => { alive = false }
  }, [profile.id])

  // 별점 표시 판정 — 0~5 범위 + 후기 1개 이상일 때만 점수 표시 (ProfileCounters 와 동일 규칙)
  const reviewCount = star?.review_count ?? 0
  const validScore =
    star?.trust_score != null && star.trust_score >= 0 && star.trust_score <= 5 && reviewCount > 0
      ? star.trust_score
      : null

  // 뱃지 결정: extraBadge 우선, 없으면 account_type 라벨
  const badge: { label: string; color: string } | null = extraBadge
    ? { label: extraBadge.label, color: extraBadge.color || accentColor || lightColors.primary }
    : typeLabel
    ? { label: typeLabel, color: accentColor || lightColors.primary }
    : null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        onPress={() =>
          router.push(
            authorPlazaId
              ? (`/profile/${profile.id}?plaza=${authorPlazaId}` as any)
              : (`/profile/${profile.id}` as any),
          )
        }
        accessibilityLabel={`${profile.nickname || "사용자"} 프로필 보기`}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          bizInfo && styles.cardWithBiz,
          pressed && { opacity: 0.7 },
        ]}
      >
        {/* 아바타 */}
        <View style={styles.avatarWrap}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
              cachePolicy="memory-disk"
              contentFit="cover"
              recyclingKey={profile.avatar_url}
              transition={0}
              accessibilityLabel={`${profile.nickname || "사용자"} 프로필 사진`}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
        </View>

        {/* 정보 */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.nickname || "사용자"}
            </Text>
            {badge && (
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: withAlpha(badge.color, 0.12) },
                ]}
              >
                <Text style={[styles.typeBadgeText, { color: badge.color }]}>
                  {badge.label}
                </Text>
              </View>
            )}
          </View>
          {/* 이웃 별 — 후기 있으면 "⭐ 4.3 (12)", 없으면 "⭐ 새 이웃" */}
          {star && (
            <View style={styles.starRow}>
              <Ionicons
                name={validScore != null ? "star" : "star-outline"}
                size={13}
                color={validScore != null ? "#fbbf24" : lightColors.ink500}
              />
              {validScore != null ? (
                <Text style={styles.starText}>
                  {validScore.toFixed(1)}
                  <Text style={styles.starCount}> ({reviewCount})</Text>
                </Text>
              ) : (
                <Text style={styles.starCount}>새 이웃</Text>
              )}
            </View>
          )}
          {joined && <Text style={styles.joined}>{joined}</Text>}
        </View>

        <Ionicons name="chevron-forward" size={18} color={lightColors.ink500} />
      </Pressable>
      {extra ? <View style={styles.extra}>{extra}</View> : null}

      {/* 사업자 정보 — 카드 하단에 이어 붙음 */}
      {bizInfo && (
        <View style={styles.bizCard}>
          <View style={styles.bizHeader}>
            <Ionicons name="business-outline" size={13} color={lightColors.ink500} />
            <Text style={styles.bizHeaderText}>사업자 정보</Text>
          </View>
          <View style={styles.bizBody}>
            {bizInfo.business_name ? (
              <View style={styles.bizRow}>
                <Text style={styles.bizLabel}>상호</Text>
                <Text style={styles.bizValue} numberOfLines={1}>{bizInfo.business_name}</Text>
              </View>
            ) : null}
            {bizInfo.office_address ? (
              <View style={styles.bizRow}>
                <Text style={styles.bizLabel}>주소</Text>
                <Text style={styles.bizValue} numberOfLines={1}>{bizInfo.office_address}</Text>
              </View>
            ) : null}
            {bizInfo.business_number ? (
              <View style={styles.bizRow}>
                <Text style={styles.bizLabel}>사업자 번호</Text>
                <Text style={styles.bizValue} numberOfLines={1}>{bizInfo.business_number}</Text>
              </View>
            ) : null}
            {bizInfo.registration_number && profile.account_type === "agent" ? (
              <View style={styles.bizRow}>
                <Text style={styles.bizLabel}>등록번호</Text>
                <Text style={styles.bizValue} numberOfLines={1}>{bizInfo.registration_number}</Text>
              </View>
            ) : null}
            {bizInfo.contact_phone ? (
              <View style={styles.bizRow}>
                <Text style={styles.bizLabel}>연락처</Text>
                <Pressable onPress={() => Linking.openURL(`tel:${bizInfo.contact_phone}`)} hitSlop={4} accessibilityLabel={`${bizInfo.contact_phone} 전화 걸기`} accessibilityRole="link">
                  <Text style={styles.bizValueLink} numberOfLines={1}>{bizInfo.contact_phone}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[3],
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.lg,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardWithBiz: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    flexShrink: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: lightColors.muted,
  },
  avatarFallback: {
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: lightColors.primary,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: lightColors.primary,
  },
  joined: {
    fontSize: 12,
    color: lightColors.ink500,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  starText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b45309",
  },
  starCount: {
    fontSize: 12,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  extra: {
    marginTop: spacing[2],
  },
  bizCard: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: lightColors.border,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: "hidden",
  },
  bizHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    backgroundColor: "rgba(241,245,249,0.5)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
  bizHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: lightColors.ink500,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  bizBody: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 8,
  },
  bizRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bizLabel: {
    fontSize: 13,
    color: lightColors.ink500,
    flexShrink: 0,
    width: 72,
  },
  bizValue: {
    fontSize: 13,
    fontWeight: "500",
    color: lightColors.ink900,
    flex: 1,
  },
  bizValueLink: {
    fontSize: 13,
    fontWeight: "500",
    color: lightColors.primary,
    flex: 1,
  },
})
