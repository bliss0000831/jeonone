/**
 * 서비스 요청(도와주세요) 리스트 — 매물 요청(구해주세요) 리스트와 동일한 텍스트 카드 디자인.
 *
 * service_requests 테이블 직접 Supabase 쿼리.
 * 서비스 유형(인테리어/이사/청소/수리) + 상태 필터, 검색, plaza 격리.
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

const EMERALD = "#10b981"

const SERVICE_TYPE_LABEL: Record<string, string> = {
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

const SERVICE_TYPE_COLOR: Record<string, string> = {
  interior: "#a855f7",
  moving: "#eab308",
  cleaning: "#38bdf8",
  repair: "#f97316",
}

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

type ServiceType = "all" | "interior" | "moving" | "cleaning" | "repair"
type StatusFilter = "all" | "open" | "matched" | "closed"

interface ServiceRequestItem {
  id: string
  user_id: string
  title: string
  content: string
  service_type: string | null
  region: string | null
  district: string | null
  dong: string | null
  budget_min: number | null
  budget_max: number | null
  desired_date: string | null
  status: string | null
  views: number | null
  created_at: string
  response_count?: number
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

export default function ServiceRequestsListScreen() {
  const router = useRouter()
  const plazaId = useCurrentPlaza()
  const { user } = useAuth()
  const [items, setItems] = useState<ServiceRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<ServiceType>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ kind: "all" })
  const [regionList, setRegionList] = useState<Region[]>([])

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
  const canRegister = user ? canRegisterDomain("/service-requests", accountType, { isAdmin }) : false

  // 지역 초기화 — 구해주세요 리스트와 동일 로직
  useEffect(() => {
    if (!plazaId) return
    ;(async () => {
      const [userRegion, allRegions] = await Promise.all([
        user?.id ? resolveUserDefaultRegion(user.id, plazaId) : Promise.resolve(null),
        listPlazaRegions(plazaId),
      ])
      setRegionList(allRegions)
      if (userRegion) setRegionSelection({ kind: "ids", ids: [userRegion] })
      else setRegionSelection({ kind: "all" })
    })()
  }, [plazaId, user?.id])

  function changeRegionSelection(sel: RegionSelection) {
    setRegionSelection(sel)
  }

  const regionSummary = useMemo(() => {
    if (regionSelection.kind === "all") return "전체 지역"
    const ids = regionSelection.ids
    if (ids.length === 0) return "전체 지역"
    const first = regionList.find((r) => r.id === ids[0])
    if (!first) return "전체 지역"
    return ids.length === 1 ? first.name : `${first.name} 외 ${ids.length - 1}`
  }, [regionSelection, regionList])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getSupabase()
      let q: any = supabase
        .from("service_requests")
        .select(
          "id, user_id, title, content, service_type, region, district, dong, budget_min, budget_max, desired_date, status, views, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50)
      if (plazaId) q = q.eq("plaza_id", plazaId)
      if (typeFilter !== "all") q = q.eq("service_type", typeFilter)
      if (statusFilter !== "all") q = q.eq("status", statusFilter)

      // 지역 필터
      const useRegionFilter =
        regionSelection.kind === "ids" && regionSelection.ids.length > 0
      if (useRegionFilter) {
        const regionOrClause = `region_id.in.(${regionSelection.ids.map((id) => `"${id}"`).join(",")})`
        q = q.or(regionOrClause)
      }

      const { data, error } = await q
      if (error) {
        console.warn("[service-requests] load error", error)
        setItems([])
        return
      }
      const rows: ServiceRequestItem[] = data ?? []

      // 응답 수 카운트
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id)
        const { data: counts } = await supabase
          .from("service_request_responses")
          .select("request_id")
          .in("request_id", ids)
        const countMap: Record<string, number> = {}
        ;(counts ?? []).forEach((c: any) => {
          countMap[c.request_id] = (countMap[c.request_id] || 0) + 1
        })
        rows.forEach((r) => {
          r.response_count = countMap[r.id] || 0
        })
      }

      setItems(rows)
    } finally {
      setLoading(false)
    }
  }, [plazaId, typeFilter, statusFilter, regionSelection])

  useEffect(() => {
    load()
  }, [load])

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
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.content ?? "").toLowerCase().includes(q) ||
        (r.region ?? "").toLowerCase().includes(q) ||
        (r.district ?? "").toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>도와주세요</Text>
        <HeaderActions />
      </View>
      <DomainTabBar current="service-requests" />

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
            onPress={() => router.push("/service-requests/new" as any)}
            hitSlop={6}
            style={styles.heroAddBtn}
          >
            <Ionicons name="add-circle" size={32} color={EMERALD} />
          </Pressable>
        ) : null}
      </View>

      {/* 서비스 유형 chips */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={{ flexGrow: 0 }}
        >
          {(["all", "interior", "moving", "cleaning", "repair"] as const).map((s) => {
            const on = typeFilter === s
            const label = s === "all" ? "전체" : SERVICE_TYPE_LABEL[s]
            return (
              <Pressable
                key={s}
                onPress={() => setTypeFilter(s)}
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

      {/* 상태 chips */}
      <View style={[styles.chipRowWrap, { height: 44 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipRow, { paddingVertical: 4 }]}
          style={{ flexGrow: 0 }}
        >
          {(["all", "open", "matched", "closed"] as const).map((s) => {
            const on = statusFilter === s
            const label = s === "all" ? "전체" : STATUS_LABEL[s].label
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.statusChip, on && styles.statusChipActive]}
              >
                <Text style={[styles.statusChipText, on && styles.statusChipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>서비스 요청 {filtered.length}개</Text>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={{ padding: spacing[3], gap: 10, paddingBottom: spacing[8] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={EMERALD} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={32} color={lightColors.ink500} />
            <Text style={styles.emptyText}>요청이 없습니다</Text>
          </View>
        ) : (
          filtered.map((r) => {
            const status = STATUS_LABEL[r.status ?? "open"] ?? STATUS_LABEL.open
            const serviceType = r.service_type ?? "repair"
            const serviceColor = SERVICE_TYPE_COLOR[serviceType] ?? "#6b7280"
            const serviceLabel = SERVICE_TYPE_LABEL[serviceType] ?? serviceType
            const budget = formatBudgetShort(r.budget_min, r.budget_max)
            const region =
              [r.region, r.district, r.dong].filter(Boolean).join(" ") || null
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/service-requests/${r.id}` as any)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {/* 상단: 서비스 유형 뱃지 + 상태 뱃지 */}
                <View style={styles.cardTopRow}>
                  <View style={[styles.serviceTypeBadge, { backgroundColor: serviceColor + "20", borderColor: serviceColor + "40" }]}>
                    <Text style={[styles.serviceTypeBadgeText, { color: serviceColor }]}>
                      {serviceLabel}
                    </Text>
                  </View>
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
                </View>

                {/* 제목 */}
                <Text style={styles.cardTitle} numberOfLines={2}>{r.title}</Text>
                {/* 본문 발췌 */}
                {!!r.content && (
                  <Text style={styles.cardContent} numberOfLines={2}>
                    {r.content}
                  </Text>
                )}

                {/* 메타 — 지역 / 예산 / 희망일 */}
                {(region || budget || r.desired_date) && (
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
                        <Ionicons name="wallet-outline" size={12} color={EMERALD} />
                        <Text style={[styles.metaText, { color: EMERALD, fontWeight: "700" }]}>
                          {budget}
                        </Text>
                      </View>
                    )}
                    {!!r.desired_date && (
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={12} color={lightColors.ink500} />
                        <Text style={styles.metaText}>
                          {new Date(r.desired_date).toLocaleDateString("ko-KR")}
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
    backgroundColor: EMERALD,
    borderColor: EMERALD,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: lightColors.ink700 },
  chipTextActive: { color: "#ffffff", fontWeight: "700" },

  statusChip: {
    paddingHorizontal: 12, paddingVertical: 0,
    height: 30, borderRadius: 999,
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: lightColors.border,
  },
  statusChipActive: {
    backgroundColor: EMERALD + "18",
    borderColor: EMERALD,
  },
  statusChipText: { fontSize: 12, fontWeight: "600", color: lightColors.ink500 },
  statusChipTextActive: { color: EMERALD, fontWeight: "700" },

  toolbar: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  count: { fontSize: fontSize.sm, color: lightColors.ink500 },

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
  serviceTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  serviceTypeBadgeText: { fontSize: 11, fontWeight: "700" },
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
