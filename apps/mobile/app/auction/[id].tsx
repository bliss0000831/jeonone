/** 경매 상세 + 입찰 (RN). 웹 /auction/[id] 과 동일. */
import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"
import { CallButton } from "@/components/CallButton"
import { useLoginGate } from "@/components/LoginGate"

const GREEN = "#225a39"
const AUCTION_IMG = require("../../assets/images/card-auction.jpg")

function won(n: number) { return n ? `${n.toLocaleString()}원` : "0원" }
function timeLeft(end: string) {
  const ms = new Date(end).getTime() - Date.now()
  if (ms <= 0) return "마감"
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 남음`
  if (h >= 1) return `${h}시간 남음`
  return `${Math.max(1, Math.floor(ms / 60000))}분 남음`
}

export default function AuctionDetailScreen() {
  const router = useRouter()
  const { requireLogin } = useLoginGate()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [a, setA] = useState<any>(null)
  const [bids, setBids] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [uid, setUid] = useState<string | null>(null)

  const load = useCallback(async () => {
    const sb = getSupabase()
    sb.auth.getUser().then(({ data }) => setUid(data.user?.id || null))
    // 만료 경매 자동 정산 (cron 대체)
    try { await (sb as any).rpc("close_expired_auctions") } catch { /* ignore */ }
    const { data } = await (sb as any).from("auction_listings")
      .select("*, post:secondhand_posts(title, description, images)").eq("id", id).maybeSingle()
    setA(data)
    const { data: b } = await (sb as any).from("auction_bids").select("amount, created_at").eq("auction_id", id).order("created_at", { ascending: false }).limit(10)
    setBids(b || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const minBid = a ? Math.max(a.start_price, (a.current_price || 0) + a.bid_increment) : 0

  const placeBid = async () => {
    if (!requireLogin("입찰")) return
    const amt = parseInt((amount || "").replace(/[^0-9]/g, ""), 10)
    if (!amt || amt < minBid) { Alert.alert("입찰 실패", `최소 입찰가는 ${won(minBid)} 입니다`); return }
    setSubmitting(true)
    const { data, error } = await (getSupabase() as any).rpc("place_auction_bid", { p_auction: id, p_amount: amt })
    setSubmitting(false)
    if (error) { Alert.alert("입찰 실패", error.message); return }
    const res = data as any
    if (!res?.ok) { Alert.alert("입찰 실패", res?.error || "오류"); return }
    Alert.alert("입찰 완료", "입찰되었습니다!")
    setAmount("")
    load()
  }

  const markDeal = (status: "completed" | "no_show") => {
    const isDone = status === "completed"
    Alert.alert(
      isDone ? "거래 완료" : "거래 불이행 신고",
      isDone
        ? "낙찰자와 거래를 정상적으로 마치셨나요?"
        : "낙찰자가 약속을 지키지 않았나요?\n신고하면 낙찰자의 입찰이 제한될 수 있습니다. (누적 2회 7일, 3회 이상 30일)",
      [
        { text: "취소", style: "cancel" },
        {
          text: isDone ? "완료 기록" : "신고",
          style: isDone ? "default" : "destructive",
          onPress: async () => {
            const { data, error } = await (getSupabase() as any).rpc("mark_auction_deal", { p_auction: id, p_status: status })
            if (error) { Alert.alert("오류", error.message); return }
            const res = data as any
            if (!res?.ok) { Alert.alert("오류", res?.error || "처리하지 못했습니다"); return }
            Alert.alert("처리 완료", isDone ? "거래 완료로 기록했습니다." : "거래 불이행으로 신고했습니다.")
            load()
          },
        },
      ],
    )
  }

  const buyNow = async () => {
    if (!requireLogin("즉시구매")) return
    if (!a?.buy_now_price) return
    Alert.alert("즉시구매", `${won(a.buy_now_price)}에 즉시구매하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "구매", onPress: async () => {
          setSubmitting(true)
          const { data, error } = await (getSupabase() as any).rpc("buy_now_auction", { p_auction: id })
          setSubmitting(false)
          if (error) { Alert.alert("구매 실패", error.message); return }
          const res = data as any
          if (!res?.ok) { Alert.alert("구매 실패", res?.error || "오류"); return }
          Alert.alert("즉시구매 완료", "구매가 완료되었습니다! 🎉")
          load()
        },
      },
    ])
  }

  if (loading) return <SafeAreaView style={styles.safe}><ActivityIndicator color={GREEN} style={{ marginTop: 60 }} /></SafeAreaView>
  if (!a) return <SafeAreaView style={styles.safe}><Text style={{ textAlign: "center", marginTop: 60, color: "#64748b" }}>경매를 찾을 수 없습니다</Text></SafeAreaView>

  const ended = a.status !== "active" || new Date(a.end_at).getTime() <= Date.now()

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>경매 상세</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Image source={a.post?.images?.[0] ? { uri: a.post.images[0] } : AUCTION_IMG} style={styles.img} contentFit="cover" />
        <View style={{ padding: 16 }}>
          <Text style={styles.title}>{a.post?.title || "경매 물품"}</Text>
          <View style={styles.priceBox}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.label}>현재가</Text>
              <Text style={styles.label}>입찰 {a.bid_count}회 · {timeLeft(a.end_at)}</Text>
            </View>
            <Text style={styles.price}>{won(a.current_price || a.start_price)}</Text>
            <Text style={styles.sub}>시작가 {won(a.start_price)} · 단위 {won(a.bid_increment)}</Text>
          </View>

          {ended && (
            a.winner_id ? (
              <View style={[styles.resultBox, uid && a.winner_id === uid ? styles.resultWin : styles.resultNeutral]}>
                <Text style={styles.resultTitle}>{uid && a.winner_id === uid ? "🎉 축하합니다! 낙찰되었습니다" : "경매가 종료되었습니다 (낙찰)"}</Text>
                <Text style={styles.resultSub}>최종 낙찰가 <Text style={{ fontWeight: "900", color: GREEN }}>{won(a.current_price)}</Text></Text>
                {uid && a.winner_id === uid ? (
                  <>
                    <Text style={styles.resultHint}>판매자와 채팅으로 거래를 진행해주세요.</Text>
                    <Pressable style={styles.reviewBtn}
                      onPress={() => router.push(`/mypage/write-review?reviewed_user_id=${a.seller_id}&source_type=auction&source_id=${a.id}&target_name=${encodeURIComponent(a.post?.title || "판매자")}` as any)}>
                      <Ionicons name="star" size={15} color="#fff" />
                      <Text style={styles.reviewBtnText}>판매자 후기 작성</Text>
                    </Pressable>
                  </>
                ) : null}

                {/* 판매자: 낙찰 후 거래 결과 기록 (예치금 없는 노쇼 방지) */}
                {uid && a.seller_id === uid ? (
                  a.deal_status === "pending" || !a.deal_status ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.resultHint}>거래를 마친 뒤 결과를 남겨주세요.</Text>
                      <View style={styles.dealRow}>
                        <Pressable style={styles.dealDone} onPress={() => markDeal("completed")}>
                          <Ionicons name="checkmark-circle" size={16} color="#fff" />
                          <Text style={styles.dealDoneText}>거래 완료</Text>
                        </Pressable>
                        <Pressable style={styles.dealNoShow} onPress={() => markDeal("no_show")}>
                          <Ionicons name="alert-circle" size={16} color="#dc2626" />
                          <Text style={styles.dealNoShowText}>불이행 신고</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.dealChip, a.deal_status === "completed" ? styles.dealChipDone : styles.dealChipBad]}>
                      <Text style={[styles.dealChipText, a.deal_status === "completed" ? styles.dealChipTextDone : styles.dealChipTextBad]}>
                        {a.deal_status === "completed" ? "✓ 거래 완료로 기록됨" : "⚠ 거래 불이행으로 신고됨"}
                      </Text>
                    </View>
                  )
                ) : null}
              </View>
            ) : (
              <View style={[styles.resultBox, styles.resultNeutral]}>
                <Text style={styles.resultSub}>입찰자가 없어 종료된 경매입니다 (유찰)</Text>
              </View>
            )
          )}

          {a.post?.description ? <Text style={styles.desc}>{a.post.description}</Text> : null}

          <Text style={styles.bidsTitle}>입찰 내역</Text>
          {bids.length === 0 ? <Text style={styles.noBids}>아직 입찰이 없습니다</Text> : bids.map((b, i) => (
            <View key={i} style={styles.bidRow}>
              <Text style={styles.bidAmt}>{won(b.amount)}</Text>
              <Text style={styles.bidTime}>{new Date(b.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {!ended && (
        <View style={styles.bidBarWrap}>
          {/* 보조: 판매자에게 전화 걸기 — 본인 경매가 아니고 phone 있을 때만 */}
          {a.seller_id !== uid ? <CallButton userId={a.seller_id} color={GREEN} /> : null}
          {a.buy_now_price && a.seller_id !== uid ? (
            <Pressable style={styles.buyNowBtn} onPress={buyNow} disabled={submitting}>
              <Ionicons name="flash" size={18} color={GREEN} />
              <Text style={styles.buyNowText}>즉시구매 · {won(a.buy_now_price)}</Text>
            </Pressable>
          ) : null}
          <View style={styles.bidBar}>
            <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder={`${minBid.toLocaleString()}원 이상`} placeholderTextColor="#94a3b8" style={styles.bidInput} />
            <Pressable style={styles.bidBtn} onPress={placeBid} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="hammer" size={18} color="#fff" /><Text style={styles.bidBtnText}>입찰</Text></>}
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 48, borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  img: { width: "100%", height: 260 },
  title: { fontSize: 22, fontWeight: "900", color: "#1e293b", marginBottom: 12 },
  priceBox: { borderWidth: 2, borderColor: "rgba(34,90,57,0.2)", borderRadius: 16, padding: 16, marginBottom: 14 },
  label: { fontSize: 13, color: "#64748b" },
  price: { fontSize: 30, fontWeight: "900", color: GREEN, marginTop: 2 },
  sub: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  resultBox: { borderWidth: 2, borderRadius: 16, padding: 14, marginBottom: 14 },
  resultWin: { borderColor: GREEN, backgroundColor: "rgba(34,90,57,0.06)" },
  resultNeutral: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  resultTitle: { fontSize: 15, fontWeight: "900", color: "#1e293b" },
  resultSub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  resultHint: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  reviewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 9, marginTop: 10 },
  reviewBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  dealRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  dealDone: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 11 },
  dealDoneText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  dealNoShow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 2, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 10, paddingVertical: 9 },
  dealNoShowText: { color: "#dc2626", fontWeight: "800", fontSize: 14 },
  dealChip: { marginTop: 10, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignItems: "center" },
  dealChipDone: { backgroundColor: "rgba(34,90,57,0.08)" },
  dealChipBad: { backgroundColor: "#fef2f2" },
  dealChipText: { fontWeight: "800", fontSize: 13 },
  dealChipTextDone: { color: GREEN },
  dealChipTextBad: { color: "#dc2626" },
  desc: { fontSize: 14, color: "#334155", lineHeight: 21, marginBottom: 16 },
  bidsTitle: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  noBids: { color: "#94a3b8", fontSize: 14, paddingVertical: 8 },
  bidRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  bidAmt: { fontWeight: "800", color: GREEN, fontSize: 15 },
  bidTime: { color: "#94a3b8", fontSize: 12 },
  bidBarWrap: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, gap: 8, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee" },
  bidBar: { flexDirection: "row", gap: 8 },
  buyNowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 2, borderColor: GREEN, borderRadius: 12, paddingVertical: 12 },
  buyNowText: { color: GREEN, fontWeight: "800", fontSize: 15 },
  bidInput: { flex: 1, borderWidth: 2, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  bidBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 22, justifyContent: "center" },
  bidBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
})
