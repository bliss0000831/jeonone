/**
 * 모임(클럽) 전용 카드 컴포넌트.
 * DomainListScreen 에서 추출 — ClubThinRow (그리드), ClubListRow (리스트).
 */

import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { LinearGradient } from "expo-linear-gradient"
import { gwangjangFetch } from "@/lib/supabase"
import { useThemedStyles } from "@/components/useColorScheme"
import { pickClubTheme } from "@/components/home/formatters"

// ── 지역 접두어 제거 (DomainListScreen 의 동일 유틸 복사) ───────────────
function stripRegionPrefix(addr: string): string {
  return addr.replace(
    /^(강원특별자치도|강원도|서울특별시|경기도|충청남도|충청북도|전라남도|전라북도|경상남도|경상북도|제주특별자치도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)\s*/,
    "",
  )
}

// ── 모임 전용 컴팩트 행 (가로 레이아웃, 세로 얇음) ────────────────────
const CLUB_SPORT_EMOJI: Record<string, string> = {
  러닝: "🏃", 마라톤: "🏃", 조깅: "🏃",
  축구: "⚽", 풋살: "⚽",
  배드민턴: "🏸",
  농구: "🏀",
  테니스: "🎾",
  탁구: "🏓",
  배구: "🏐",
  골프: "⛳",
  볼링: "🎳",
  수영: "🏊", 다이빙: "🏊",
  등산: "⛰️", 하이킹: "⛰️", 트레킹: "⛰️",
  자전거: "🚴", 사이클: "🚴",
  요가: "🧘", 필라테스: "🧘",
  헬스: "💪",
  복싱: "🥊",
  야구: "⚾",
}
function pickClubEmoji(...probe: (string | null | undefined)[]): string {
  for (const text of probe) {
    if (!text) continue
    for (const key of Object.keys(CLUB_SPORT_EMOJI)) {
      if (text.includes(key)) return CLUB_SPORT_EMOJI[key]
    }
  }
  return "🎯"
}

// ── 모임 CTA 헬퍼: 참여하기 → 자동 join + 그룹 채팅 진입 ────────────
// 한 명이라도 참여하면 채팅방이 살아있는 구조 (정원 마감 기다리지 않음).
// 이미 멤버면 그냥 채팅방 진입.
async function joinClubAndOpenChat(item: any, router: ReturnType<typeof useRouter>) {
  const clubId = String(item.id)
  try {
    const res = await gwangjangFetch(`/api/clubs/${clubId}/join`, {
      method: "POST",
    })
    if (res.ok) {
      // 참여 성공 → 그룹 채팅 진입
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    const j = await res.json().catch(() => ({}))
    // 이미 멤버면 그냥 채팅방으로 이동
    if (j?.alreadyMember) {
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    // 본인 모임 → 그냥 채팅방으로 (호스트도 자기 모임 채팅 사용 가능)
    if (typeof j?.error === "string" && j.error.includes("본인")) {
      router.push(`/chat/club/${clubId}` as any)
      return
    }
    Alert.alert("참여 실패", j?.error || "참여하지 못했습니다")
  } catch {
    Alert.alert("오류", "참여 중 오류가 발생했습니다")
  }
}

// 채팅 버튼 — 주최자와 1:1 DM (모임 문의용)
async function openClubInquiryDM(item: any, router: ReturnType<typeof useRouter>) {
  const clubId = String(item.id)
  const ownerId = item.user_id
  if (!ownerId) {
    Alert.alert("알림", "주최자 정보가 없습니다")
    return
  }
  try {
    // 본인이 주최자면 자기랑 DM 못 함 → 그냥 그룹 채팅으로 fallback
    const res = await gwangjangFetch("/api/chat/rooms", {
      method: "POST",
      body: JSON.stringify({
        postId: clubId,
        sellerId: ownerId,
        postType: "clubs",
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      if (typeof j?.error === "string" && j.error.includes("본인")) {
        // 호스트 본인이 채팅 누름 → 그룹 채팅으로
        router.push(`/chat/club/${clubId}` as any)
        return
      }
      throw new Error(j?.error || "채팅방 생성 실패")
    }
    const j = await res.json().catch(() => ({}))
    const roomId = j?.roomId ?? j?.room?.id ?? j?.id
    if (!roomId) throw new Error("채팅방 정보 없음")
    router.push(`/chat/${roomId}` as any)
  } catch (e: any) {
    Alert.alert("실패", e?.message || "1:1 채팅 시작 실패")
  }
}

// 종목별 그라데이션 — 웹 club-card 의 indigo→violet 톤 + 종목별 변형
const SPORT_GRADIENT: Record<string, [string, string]> = {
  러닝: ["#f97316", "#dc2626"],
  마라톤: ["#f97316", "#dc2626"],
  조깅: ["#f97316", "#dc2626"],
  축구: ["#10b981", "#047857"],
  풋살: ["#10b981", "#047857"],
  배드민턴: ["#facc15", "#ca8a04"],
  농구: ["#fb923c", "#c2410c"],
  테니스: ["#a3e635", "#65a30d"],
  탁구: ["#f87171", "#b91c1c"],
  배구: ["#fbbf24", "#d97706"],
  골프: ["#22c55e", "#15803d"],
  볼링: ["#06b6d4", "#0e7490"],
  수영: ["#38bdf8", "#0369a1"],
  등산: ["#16a34a", "#14532d"],
  자전거: ["#14b8a6", "#0e7490"],
  요가: ["#84cc16", "#4d7c0f"],
  헬스: ["#64748b", "#1e293b"],
  복싱: ["#ef4444", "#7f1d1d"],
  야구: ["#0ea5e9", "#1e40af"],
}
function pickSportGradient(sport?: string | null, category?: string | null, title?: string | null): [string, string] {
  const probe = [sport, category, title].filter(Boolean) as string[]
  for (const text of probe) {
    for (const key of Object.keys(SPORT_GRADIENT)) {
      if (text.includes(key)) return SPORT_GRADIENT[key]
    }
  }
  return ["#6366f1", "#a855f7"] // default indigo→violet (웹과 동일)
}

const SKILL_COLOR: Record<string, { bg: string; fg: string }> = {
  누구나: { bg: "rgba(255,255,255,0.9)", fg: "#374151" },
  초급: { bg: "#22c55e", fg: "#ffffff" },
  중급: { bg: "#eab308", fg: "#ffffff" },
  고급: { bg: "#ef4444", fg: "#ffffff" },
}

export function ClubThinRow({
  item,
  heroColor,
  onPress,
}: {
  item: any
  heroColor: string
  onPress: () => void
}) {
  const clubThinStyles = useThemedStyles(makeClubThinStyles)
  const router = useRouter()
  const title = item.title ?? ""
  const sport = item.sport_type ?? item.category ?? null
  const emoji = pickClubEmoji(sport, item.category, title)
  // 하늘색 통일 — 연한 sky tint (#e0f2fe)
  const gradient: [string, string] = ["#e0f2fe", "#e0f2fe"]
  const thumb = item.images?.[0] || pickClubTheme(sport ?? title).thumb
  const cur = typeof item.current_members === "number" ? item.current_members : null
  const max = typeof item.max_members === "number" ? item.max_members : null
  const isFull = cur != null && max != null && cur >= max
  const ratio = cur != null && max != null && max > 0 ? Math.min(1, cur / max) : 0
  const fillPct = Math.round(ratio * 100)
  const skillLevel: string | null = item.skill_level ?? null
  const skillColor = skillLevel
    ? SKILL_COLOR[skillLevel] ?? SKILL_COLOR["누구나"]
    : null

  let dateStr: string | null = null
  const rawDate = item.meeting_date
  if (typeof rawDate === "string") {
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const month = parseInt(m[2], 10)
      const day = parseInt(m[3], 10)
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      const wd = isNaN(dt.getTime())
        ? ""
        : ` (${["일", "월", "화", "수", "목", "금", "토"][dt.getDay()]})`
      dateStr = `${month}/${day}${wd}`
    }
  }

  const place = item.location
    ? stripRegionPrefix(item.location)
    : item.meeting_place || null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [clubThinStyles.card, pressed && { opacity: 0.97 }]}
    >
      {/* 상단 그라데이션 헤더 (4:3) */}
      <View style={clubThinStyles.heroWrap}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject as any} cachePolicy="memory-disk" transition={0} contentFit="cover" />
        ) : (
          <Text style={clubThinStyles.heroEmoji}>{emoji}</Text>
        )}
        {/* 좌상단 상태 pill */}
        <View
          style={[
            clubThinStyles.heroTopLeft,
            { backgroundColor: isFull ? "#ef4444" : "#3b82f6" },
          ]}
        >
          <Text style={clubThinStyles.heroTopLeftText}>
            {isFull ? "마감" : "모집중"}
          </Text>
        </View>
        {/* 좌하단 스킬 pill */}
        {skillColor && (
          <View
            style={[
              clubThinStyles.heroBottomLeft,
              { backgroundColor: skillColor.bg },
            ]}
          >
            <Text
              style={[
                clubThinStyles.heroBottomLeftText,
                { color: skillColor.fg },
              ]}
            >
              {skillLevel}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={clubThinStyles.info}>
        <Text style={clubThinStyles.title} numberOfLines={2}>
          {title}
        </Text>
        {item.description && (
          <Text style={clubThinStyles.desc} numberOfLines={1}>
            {item.description}
          </Text>
        )}

        {/* Meta 줄들 */}
        <View style={{ gap: 4, marginTop: 6 }}>
          {place && (
            <View style={clubThinStyles.metaLine}>
              <Ionicons name="location-outline" size={12} color={lightColors.ink500} />
              <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                {place}
              </Text>
            </View>
          )}
          {(dateStr || item.meeting_time) && (
            <View style={clubThinStyles.metaLine}>
              <Ionicons name="calendar-outline" size={12} color={lightColors.ink500} />
              <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                {dateStr}
              </Text>
              {item.meeting_time && (
                <>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={lightColors.ink500}
                    style={{ marginLeft: 4 }}
                  />
                  <Text style={clubThinStyles.metaLineText} numberOfLines={1}>
                    {item.meeting_time}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* 참여 현황 + 진행률 바 */}
        {cur != null && max != null && (
          <View style={{ marginTop: 10, gap: 4 }}>
            <View style={clubThinStyles.progressHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="people-outline" size={12} color={lightColors.ink500} />
                <Text style={clubThinStyles.metaLineText}>참여 현황</Text>
              </View>
              <Text
                style={[
                  clubThinStyles.progressCount,
                  { color: isFull ? "#ef4444" : heroColor },
                ]}
              >
                {cur}/{max}명
              </Text>
            </View>
            <View style={clubThinStyles.progressTrack}>
              <View
                style={[
                  clubThinStyles.progressFill,
                  {
                    width: `${fillPct}%`,
                    backgroundColor: isFull ? "#ef4444" : heroColor,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* CTA */}
        <View style={clubThinStyles.ctaRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation()
              joinClubAndOpenChat(item, router)
            }}
            disabled={isFull}
            style={({ pressed }) => [
              clubThinStyles.primaryCta,
              { backgroundColor: isFull ? lightColors.muted : heroColor },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                clubThinStyles.primaryCtaText,
                { color: isFull ? lightColors.ink500 : "#ffffff" },
              ]}
            >
              {isFull ? "마감" : "참여하기 →"}
            </Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation()
              openClubInquiryDM(item, router)
            }}
            style={({ pressed }) => [
              clubThinStyles.iconCta,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={lightColors.ink700}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

export const clubsGridStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 12,
  },
})

// ── 모임 리스트 모드 — 컴팩트 가로 카드 ────────────────────────
export function ClubListRow({
  item,
  heroColor,
  onPress,
}: {
  item: any
  heroColor: string
  onPress: () => void
}) {
  const clubListStyles = useThemedStyles(makeClubListStyles)
  const router = useRouter()
  const title = item.title ?? ""
  const sport = item.sport_type ?? item.category ?? null
  const emoji = pickClubEmoji(sport, item.category, title)
  // 하늘색 통일 — 연한 sky tint (#e0f2fe)
  const gradient: [string, string] = ["#e0f2fe", "#e0f2fe"]
  const thumb = item.images?.[0] || pickClubTheme(sport ?? title).thumb
  const cur = typeof item.current_members === "number" ? item.current_members : null
  const max = typeof item.max_members === "number" ? item.max_members : null
  const isFull = cur != null && max != null && cur >= max
  const ratio = cur != null && max != null && max > 0 ? Math.min(1, cur / max) : 0
  const fillPct = Math.round(ratio * 100)
  const skillLevel: string | null = item.skill_level ?? null
  const skillColor = skillLevel
    ? SKILL_COLOR[skillLevel] ?? SKILL_COLOR["누구나"]
    : null

  let dateStr: string | null = null
  const rawDate = item.meeting_date
  if (typeof rawDate === "string") {
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const month = parseInt(m[2], 10)
      const day = parseInt(m[3], 10)
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      const wd = isNaN(dt.getTime())
        ? ""
        : ` (${["일", "월", "화", "수", "목", "금", "토"][dt.getDay()]})`
      dateStr = `${month}/${day}${wd}`
    }
  }

  const place = item.location
    ? stripRegionPrefix(item.location)
    : item.meeting_place || null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [clubListStyles.card, pressed && { opacity: 0.97 }]}
    >
      <View style={clubListStyles.row}>
        {/* 좌측 — 작은 그라데이션 썸네일 (88×88) + 상태/스킬 뱃지 */}
        <View style={clubListStyles.thumbWrap}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject as any}
          />
          {thumb ? (
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject as any} cachePolicy="memory-disk" transition={0} contentFit="cover" />
          ) : (
            <Text style={clubListStyles.thumbEmoji}>{emoji}</Text>
          )}
          {/* 상태 — 좌상단 */}
          <View
            style={[
              clubListStyles.statusBadge,
              { backgroundColor: isFull ? "#ef4444" : "#3b82f6" },
            ]}
          >
            <Text style={clubListStyles.statusBadgeText}>
              {isFull ? "마감" : "모집중"}
            </Text>
          </View>
          {/* 스킬 — 좌하단 */}
          {skillColor && (
            <View
              style={[
                clubListStyles.skillBadge,
                { backgroundColor: skillColor.bg },
              ]}
            >
              <Text style={[clubListStyles.skillBadgeText, { color: skillColor.fg }]}>
                {skillLevel}
              </Text>
            </View>
          )}
        </View>

        {/* 우측 — 정보 + CTA */}
        <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
          <View>
            <Text style={clubListStyles.title} numberOfLines={2}>
              {title}
            </Text>
            {/* 메타: 날짜·시간 / 장소 */}
            {(dateStr || item.meeting_time) && (
              <View style={[clubListStyles.metaLine, { marginTop: 4 }]}>
                <Ionicons name="calendar-outline" size={11} color={lightColors.ink500} />
                <Text style={clubListStyles.metaText} numberOfLines={1}>
                  {[dateStr, item.meeting_time].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
            {place && (
              <View style={[clubListStyles.metaLine, { marginTop: 2 }]}>
                <Ionicons name="location-outline" size={11} color={lightColors.ink500} />
                <Text style={clubListStyles.metaText} numberOfLines={1}>
                  {place}
                </Text>
              </View>
            )}
            {/* 진행률 바 */}
            {cur != null && max != null && (
              <View style={{ marginTop: 6, gap: 3 }}>
                <View style={clubListStyles.progressHeader}>
                  <Text style={clubListStyles.metaText}>참여</Text>
                  <Text
                    style={[
                      clubListStyles.progressCount,
                      { color: isFull ? "#ef4444" : heroColor },
                    ]}
                  >
                    {cur}/{max}명
                  </Text>
                </View>
                <View style={clubListStyles.progressTrack}>
                  <View
                    style={[
                      clubListStyles.progressFill,
                      {
                        width: `${fillPct}%`,
                        backgroundColor: isFull ? "#ef4444" : heroColor,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
          {/* CTA */}
          <View style={clubListStyles.ctaRow}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation()
                joinClubAndOpenChat(item, router)
              }}
              disabled={isFull}
              style={({ pressed }) => [
                clubListStyles.primaryCta,
                { backgroundColor: isFull ? lightColors.muted : heroColor },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  clubListStyles.primaryCtaText,
                  { color: isFull ? lightColors.ink500 : "#ffffff" },
                ]}
              >
                {isFull ? "마감" : "참여하기 →"}
              </Text>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation()
                openClubInquiryDM(item, router)
              }}
              style={({ pressed }) => [
                clubListStyles.iconCta,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={lightColors.ink700}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

function makeClubListStyles(colors: any) {
  return StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  thumbWrap: {
    width: 88,
    alignSelf: "stretch", // 행 전체 높이로 늘어남 (하단 흰 여백 제거)
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
  },
  thumbEmoji: {
    fontSize: 36,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  statusBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },
  skillBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  skillBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
    lineHeight: 17,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    color: colors.ink500,
    flexShrink: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressCount: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  primaryCta: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  iconCta: {
    width: 34,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
}
const clubListStyles = makeClubListStyles(lightColors)

function makeClubThinStyles(colors: any) {
  return StyleSheet.create({
  card: {
    marginBottom: 0,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  // 상단 그라데이션 헤더 — 16:10 비율 (4:3 보다 세로 짧음)
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  heroEmoji: {
    fontSize: 44,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroTopLeft: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroTopLeftText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  heroBottomLeft: {
    position: "absolute",
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroBottomLeftText: {
    fontSize: 10,
    fontWeight: "600",
  },
  info: {
    padding: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
    lineHeight: 17,
  },
  desc: {
    marginTop: 3,
    fontSize: 11,
    color: colors.ink500,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaLineText: {
    fontSize: 11,
    color: colors.ink500,
    flexShrink: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressCount: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primaryCta: {
    flex: 1,
    height: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconCta: {
    width: 36,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
}
const clubThinStyles = makeClubThinStyles(lightColors)
