/** 농기구 대여 — 목록 (RN). 웹 /rental 과 동일. */
import { useState, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image, ImageBackground } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlazaState } from "@/lib/plaza"
import { DomainTabBar } from "@/components/DomainTabBar"
import { HeaderActions } from "@/components/HeaderActions"

const GREEN = "#225a39"
const IMG = require("../../assets/images/card-farm-equipment.jpg")
function won(n: number) {
  if (!n) return "문의"
  if (n >= 10000) return `${(n / 10000).toLocaleString()}만원`
  return `${n.toLocaleString()}원`
}

export default function RentalListScreen() {
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
      let q = (getSupabase() as any)
        .from("rental_listings")
        .select("id, daily_price, deposit, post:secondhand_posts(title, images, location)")
        .order("created_at", { ascending: false }).limit(60)
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
        <Text style={styles.barTitle}>농기구 대여</Text>
        <HeaderActions />
      </View>

      <DomainTabBar current="rental" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} />}
      >
        <ImageBackground source={IMG} style={styles.hero}>
          <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.6)"]} style={styles.heroOverlay}>
            <Ionicons name="construct" size={40} color="#fff" />
            <Text style={styles.heroTitle}>농기구 대여</Text>
            <Text style={styles.heroSub}>필요할 때 빌려 쓰는 농기구</Text>
          </LinearGradient>
        </ImageBackground>
        <View style={{ padding: 16 }}>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>대여 가능한 농기구</Text>
            <Pressable onPress={() => router.push("/rental/manage" as any)} hitSlop={8} style={styles.manageBtn}>
              <Ionicons name="calendar-outline" size={15} color={GREEN} />
              <Text style={styles.manageText}>예약 관리</Text>
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : loadError ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>대여 정보를 불러오지 못했어요</Text>
              <Pressable onPress={() => load()} style={styles.retryBtn}><Text style={styles.retryText}>다시 시도</Text></Pressable>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}><Ionicons name="construct-outline" size={48} color="#cbd5e1" /><Text style={styles.emptyText}>대여 상품이 없어요</Text></View>
          ) : (
            <View style={{ gap: 12 }}>
              {items.map((r) => (
                <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/rental/${r.id}` as any)}>
                  <Image source={r.post?.images?.[0] ? { uri: r.post.images[0] } : IMG} style={styles.cardImg} contentFit="cover" />
                  <View style={{ flex: 1, padding: 12 }}>
                    <View style={styles.badge}><Ionicons name="calendar-outline" size={12} color="#fff" /><Text style={styles.badgeText}>대여</Text></View>
                    <Text style={styles.cardTitle} numberOfLines={1}>{r.post?.title || "농기구"}</Text>
                    <Text style={styles.cardPrice}>{won(r.daily_price)}<Text style={styles.per}> / 일</Text></Text>
                    {r.deposit ? <Text style={styles.dep}>보증금 {won(r.deposit)}</Text> : null}
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
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  manageText: { fontSize: 13, fontWeight: "800", color: GREEN },
  hero: { width: "100%", height: 160 },
  heroOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 6 },
  heroSub: { color: "#fff", fontSize: 13, marginTop: 2 },
  section: { fontSize: 16, fontWeight: "800", color: "#1e293b" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: GREEN },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#eee" },
  cardImg: { width: 110, height: 110 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  cardPrice: { fontSize: 18, fontWeight: "900", color: GREEN, marginTop: 4 },
  per: { fontSize: 13, fontWeight: "700", color: "#64748b" },
  dep: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
})
