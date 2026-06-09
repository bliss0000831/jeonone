/** 농기구 대여 — 목록 (RN). 농기구/자재(DomainListScreen) 와 동일한 셸·행 카드. */
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
    <DomainScreenShell
      title="농기구 대여"
      tab="rental"
      heroImage={IMG}
      heroIcon="construct"
      heroSub="필요할 때 빌려 쓰는 농기구"
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {/* 개수 툴바 — 농기구/자재 toolbar 1:1 (우측: 예약 관리) */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>대여 가능한 농기구 {loading ? "" : `${items.length}개`}</Text>
        <Pressable onPress={() => router.push("/rental/manage" as any)} hitSlop={8} style={styles.manageBtn}>
          <Ionicons name="calendar-outline" size={15} color={GREEN} />
          <Text style={styles.manageText}>예약 관리</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
      ) : loadError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>대여 정보를 불러오지 못했어요</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}><Text style={styles.retryText}>다시 시도</Text></Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="construct-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>대여 상품이 없어요</Text>
        </View>
      ) : (
        <View>
          {items.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => router.push(`/rental/${r.id}` as any)}>
              <View style={styles.thumbWrap}>
                <Image source={r.post?.images?.[0] ? { uri: r.post.images[0] } : IMG} style={styles.thumb} contentFit="cover" />
                <View style={styles.badge}>
                  <Ionicons name="calendar-outline" size={12} color="#fff" />
                  <Text style={styles.badgeText}>대여</Text>
                </View>
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>{r.post?.title || "농기구"}</Text>
                <Text style={styles.price}>{won(r.daily_price)}<Text style={styles.per}> / 일</Text></Text>
                {r.deposit ? <Text style={styles.dep}>보증금 {won(r.deposit)}</Text> : null}
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
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  manageText: { fontSize: 13, fontWeight: "800", color: GREEN },
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
  badge: {
    position: "absolute", top: 6, left: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: GREEN, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, color: lightColors.ink900, fontWeight: "500", lineHeight: 22 },
  price: { fontSize: 19, fontWeight: "800", color: GREEN, marginTop: 6 },
  per: { fontSize: 13, fontWeight: "700", color: lightColors.ink500 },
  dep: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
})
