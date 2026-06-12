/** 만물 경매장 — 목록 (RN). 농기구/자재(DomainListScreen) 와 동일한 셸·행 카드. */
import { useState, useCallback } from "react"
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native"
import { useRouter, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlazaState } from "@/lib/plaza"
import { DomainScreenShell } from "@/components/DomainScreenShell"

const GREEN = "#225a39"
const AUCTION_IMG = require("../../assets/images/card-auction.jpg")

function won(n: number) {
  if (!n) return "0원"
  if (n >= 10000) return `${(n / 10000).toLocaleString()}만원`
  return `${n.toLocaleString()}원`
}
function timeLeft(end: string) {
  const ms = new Date(end).getTime() - Date.now()
  if (ms <= 0) return "마감"
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}일 남음`
  if (h >= 1) return `${h}시간 남음`
  return `${Math.max(1, Math.floor(ms / 60000))}분 남음`
}

export default function AuctionListScreen() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setLoadError(false)
    try {
      const sb = getSupabase()
      try { await (sb as any).rpc("close_expired_auctions") } catch { /* ignore */ }
      let q = (sb as any)
        .from("auction_listings")
        .select("id, start_price, current_price, bid_count, end_at, status, post:secondhand_posts(title, images)")
        .eq("status", "active")
        .order("end_at", { ascending: true })
        .limit(200)
      if (plaza.id) q = q.eq("plaza_id", plaza.id)
      const { data, error } = await q
      if (error) throw error
      setItems((data as any[]) || [])
    } catch { setLoadError(true) }
    setLoading(false)
  }, [plaza.id])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }, [load])

  useFocusEffect(useCallback(() => { load() }, [load]))

  return (
    <DomainScreenShell
      title="만물 경매장"
      tab="auction"
      heroImage={AUCTION_IMG}
      heroIcon="hammer"
      heroSub="농산물·농기구 경매 / 즉시 거래"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {/* 개수 툴바 — 농기구/자재 toolbar 1:1 */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>진행 중인 경매 {loading ? "" : `${items.length}개`}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
      ) : loadError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>경매 정보를 불러오지 못했어요</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="hammer-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>진행 중인 경매가 없어요</Text>
        </View>
      ) : (
        <View>
          {items.map((a) => (
            <Pressable key={a.id} style={styles.row} onPress={() => router.push(`/auction/${a.id}` as any)}>
              <View style={styles.thumbWrap}>
                <Image source={a.post?.images?.[0] ? { uri: a.post.images[0] } : AUCTION_IMG} style={styles.thumb} contentFit="cover" />
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={12} color="#fff" />
                  <Text style={styles.timeText}>{timeLeft(a.end_at)}</Text>
                </View>
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>{a.post?.title || "경매 물품"}</Text>
                <Text style={styles.metaLabel}>현재가</Text>
                <Text style={styles.price}>{won(a.current_price || a.start_price)}</Text>
                <View style={styles.bidsRow}>
                  <Ionicons name="trending-up" size={13} color={lightColors.ink500} />
                  <Text style={styles.bids}>입찰 {a.bid_count}회</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </DomainScreenShell>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
  },
  count: { fontSize: fontSize.sm, color: lightColors.ink500 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: GREEN },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  // 행 카드 — DomainListScreen listItem 1:1 (130 썸네일 + borderBottom)
  row: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  thumbWrap: { width: 130, height: 130, borderRadius: 8, overflow: "hidden", backgroundColor: "#f1f5f9", position: "relative" },
  thumb: { width: "100%", height: "100%" },
  timeBadge: {
    position: "absolute", top: 6, left: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#e11d48", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  timeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, color: lightColors.ink900, fontWeight: "500", lineHeight: 22 },
  metaLabel: { fontSize: 12, color: lightColors.ink500, marginTop: 6 },
  price: { fontSize: 19, fontWeight: "800", color: GREEN, marginTop: 2 },
  bidsRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  bids: { fontSize: 12, color: lightColors.ink500 },
})
