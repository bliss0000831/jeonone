/**
 * 전문가 초대 풀스크린 — 광장 web 의 ExpertSelectionModal 1:1 미러.
 *
 * 정독 매핑 (apps/web/components/expert-selection-modal.tsx):
 *   - 헤더: "전문가 선택" + ✕ (background 흰색)
 *   - 5개 카테고리 가로 pill 탭 (각자 색상 매트릭스):
 *       agent     — blue-50 bg / blue-500 text
 *       interior  — purple-50 bg / purple-500 text
 *       moving    — yellow-50 bg / yellow-600 text
 *       cleaning  — pink-50 bg / pink-500 text
 *       repair    — orange-50 bg / orange-500 text
 *   - 비활성 탭: secondary bg / muted text
 *   - 지역 라벨: "OO 지역 전문가" + "전체지역" 토글 (Globe2 아이콘)
 *   - 전문가 카드: avatar + name + star(>=4.0) + location + type badge (오른쪽)
 *   - 빈 상태: 카테고리 아이콘 + 안내 + 보조 안내 (전체지역 권장)
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { notification as hapticNotification } from "@gwangjang/platform/haptics"
import {
  getChatRoom,
  inviteExpert,
  listExperts,
  type AccountType,
  type Expert,
} from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"

interface ExpertCat {
  type: AccountType
  label: string
  icon: keyof typeof Ionicons.glyphMap
  bg: string
  fg: string
  border: string
}

const CATEGORIES: ExpertCat[] = [
  { type: "agent",    label: "공인중개사", icon: "business-outline",       bg: "#eff6ff", fg: "#3b82f6", border: "#bfdbfe" },
  { type: "interior", label: "인테리어",   icon: "color-palette-outline",  bg: "#faf5ff", fg: "#a855f7", border: "#e9d5ff" },
  { type: "moving",   label: "이사",       icon: "car-outline",            bg: "#fefce8", fg: "#ca8a04", border: "#fef08a" },
  { type: "cleaning", label: "청소",       icon: "sparkles-outline",       bg: "#fdf2f8", fg: "#ec4899", border: "#fbcfe8" },
  { type: "repair",   label: "수리",       icon: "construct-outline",      bg: "#fff7ed", fg: "#f97316", border: "#fed7aa" },
]


export default function InviteExpertScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const { user } = useAuth()
  const router = useRouter()

  const [selectedType, setSelectedType] = useState<AccountType>("agent")
  const [showAllRegions, setShowAllRegions] = useState(false)
  const [experts, setExperts] = useState<Expert[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState<string | null>(null)
  const [propertyDong, setPropertyDong] = useState<string | undefined>()
  const [locationLoaded, setLocationLoaded] = useState(false)
  const [sentExpert, setSentExpert] = useState<Expert | null>(null)

  // 매물 주소에서 동/면 추출 (지역 필터 default)
  useEffect(() => {
    if (!roomId) {
      setLocationLoaded(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        const room = await getChatRoom(supabase, roomId)
        if (!room?.property_id) return
        const { data } = await supabase
          .from("properties")
          .select("address")
          .eq("id", room.property_id)
          .maybeSingle()
        if (cancelled) return
        const address = (data as { address?: string } | null)?.address
        if (address) setPropertyDong(extractDong(address))
      } finally {
        if (!cancelled) setLocationLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId])

  // 전문가 목록 로드
  const fetchExperts = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getSupabase()
      const data = await listExperts(supabase, DEFAULT_PLAZA, {
        accountType: selectedType,
        locationContains:
          showAllRegions || !propertyDong ? undefined : propertyDong,
      })
      setExperts(data)
    } catch {
      setExperts([])
    } finally {
      setLoading(false)
    }
  }, [selectedType, showAllRegions, propertyDong])

  useEffect(() => {
    if (locationLoaded) fetchExperts()
  }, [fetchExperts, locationLoaded])

  async function handleInvite(expert: Expert) {
    if (!user || !roomId) return
    setInviting(expert.id)
    try {
      const supabase = getSupabase()
      const room = await getChatRoom(supabase, roomId)
      // web /api/expert-invitations 호출 — 초대 INSERT + 알림 + 시스템 메시지까지 일괄 처리
      const res = await gwangjangFetch("/api/expert-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatRoomId: roomId,
          expertId: expert.id,
          propertyId: room?.property_id ?? null,
          message: `${expert.nickname ?? "전문가"}님을 채팅방에 초대합니다`,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? "초대 실패")
      }
      try {
        await hapticNotification("success")
      } catch {}
      setSentExpert(expert)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "초대 실패"
      Alert.alert("초대 실패", msg)
    } finally {
      setInviting(null)
    }
  }

  const currentCat = CATEGORIES.find((c) => c.type === selectedType) ?? CATEGORIES[0]

  return (
    <View style={styles.modalBackdrop}>
      <Stack.Screen options={{ headerShown: false, presentation: "transparentModal", animation: "fade" }} />
      {/* 배경 클릭 시 닫기 */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={() => router.back()} />
      <View style={styles.modalCard}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>전문가 선택</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="close" size={20} color={lightColors.ink500} />
        </Pressable>
      </View>

      {/* 카테고리 pill 탭 */}
      <View style={styles.tabBorder}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {CATEGORIES.map((cat) => {
            const active = cat.type === selectedType
            return (
              <Pressable
                key={cat.type}
                onPress={() => setSelectedType(cat.type)}
                style={[
                  styles.pillTab,
                  active
                    ? {
                        backgroundColor: cat.bg,
                        borderColor: cat.border,
                      }
                    : styles.pillTabInactive,
                ]}
              >
                <Ionicons
                  name={cat.icon}
                  size={14}
                  color={active ? cat.fg : lightColors.ink500}
                />
                <Text
                  style={[
                    styles.pillText,
                    active ? { color: cat.fg, fontWeight: "600" } : styles.pillTextInactive,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* 지역 라벨 + 전체지역 토글 */}
      <View style={styles.regionRow}>
        <View style={styles.regionLeft}>
          <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
          <Text style={styles.regionText} numberOfLines={1}>
            {showAllRegions
              ? `${DEFAULT_PLAZA} 전체 지역 전문가`
              : propertyDong
                ? `${propertyDong} 지역 전문가`
                : "지역 정보 없음 — 전체 전문가"}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowAllRegions((v) => !v)}
          disabled={!propertyDong && !showAllRegions}
          style={[
            styles.regionToggle,
            showAllRegions && {
              backgroundColor: lightColors.primary,
              borderColor: lightColors.primary,
            },
            !propertyDong && !showAllRegions && { opacity: 0.5 },
          ]}
        >
          <Ionicons
            name="globe-outline"
            size={11}
            color={showAllRegions ? "#ffffff" : lightColors.ink900}
          />
          <Text
            style={[
              styles.regionToggleText,
              showAllRegions && { color: "#ffffff" },
            ]}
          >
            {showAllRegions ? "매물 지역만" : "전체지역"}
          </Text>
        </Pressable>
      </View>

      {/* 전문가 목록 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : (
        <FlatList
          data={experts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExpertRow
              expert={item}
              cat={currentCat}
              onPress={() => handleInvite(item)}
              busy={inviting === item.id}
              disabled={!!inviting}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons
                name={currentCat.icon}
                size={48}
                color={currentCat.fg}
                style={{ opacity: 0.5 }}
              />
              <Text style={styles.emptyTitle}>
                {!showAllRegions && propertyDong
                  ? `${propertyDong} 지역에 ${currentCat.label} 전문가가 없습니다`
                  : `${currentCat.label} 전문가가 없습니다`}
              </Text>
              <Text style={styles.emptyHint}>
                {!showAllRegions && propertyDong
                  ? "‘전체지역’ 버튼을 눌러 다른 동네 전문가도 확인해 보세요"
                  : "다른 카테고리를 선택해보세요"}
              </Text>
            </View>
          }
          contentContainerStyle={
            experts.length === 0 ? styles.emptyContainer : undefined
          }
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
      </View>

      {/* 초대 전송 완료 모달 — Alert.alert 대신 디자인된 카드 */}
      <Modal
        visible={!!sentExpert}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSentExpert(null)
          router.back()
        }}
      >
        <View style={styles.sentBackdrop}>
          <View style={styles.sentCard}>
            <View style={styles.sentIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            </View>
            <Text style={styles.sentTitle}>초대 요청을 보냈습니다</Text>

            {sentExpert && (
              <View style={styles.sentExpertRow}>
                {sentExpert.avatar_url ? (
                  <Image source={{ uri: sentExpert.avatar_url }} cachePolicy="memory-disk" style={styles.sentAvatar} />
                ) : (
                  <View style={[styles.sentAvatar, styles.sentAvatarFallback]}>
                    <Text style={styles.sentAvatarLetter}>
                      {(sentExpert.nickname ?? "?").charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.sentExpertName} numberOfLines={1}>
                    {sentExpert.nickname ?? "전문가"}
                  </Text>
                  <Text style={styles.sentExpertSub}>
                    수락하면 채팅방에 참여합니다
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.sentHint}>
              상대방에게 알림이 전송되었어요. 응답까지 잠시 기다려주세요.
            </Text>

            <Pressable
              onPress={() => {
                setSentExpert(null)
                router.back()
              }}
              style={({ pressed }) => [styles.sentBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.sentBtnText}>확인</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Expert Row ─────────────────────────────────────────────────────────

function ExpertRow({
  expert,
  cat,
  onPress,
  busy,
  disabled,
}: {
  expert: Expert
  cat: ExpertCat
  onPress: () => void
  busy: boolean
  disabled: boolean
}) {
  const initial = (expert.nickname ?? "?").charAt(0)
  const showStar = (expert.trust_score ?? 0) >= 4.0
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && !disabled && { backgroundColor: lightColors.muted },
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      <View style={styles.avatar}>
        {expert.avatar_url ? (
          <Image source={{ uri: expert.avatar_url }} cachePolicy="memory-disk" style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarLetter}>{initial}</Text>
        )}
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName} numberOfLines={1}>
            {expert.nickname ?? "익명"}
          </Text>
          {showStar && (
            <View style={styles.starRow}>
              <Ionicons name="star" size={11} color="#f59e0b" />
              <Text style={styles.starText}>
                {expert.trust_score?.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
        {expert.location && (
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={11} color={lightColors.ink500} />
            <Text style={styles.locText} numberOfLines={1}>
              {expert.location}
            </Text>
          </View>
        )}
      </View>
      {/* 우측 카테고리 뱃지 */}
      <View style={[styles.typeBadge, { backgroundColor: cat.bg }]}>
        <Text style={[styles.typeBadgeText, { color: cat.fg }]}>
          {cat.label}
        </Text>
      </View>
      {busy && (
        <ActivityIndicator
          size="small"
          color={lightColors.primary}
          style={{ marginLeft: 4 }}
        />
      )}
    </Pressable>
  )
}

function extractDong(address: string): string | undefined {
  const tokens = address.split(/\s+/).filter(Boolean)
  const eupMyeonDong = tokens.find((t) => /(읍|면|동)$/.test(t) && t.length >= 2)
  if (eupMyeonDong) return eupMyeonDong
  const ri = tokens.find((t) => /리$/.test(t) && t.length >= 2)
  if (ri) return ri
  const siGuGun = tokens.find((t) => /(시|군|구)$/.test(t))
  return siGuGun
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  // 초대 전송 완료 모달 — Alert.alert 대체
  sentBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  sentCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  sentIconWrap: {
    alignItems: "center",
    marginBottom: spacing[3],
  },
  sentTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  sentExpertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#e2e8f0" },
  sentAvatarFallback: { alignItems: "center", justifyContent: "center" },
  sentAvatarLetter: { fontSize: 16, fontWeight: "700", color: "#64748b" },
  sentExpertName: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  sentExpertSub: { fontSize: 12, color: lightColors.ink500, marginTop: 2 },
  sentHint: {
    fontSize: 12,
    color: lightColors.ink500,
    marginTop: spacing[3],
    textAlign: "center",
    lineHeight: 18,
  },
  sentBtn: {
    marginTop: spacing[4],
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  sentBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  // 팝업 모달 — 어두운 배경 + 가운데 흰 카드 (웹 ExpertSelectionModal 톤)
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "70%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  tabBorder: {
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  tabRow: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: 8,
  },
  pillTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillTabInactive: {
    backgroundColor: lightColors.muted,
    borderColor: "transparent",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  pillTextInactive: {
    color: lightColors.ink500,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: 8,
    backgroundColor: "rgba(241,245,249,0.4)", // secondary/40
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    gap: 8,
  },
  regionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  regionText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.ink500,
  },
  regionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  regionToggleText: {
    fontSize: 11,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardName: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink900,
    flexShrink: 1,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  starText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  locText: {
    fontSize: 11,
    color: lightColors.ink500,
    flexShrink: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: lightColors.border,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: spacing[3],
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
    textAlign: "center",
  },
  emptyContainer: { flexGrow: 1 },
})
