/** 만물 경매장 — 목록 (RN). 웹 /auction 과 동일 구성. */
import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image, ImageBackground } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlazaState } from "@/lib/plaza"
import { DomainTabBar } from "@/components/DomainTabBar"
import { HeaderActions } from "@/components/HeaderActions"

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
        .limit(60)
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>만물 경매장</Text>
        <HeaderActions />
      </View>

      <DomainTabBar current="auction" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} />}
      >
        <ImageBackground source={AUCTION_IMG} style={styles.hero}>
          <LinearGradient colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0.6)"]} style={styles.heroOverlay}>
            <Ionicons name="hammer" size={44} color="#fff" />
            <Text style={styles.heroTitle}>만물 경매장</Text>
            <Text style={styles.heroSub}>농산물·농기구 경매 / 즉시 거래</Text>
          </LinearGradient>
        </ImageBackground>

        <View style={{ padding: 16 }}>
          <Text style={styles.section}>진행 중인 경매</Text>
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
            <View style={{ gap: 12 }}>
              {items.map((a) => (
                <Pressable key={a.id} style={styles.card} onPress={() => router.push(`/auction/${a.id}` as any)}>
                  <Image source={a.post?.images?.[0] ? { uri: a.post.images[0] } : AUCTION_IMG} style={styles.cardImg} contentFit="cover" />
                  <View style={{ flex: 1, padding: 12 }}>
                    <View style={styles.timeBadge}><Ionicons name="time-outline" size={12} color="#fff" /><Text style={styles.timeText}>{timeLeft(a.end_at)}</Text></View>
                    <Text style={styles.cardTitle} numberOfLines={1}>{a.post?.title || "경매 물품"}</Text>
                    <Text style={styles.cardLabel}>현재가</Text>
                    <Text style={styles.cardPrice}>{won(a.current_price || a.start_price)}</Text>
                    <Text style={styles.cardBids}>입찰 {a.bid_count}회</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f6f0" },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 52, backgroundColor: "#fff" },
  barTitle: { fontSize: 17, fontWeight: "700", color: "#1e293b", flex: 1, marginLeft: 4 },
  hero: { width: "100%", height: 170 },
  heroOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 8 },
  heroSub: { color: "#fff", fontSize: 14, marginTop: 4 },
  section: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginBottom: 12 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: GREEN },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#eee" },
  cardImg: { width: 120, height: 120 },
  timeBadge: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: "#e11d48", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  timeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  cardLabel: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  cardPrice: { fontSize: 18, fontWeight: "900", color: GREEN },
  cardBids: { fontSize: 12, color: "#64748b", marginTop: 2 },
})
