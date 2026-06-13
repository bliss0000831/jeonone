/** 대여 상세 + 신청 (RN). 웹 /rental/[id] 과 동일. */
import { useState, useEffect, useCallback, useMemo } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Platform, FlatList, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import DateTimePicker from "@react-native-community/datetimepicker"
import { getSupabase } from "@/lib/supabase"
import { CallButton } from "@/components/CallButton"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { ImageLightbox } from "@/components/ImageLightbox"

const GREEN = "#225a39"
const IMG = require("../../assets/images/card-farm-equipment.jpg")
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

export default function RentalDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [r, setR] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [showStart, setShowStart] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const { width } = useWindowDimensions()

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
    if (submitting) return
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { Alert.alert("로그인 필요", "로그인이 필요합니다"); return }
    if (days <= 0) { Alert.alert("기간 확인", "대여 기간을 올바르게 입력해주세요 (YYYY-MM-DD)"); return }
    setSubmitting(true)
    try {
      // 금액·예치금·겹침검사는 서버(RPC)에서 권위적으로 처리 — 클라 계산값 미전송
      const { data, error } = await (sb as any).rpc("create_rental_booking", {
        p_rental: id, p_start: start, p_end: end,
      })
      if (error) { Alert.alert("신청 실패", "신청에 실패했어요. 잠시 후 다시 시도해주세요."); return }
      const res = data as any
      if (!res?.ok) { Alert.alert("신청 실패", res?.error || "신청에 실패했어요."); return }
      Alert.alert("신청 완료", "대여 신청이 접수되었습니다. 소유자 승인을 기다려주세요.")
      setStart(""); setEnd("")
    } catch {
      Alert.alert("신청 실패", "네트워크 상태를 확인하고 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <SafeAreaView style={styles.safe}><ActivityIndicator color={GREEN} style={{ marginTop: 60 }} /></SafeAreaView>
  if (!r) return <SafeAreaView style={styles.safe}><Text style={styles.notFound}>대여 상품을 찾을 수 없습니다</Text></SafeAreaView>

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>대여 상세</Text>
        <PostActionsMenu
          kind="secondhand"
          postId={r.post_id}
          authorId={r.owner_id}
          editHref={`/secondhand/${r.post_id}/edit`}
          onDeleted={() => router.back()}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {(r.post?.images?.length ?? 0) > 0 ? (
          <View>
            <FlatList
              data={r.post.images as string[]}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(it, idx) => `${idx}-${it}`}
              onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => { setImageIndex(index); setLightboxOpen(true) }}>
                  <Image source={{ uri: item }} style={{ width, height: 240 }} contentFit="cover" />
                </Pressable>
              )}
            />
            {r.post.images.length > 1 && (
              <View style={styles.dots}>
                {(r.post.images as string[]).map((_, i) => (
                  <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <Image source={IMG} style={styles.img} contentFit="cover" />
        )}
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
              <Pressable onPress={() => setShowStart(true)} style={styles.dateBtn}>
                <Ionicons name="calendar-outline" size={18} color={GREEN} />
                <Text style={[styles.dateBtnText, !start && styles.dateBtnPlaceholder]}>
                  {start || "날짜 선택"}
                </Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>반납일</Text>
              <Pressable onPress={() => setShowEnd(true)} style={styles.dateBtn}>
                <Ionicons name="calendar-outline" size={18} color={GREEN} />
                <Text style={[styles.dateBtnText, !end && styles.dateBtnPlaceholder]}>
                  {end || "날짜 선택"}
                </Text>
              </Pressable>
            </View>
          </View>
          {showStart && (
            <DateTimePicker
              value={isDate(start) ? new Date(start) : todayStart()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              minimumDate={todayStart()}
              onChange={(e, d) => {
                setShowStart(false)
                if (e.type === "set" && d) {
                  setStart(fmt(d))
                  // 반납일이 시작일보다 앞서면 초기화
                  if (isDate(end) && new Date(end) < d) setEnd("")
                }
              }}
            />
          )}
          {showEnd && (
            <DateTimePicker
              value={isDate(end) ? new Date(end) : (isDate(start) ? new Date(start) : todayStart())}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              minimumDate={isDate(start) ? new Date(start) : todayStart()}
              onChange={(e, d) => {
                setShowEnd(false)
                if (e.type === "set" && d) setEnd(fmt(d))
              }}
            />
          )}
          {days > 0 && (
            <View style={styles.totalRow}>
              <Text style={{ color: "#64748b" }}>{days}일 대여</Text>
              <Text style={styles.total}>{won(total)}{r.deposit ? ` + 보증금 ${won(r.deposit)}` : ""}</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <View style={styles.btnBar}>
        {/* 보조: 소유자에게 전화 걸기 — phone 있을 때만 노출 */}
        <CallButton userId={r.owner_id} color={GREEN} />
        <Pressable style={[styles.btn, { flex: 1 }]} onPress={apply} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="calendar" size={18} color="#fff" /><Text style={styles.btnText}>대여 신청{total > 0 ? ` · ${won(total)}` : ""}</Text></>}
        </Pressable>
      </View>
      <ImageLightbox
        visible={lightboxOpen}
        images={(r.post?.images as string[]) ?? []}
        initialIndex={imageIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  notFound: { textAlign: "center", marginTop: 60, color: "#64748b" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 48, borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  img: { width: "100%", height: 240 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#cbd5e1" },
  dotActive: { backgroundColor: "#225a39", width: 18 },
  title: { fontSize: 22, fontWeight: "900", color: "#1e293b", marginBottom: 12 },
  priceBox: { borderWidth: 2, borderColor: "rgba(34,90,57,0.2)", borderRadius: 16, padding: 16, marginBottom: 14 },
  price: { fontSize: 26, fontWeight: "900", color: GREEN },
  per: { fontSize: 15, fontWeight: "700", color: "#64748b" },
  dep: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  desc: { fontSize: 14, color: "#334155", lineHeight: 21, marginBottom: 16 },
  label: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  fieldLabel: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 14 },
  dateBtnText: { fontSize: 16, color: "#1e293b", fontWeight: "600" },
  dateBtnPlaceholder: { color: "#94a3b8", fontWeight: "400" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  total: { fontSize: 17, fontWeight: "900", color: GREEN },
  btnBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
})
