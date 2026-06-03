/** 대여 상세 + 신청 (RN). 웹 /rental/[id] 과 동일. */
import { useState, useEffect, useCallback, useMemo } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"

const GREEN = "#225a39"
const IMG = require("../../assets/images/card-farm-equipment.jpg")
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())

export default function RentalDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [r, setR] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await (getSupabase() as any).from("rental_listings")
      .select("*, post:secondhand_posts(title, description, images)").eq("id", id).maybeSingle()
    setR(data); setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const days = useMemo(() => {
    if (!isDate(start) || !isDate(end)) return 0
    const d = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
    return d > 0 ? d : 0
  }, [start, end])
  const total = r ? days * (r.daily_price || 0) : 0

  const apply = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { Alert.alert("로그인 필요", "로그인이 필요합니다"); return }
    if (days <= 0) { Alert.alert("기간 확인", "대여 기간을 올바르게 입력해주세요 (YYYY-MM-DD)"); return }
    setSubmitting(true)
    const { error } = await (sb as any).from("rental_bookings").insert({
      rental_id: id, renter_id: user.id, start_date: start, end_date: end,
      total_amount: total, deposit: r.deposit || 0, status: "requested",
    })
    setSubmitting(false)
    if (error) { Alert.alert("신청 실패", error.message); return }
    // 소유자에게 알림 (actor_id = 본인 → RLS 교차 INSERT 허용)
    if (r.owner_id && r.owner_id !== user.id) {
      try {
        await sb.from("notifications").insert({
          user_id: r.owner_id, type: "rental_request", title: "새 대여 신청",
          message: `${r.post?.title || "농기구"} · ${start}~${end} (${days}일)`,
          link: "/rental/manage", actor_id: user.id,
          ...(r.plaza_id ? { plaza_id: r.plaza_id } : {}),
        })
      } catch { /* ignore */ }
    }
    Alert.alert("신청 완료", "대여 신청이 접수되었습니다. 소유자 승인을 기다려주세요.")
    setStart(""); setEnd("")
  }

  if (loading) return <SafeAreaView style={styles.safe}><ActivityIndicator color={GREEN} style={{ marginTop: 60 }} /></SafeAreaView>
  if (!r) return <SafeAreaView style={styles.safe}><Text style={styles.notFound}>대여 상품을 찾을 수 없습니다</Text></SafeAreaView>

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>대여 상세</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Image source={r.post?.images?.[0] ? { uri: r.post.images[0] } : IMG} style={styles.img} contentFit="cover" />
        <View style={{ padding: 16 }}>
          <Text style={styles.title}>{r.post?.title || "농기구"}</Text>
          <View style={styles.priceBox}>
            <Text style={styles.price}>{won(r.daily_price)}<Text style={styles.per}> / 일</Text></Text>
            {r.deposit ? <Text style={styles.dep}>보증금 {won(r.deposit)} (반납 후 환급)</Text> : null}
          </View>
          {r.post?.description ? <Text style={styles.desc}>{r.post.description}</Text> : null}

          <Text style={styles.label}>대여 기간 선택</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>시작일</Text>
              <TextInput value={start} onChangeText={setStart} placeholder="2026-06-10" placeholderTextColor="#94a3b8" style={styles.dateInput} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>반납일</Text>
              <TextInput value={end} onChangeText={setEnd} placeholder="2026-06-12" placeholderTextColor="#94a3b8" style={styles.dateInput} />
            </View>
          </View>
          {days > 0 && (
            <View style={styles.totalRow}>
              <Text style={{ color: "#64748b" }}>{days}일 대여</Text>
              <Text style={styles.total}>{won(total)}{r.deposit ? ` + 보증금 ${won(r.deposit)}` : ""}</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <View style={styles.btnBar}>
        <Pressable style={styles.btn} onPress={apply} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="calendar" size={18} color="#fff" /><Text style={styles.btnText}>대여 신청{total > 0 ? ` · ${won(total)}` : ""}</Text></>}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  notFound: { textAlign: "center", marginTop: 60, color: "#64748b" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 48, borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  img: { width: "100%", height: 240 },
  title: { fontSize: 22, fontWeight: "900", color: "#1e293b", marginBottom: 12 },
  priceBox: { borderWidth: 2, borderColor: "rgba(34,90,57,0.2)", borderRadius: 16, padding: 16, marginBottom: 14 },
  price: { fontSize: 26, fontWeight: "900", color: GREEN },
  per: { fontSize: 15, fontWeight: "700", color: "#64748b" },
  dep: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  desc: { fontSize: 14, color: "#334155", lineHeight: 21, marginBottom: 16 },
  label: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  dateInput: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  total: { fontSize: 17, fontWeight: "900", color: GREEN },
  btnBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
})
