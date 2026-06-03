/** 대여 예약 관리 (RN). 웹 /rental/manage 와 동일 — 받은 신청 승인/거절 + 내 신청. */
import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"

const GREEN = "#225a39"
const IMG = require("../../assets/images/card-farm-equipment.jpg")
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  requested: { label: "승인 대기", bg: "#fef3c7", fg: "#b45309" },
  approved: { label: "승인됨", bg: "#d1fae5", fg: "#047857" },
  in_use: { label: "대여중", bg: "#dbeafe", fg: "#1d4ed8" },
  returned: { label: "반납됨", bg: "#f1f5f9", fg: "#475569" },
  completed: { label: "완료", bg: "#f1f5f9", fg: "#475569" },
  cancelled: { label: "취소/거절됨", bg: "#ffe4e6", fg: "#e11d48" },
}

const dayCount = (s: string, e: string) =>
  Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1)

export default function RentalManageScreen() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [tab, setTab] = useState<"received" | "sent">("received")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    setUid(user?.id || null)
    if (!user) { setRows([]); setLoading(false); return }
    const { data } = await (sb as any).from("rental_bookings")
      .select("*, rental:rental_listings(owner_id, plaza_id, post:secondhand_posts(title, images))")
      .order("created_at", { ascending: false })
    const list: any[] = data || []
    const renterIds = Array.from(new Set(list.map((b) => b.renter_id)))
    if (renterIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, nickname, full_name").in("id", renterIds)
      const pmap = new Map((profs || []).map((p: any) => [p.id, p.nickname || p.full_name || "농부님"]))
      list.forEach((b) => { b.renterName = pmap.get(b.renter_id) || "농부님" })
    }
    setRows(list); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const received = rows.filter((b) => b.rental?.owner_id === uid && b.renter_id !== uid)
  const sent = rows.filter((b) => b.renter_id === uid)

  const notify = async (toUser: string, title: string, message: string, plaza?: string | null) => {
    if (!uid || toUser === uid) return
    try {
      await getSupabase().from("notifications").insert({
        user_id: toUser, type: "rental_response", title, message,
        link: "/rental/manage", actor_id: uid, ...(plaza ? { plaza_id: plaza } : {}),
      })
    } catch { /* ignore */ }
  }

  const setStatus = async (b: any, next: string) => {
    setBusy(b.id)
    const { error } = await (getSupabase() as any).from("rental_bookings")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", b.id)
    setBusy(null)
    if (error) { Alert.alert("처리 실패", error.message); return }
    const title = b.rental?.post?.title || "농기구"
    if (next === "approved") notify(b.renter_id, "대여 승인됨", `${title} 대여가 승인되었습니다`, b.rental?.plaza_id)
    else if (next === "cancelled") notify(b.renter_id, "대여 거절됨", `${title} 대여 신청이 거절되었습니다`, b.rental?.plaza_id)
    load()
  }

  const cancelMine = async (b: any) => {
    setBusy(b.id)
    const { error } = await (getSupabase() as any).from("rental_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", b.id)
    setBusy(null)
    if (error) { Alert.alert("취소 실패", error.message); return }
    load()
  }

  const renderCard = (b: any, mine: boolean) => {
    const st = STATUS[b.status] || STATUS.requested
    return (
      <View key={b.id} style={styles.card}>
        <View style={{ flexDirection: "row", gap: 12, padding: 12 }}>
          <Image source={b.rental?.post?.images?.[0] ? { uri: b.rental.post.images[0] } : IMG} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{b.rental?.post?.title || "농기구"}</Text>
              <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
            </View>
            <Text style={styles.meta}><Ionicons name="calendar-outline" size={12} /> {b.start_date} ~ {b.end_date} ({dayCount(b.start_date, b.end_date)}일)</Text>
            {!mine && <Text style={styles.metaSm}>신청자: {b.renterName}</Text>}
            <Text style={styles.cardPrice}>{won(b.total_amount)}{b.deposit ? <Text style={styles.depSm}> + 보증금 {won(b.deposit)}</Text> : null}</Text>
          </View>
        </View>
        {!mine && b.status === "requested" && (
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={() => setStatus(b, "approved")} disabled={busy === b.id}>
              {busy === b.id ? <ActivityIndicator color="#047857" size="small" /> : <><Ionicons name="checkmark" size={16} color="#047857" /><Text style={[styles.actionText, { color: "#047857" }]}>승인</Text></>}
            </Pressable>
            <View style={styles.vline} />
            <Pressable style={styles.actionBtn} onPress={() => setStatus(b, "cancelled")} disabled={busy === b.id}>
              <Ionicons name="close" size={16} color="#e11d48" /><Text style={[styles.actionText, { color: "#e11d48" }]}>거절</Text>
            </Pressable>
          </View>
        )}
        {!mine && b.status === "approved" && (
          <Pressable style={styles.fullBtn} onPress={() => setStatus(b, "completed")} disabled={busy === b.id}>
            {busy === b.id ? <ActivityIndicator color={GREEN} size="small" /> : <><Ionicons name="cube-outline" size={16} color={GREEN} /><Text style={[styles.actionText, { color: GREEN }]}>반납 완료 처리</Text></>}
          </Pressable>
        )}
        {mine && (b.status === "requested" || b.status === "approved") && (
          <Pressable style={styles.fullBtn} onPress={() => cancelMine(b)} disabled={busy === b.id}>
            {busy === b.id ? <ActivityIndicator color="#64748b" size="small" /> : <><Ionicons name="close" size={16} color="#64748b" /><Text style={[styles.actionText, { color: "#64748b" }]}>신청 취소</Text></>}
          </Pressable>
        )}
      </View>
    )
  }

  const list = tab === "received" ? received : sent

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>대여 예약 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === "received" && styles.tabOn]} onPress={() => setTab("received")}>
          <Ionicons name="download-outline" size={15} color={tab === "received" ? "#fff" : "#64748b"} />
          <Text style={[styles.tabText, tab === "received" && styles.tabTextOn]}>받은 신청{received.length ? ` (${received.length})` : ""}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "sent" && styles.tabOn]} onPress={() => setTab("sent")}>
          <Ionicons name="send-outline" size={15} color={tab === "sent" ? "#fff" : "#64748b"} />
          <Text style={[styles.tabText, tab === "sent" && styles.tabTextOn]}>내 신청{sent.length ? ` (${sent.length})` : ""}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={GREEN} style={{ marginTop: 60 }} />
      ) : !uid ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>로그인이 필요합니다</Text></View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={52} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>{tab === "received" ? "받은 대여 신청이 없습니다" : "신청한 대여가 없습니다"}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
          {list.map((b) => renderCard(b, tab === "sent"))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 48, borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 2, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  tabOn: { backgroundColor: GREEN, borderColor: GREEN },
  tabText: { fontSize: 14, fontWeight: "800", color: "#64748b" },
  tabTextOn: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#334155" },
  card: { borderWidth: 2, borderColor: "#e2e8f0", borderRadius: 16, overflow: "hidden", backgroundColor: "#fff" },
  thumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: "#f1f5f9" },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#1e293b", marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  meta: { fontSize: 13, color: "#64748b", marginTop: 5 },
  metaSm: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  cardPrice: { fontSize: 15, fontWeight: "900", color: GREEN, marginTop: 5 },
  depSm: { fontSize: 12, fontWeight: "500", color: "#94a3b8" },
  actionRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11 },
  vline: { width: 1, backgroundColor: "#eee" },
  fullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#eee" },
  actionText: { fontSize: 14, fontWeight: "800" },
})
