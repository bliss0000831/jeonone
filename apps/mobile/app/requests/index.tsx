/**
 * 매물 요청(구해주세요) 리스트 — 다른 게시판과 다른 텍스트 기반 디자인.
 *
 * 요청 글은 이미지가 없는 경우가 많아 썸네일 placeholder 가 비어보임.
 * 대신: 상태 뱃지 + 거래/매물 유형 칩 + 큰 제목 + 본문 발췌 +
 *       지역/예산 메타 라인 + 푸터(작성자·조회·시간) 의 텍스트 카드 형식.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"
import { canRegisterDomain } from "@/lib/permissions"
import { HeaderActions } from "@/components/HeaderActions"
import { DomainTabBar } from "@/components/DomainTabBar"
import { RegionPicker } from "@/components/RegionPicker"
import {
  listPlazaRegions,
  loadRegionSelection,
  resolveUserDefaultRegion,
  saveRegionSelection,
  type Region,
  type RegionSelection,
} from "@/lib/region-utils"

const ROSE = "#e11d48"

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open: {
    label: "모집중",
    color: "#15803d",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.3)",
  },
  matched: {
    label: "매칭됨",
    color: "#1d4ed8",
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.3)",
  },
  closed: {
    label: "종료",
    color: lightColors.ink500,
    bg: lightColors.muted,
    border: lightColors.border,
  },
}

interface RequestItem {
  id: string
  title: string
  content: string
  region: string | null
  district: string | null
  dong: string | null
  property_type: string | null
  transaction_type: string | null
  budget_min: number | null
  budget_max: number | null
  status: string | null
  user_id: string
  views: number | null
  response_count: number | null
  created_at: string
  author_name?: string | null
}

function formatBudgetShort(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => {
    const eok = Math.floor(n / 100000000)
    const man = Math.floor((n % 100000000) / 10000)
    if (eok > 0) {
      return man > 0 ? `${eok}억 ${man}만` : `${eok}억`
    }
    return `${man}만`
  }
  if (min != null && max != null) {
    return `${fmt(min)}~${fmt(max)}원`
  }
  if (max != null) return `최대 ${fmt(max)}원`
  return `${fmt(min!)}원~`
}

function timeAgoKo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  if (day < 30) return `${Math.floor(day / 7)}주 전`
  return `${Math.floor(day / 30)}개월 전`
}

export default function RequestsListScreen() {
  const router = useRouter()
  const plazaId = useCurrentPlaza()
  const { user } = useAuth()
  const [items, setItems] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "matched" | "closed">("all")

  // 등록 권한 — account_type + admin 여부
  const [accountType, setAccountType] = useState<string>("user")
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!user) { setAccountType("user"); setIsAdmin(false); return }
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type, role").eq("id", user.id).maybeSingle(),
        plazaId
          ? supabase.from("plaza_profiles").select("account_type").eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const data: any = profRes.data || {}
      const pp: any = ppRes?.data || {}
      const t = (pp.account_type ?? data.account_type) as string | undefined
      const r = data.role as string | undefined
      setAccountType(t || "user")
      setIsAdmin(r === "admin" || r === "superadmin")
    })()
    return () => { cancelled = true }
  }, [user, plazaId])
  const canRegister = user ? canRegisterDomain("/requests", accountType, { isAdmin }) : false

  // 지역 필터
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ kind: "all" })
  const [regionList, setRegionList] = useState<Region[]>([])

  useEffect(() => {
    if (!plazaId) return
    let alive = true
    ;(async () => {
      const [userRegion, allRegions] = await Promise.all([
        user?.id ? resolveUserDefaultRegion(user.id, plazaId) : Promise.resolve(null),
        listPlazaRegions(plazaId),
      ])
      if (!alive) return
      setRegionList(allRegions)
      if (userRegion) setRegionSelection({ kind: "ids", ids: [userRegion] })
      else setRegionSelection({ kind: "all" })
    })()
    return () => {
      alive = false
    }
  }, [plazaId, user?.id])

  function changeRegionSelection(sel: RegionSelection) {
    setRegionSelection(sel)
    // 영속 저장 안 함 — 세션 내에서만 변경 유지
  }

  const regionSummary = useMemo(() => {
    if (regionSelection.kind === "all") return "전체 지역"
    const ids = regionSelection.ids
    if (ids.length === 0) return "전체 지역"
    const first = regionList.find((r) => r.id === ids[0])
    if (!first) return "지역 선택"
    if (ids.length === 1) return first.name
    return `${first.name} 외 ${ids.length - 1}`
  }, [regionSelection, regionList])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 0개 선택 → 빈 결과
      if (regionSelection.kind === "ids" && regionSelection.ids.length === 0) {
        setItems([])
        return
      }
      const supabase = getSupabase()
      const useRegionFilter =
        regionSelection.kind === "ids" && regionSelection.ids.length > 0
      // 특정 지역 선택 시 region_id NULL 글은 제외 (전체 지역 선택일 때만 표시)
      const regionOrClause = useRegionFilter
        ? `region_id.in.(${regionSelection.ids.map((id) => `"${id}"`).join(",")})`
        : null

      async function attempt(opts: { withRegion: boolean }) {
        let q: any = supabase
          .from("property_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
        if (plazaId) q = q.eq("plaza_id", plazaId)
        if (opts.withRegion && regionOrClause) q = q.or(regionOrClause)
        return await q
      }
      let res = await attempt({ withRegion: true })
      if (res.error) res = await attempt({ withRegion: false })
      setItems((res.data ?? []) as RequestItem[])
    } finally {
      setLoading(false)
    }
  }, [plazaId, regionSelection])

  useEffect(() => {
    load()
  }, [load])

  // useFocusEffect 는 mount 시에도 fire — useEffect(load) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      load()
    }, [load]),
  )

  async function onRefresh() {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    let list = items
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.content ?? "").toLowerCase().includes(q) ||
          (r.region ?? "").toLowerCase().includes(q) ||
          (r.district ?? "").toLowerCase().includes(q),
      )
    }
    return list
  }, [items, search, statusFilter])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>구해주세요</Text>
        <HeaderActions />
      </View>
      <DomainTabBar current="requests" />

      {/* 검색 바 + 지역 칩 (인라인) */}
      <View style={styles.hero}>
        {plazaId ? (
          <RegionPicker
            plazaId={plazaId}
            mode="filter"
            selection={regionSelection}
            onChange={changeRegionSelection}
            trigger={(open) => (
              <Pressable onPress={open} style={styles.heroRegionChip}>
                <Ionicons name="location" size={16} color="#71717a" />
                <Text style={styles.heroRegionChipText}>{regionSummary}</Text>
                <Ionicons name="chevron-down" size={12} color="#71717a" />
              </Pressable>
            )}
          />
        ) : null}
        <View style={styles.heroSearch}>
          <Ionicons name="search" size={16} color={lightColors.ink500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="지역, 키워드 검색"
            placeholderTextColor={lightColors.ink500}
            style={styles.heroSearchInput}
          />
        </View>
        {canRegister ? (
          <Pressable
            onPress={() => router.push("/requests/new" as any)}
            hitSlop={6}
            style={styles.heroAddBtn}
          >
            <Ionicons name="add-circle" size={32} color={ROSE} />
          </Pressable>
        ) : null}
      </View>

      {/* 상태 chips */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={{ flexGrow: 0 }}
        >
          {(["all", "open", "matched", "closed"] as const).map((s) => {
            const on = statusFilter === s
            const label = s === "all" ? "전체" : STATUS_LABEL[s].label
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.chip, on && styles.chipActive]}
              >
                <Text style={[styles.chipText, on && styles.chipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>매물 요청 {filtered.length}개</Text>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={{ padding: spacing[3], gap: 10, paddingBottom: spacing[8] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ROSE} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="hand-left-outline" size={32} color={lightColors.ink500} />
            <Text style={styles.emptyText}>요청이 없습니다</Text>
          </View>
        ) : (
          filtered.map((r) => {
            const status = STATUS_LABEL[r.status ?? "open"] ?? STATUS_LABEL.open
            const budget = formatBudgetShort(r.budget_min, r.budget_max)
            const region =
              [r.region, r.district, r.dong].filter(Boolean).join(" ") || null
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/requests/${r.id}` as any)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {/* 상단 상태 + 거래/매물 칩 */}
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: status.bg, borderColor: status.border },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                  {!!r.transaction_type && (
                    <View style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{r.transaction_type}</Text>
                    </View>
                  )}
                  {!!r.property_type && (
                    <View style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{r.property_type}</Text>
                    </View>
                  )}
                </View>

                {/* 제목 */}
                <Text style={styles.cardTitle} numberOfLines={2}>{r.title}</Text>
                {/* 본문 발췌 */}
                {!!r.content && (
                  <Text style={styles.cardContent} numberOfLines={2}>
                    {r.content}
                  </Text>
                )}

                {/* 메타 — 지역 / 예산 */}
                {(region || budget) && (
                  <View style={styles.cardMetaRow}>
                    {region && (
                      <View style={styles.metaItem}>
                        <Ionicons name="location-outline" size={12} color={lightColors.ink500} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {region}
                        </Text>
                      </View>
                    )}
                    {budget && (
                      <View style={styles.metaItem}>
                        <Ionicons name="wallet-outline" size={12} color={ROSE} />
                        <Text style={[styles.metaText, { color: ROSE, fontWeight: "700" }]}>
                          {budget}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* 푸터 — 시간 / 응답수 / 조회 */}
                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>{timeAgoKo(r.created_at)}</Text>
                  <View style={styles.footerStats}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={12}
                      color={lightColors.ink500}
                    />
                    <Text style={styles.footerText}>{r.response_count ?? 0}</Text>
                    <Ionicons name="eye-outline" size={12} color={lightColors.ink500} />
                    <Text style={styles.footerText}>{r.views ?? 0}</Text>
                  </View>
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { padding: spacing[8], alignItems: "center" },
  empty: { paddingVertical: 40, alignItems: "center", gap: 8 },
  emptyText: { color: lightColors.ink500, fontSize: fontSize.sm },

  header: {
    flexDirection: "row", alignItems: "center",
    height: 52, paddingHorizontal: spacing[3],
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900, flex: 1, lineHeight: 24, marginLeft: 4 },

  hero: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing[3], marginTop: spacing[3], marginBottom: 8,
  },
  heroRegionChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 40, paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#f4f4f5",
    borderWidth: 1, borderColor: "#e4e4e7",
  },
  heroRegionChipText: { fontSize: 12, fontWeight: "700", color: "#3f3f46", lineHeight: 16, includeFontPadding: false },
  heroSearch: {
    flex: 1, height: 40,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: lightColors.muted, borderRadius: 999,
    paddingHorizontal: 12,
  },
  heroSearchInput: { flex: 1, fontSize: fontSize.sm, color: lightColors.ink900, padding: 0 },
  heroAddBtn: { justifyContent: "center", alignItems: "center", height: 40 },

  chipRowWrap: { height: 52, backgroundColor: lightColors.background },
  chipRow: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 0,
    height: 36, borderRadius: 999,
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: ROSE,
    borderColor: ROSE,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: lightColors.ink700 },
  chipTextActive: { color: "#ffffff", fontWeight: "700" },

  toolbar: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  count: { fontSize: fontSize.sm, color: lightColors.ink500 },

  // 텍스트 카드 — 썸네일 없음
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },
  tagChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  },
  tagChipText: { fontSize: 10, fontWeight: "600", color: lightColors.ink700 },

  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: lightColors.ink900,
    lineHeight: 20,
  },
  cardContent: {
    fontSize: 12,
    color: lightColors.ink500,
    lineHeight: 17,
  },

  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 2,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, color: lightColors.ink500 },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  footerStats: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 11, color: lightColors.ink500 },
})
