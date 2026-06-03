/** 내 거래 (RN) — 웹 /mypage/trades 와 동일. 내 상품 · 내 입찰 · 내 예약 */
import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"

const GREEN = "#225a39"
const FARM_IMG = require("../../assets/images/card-farm-equipment.jpg")
const AUCTION_IMG = require("../../assets/images/card-auction.jpg")
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")

type Tab = "listings" | "bids" | "bookings"

const LISTING_BADGE: Record<string, { label: string; bg: string }> = {
  sale: { label: "판매", bg: GREEN },
  auction: { label: "경매", bg: "#e11d48" },
  rental: { label: "대여", bg: "#059669" },
}
const POST_STATUS: Record<string, string> = { active: "판매중", reserved: "예약중", completed: "거래완료", hidden: "숨김" }
const BOOKING_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  requested: { label: "승인 대기", bg: "#fef3c7", fg: "#b45309" },
  approved: { label: "승인됨", bg: "#d1fae5", fg: "#047857" },
  in_use: { label: "대여중", bg: "#dbeafe", fg: "#1d4ed8" },
  returned: { label: "반납됨", bg: "#f1f5f9", fg: "#475569" },
  completed: { label: "완료", bg: "#f1f5f9", fg: "#475569" },
  cancelled: { label: "취소/거절됨", bg: "#ffe4e6", fg: "#e11d48" },
}

export default function MyTradesScreen() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("listings")
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])

  const load = useCallback(async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    setUid(user?.id || null)
    if (!user) { setLoading(false); return }
    try { await (sb as any).rpc("close_expired_auctions") } catch { /* ignore */ }

    const { data: posts } = await (sb as any).from("secondhand_posts")
      .select("id, title, images, price, listing_type, status, created_at")
      .eq("user_id", user.id).neq("status", "deleted")
      .order("created_at", { ascending: false }).limit(100)
    setListings(posts || [])

    const { data: myBids } = await (sb as any).from("auction_bids")
      .select("auction_id, amount, created_at, auction:auction_listings(id, status, current_price, current_bidder_id, winner_id, end_at, post:secondhand_posts(title, images))")
      .eq("bidder_id", user.id).order("amount", { ascending: false })
    const seen = new Set<string>()
    const dedup: any[] = []
    for (const b of (myBids as any[]) || []) { if (!seen.has(b.auction_id)) { seen.add(b.auction_id); dedup.push(b) } }
    setBids(dedup)

    const { data: bk } = await (sb as any).from("rental_bookings")
      .select("id, start_date, end_date, total_amount, deposit, status, created_at, rental:rental_listings(owner_id, post:secondhand_posts(title, images))")
      .eq("renter_id", user.id).order("created_at", { ascending: false })
    setBookings(bk || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const bidState = (b: any): { label: string; bg: string; fg: string } => {
    const a = b.auction
    if (!a) return { label: "-", bg: "#f1f5f9", fg: "#475569" }
    const ended = a.status !== "active" || new Date(a.end_at).getTime() <= Date.now()
    if (ended) return a.winner_id === uid
      ? { label: "낙찰 🎉", bg: "rgba(34,90,57,0.1)", fg: GREEN }
      : { label: "패찰", bg: "#f1f5f9", fg: "#475569" }
    return a.current_bidder_id === uid
      ? { label: "최고 입찰 중", bg: "#d1fae5", fg: "#047857" }
      : { label: "밀림 · 재입찰", bg: "#fef3c7", fg: "#b45309" }
  }

  const TABS: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "listings", label: "내 상품", icon: "cube-outline", count: listings.length },
    { key: "bids", label: "내 입찰", icon: "hammer-outline", count: bids.length },
    { key: "bookings", label: "내 예약", icon: "calendar-outline", count: bookings.length },
  ]

  const Empty = ({ icon, text, href, action }: { icon: any; text: string; href: string; action: string }) => (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color="#cbd5e1" />
      <Text style={styles.emptyText}>{text}</Text>
      <Pressable onPress={() => router.push(href as any)}><Text style={styles.emptyLink}>{action} →</Text></Pressable>
    </View>
  )

  const list = tab === "listings" ? listings : tab === "bids" ? bids : bookings

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>내 거래</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={15} color={tab === t.key ? "#fff" : "#64748b"} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}{t.count ? ` (${t.count})` : ""}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 60 }} />
        : !uid ? <View style={styles.empty}><Text style={styles.emptyText}>로그인이 필요합니다</Text></View>
        : list.length === 0 ? (
          tab === "listings" ? <Empty icon="cube-outline" text="등록한 상품이 없습니다" href="/secondhand/register" action="농기구 등록하기" />
            : tab === "bids" ? <Empty icon="hammer-outline" text="입찰한 경매가 없습니다" href="/auction" action="경매장 가기" />
            : <Empty icon="calendar-outline" text="신청한 대여가 없습니다" href="/rental" action="농기구 대여 가기" />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
            {tab === "listings" && listings.map((p) => {
              const badge = LISTING_BADGE[p.listing_type] || LISTING_BADGE.sale
              return (
                <Pressable key={p.id} style={styles.card} onPress={() => router.push(`/secondhand/${p.id}` as any)}>
                  <Image source={p.images?.[0] ? { uri: p.images[0] } : FARM_IMG} style={styles.thumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={styles.badgeText}>{badge.label}</Text></View>
                      <Text style={styles.metaSm}>{POST_STATUS[p.status] || p.status}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>{p.title}</Text>
                    <Text style={styles.cardPrice}>{won(p.price)}</Text>
                  </View>
                </Pressable>
              )
            })}
            {tab === "bids" && bids.map((b) => {
              const st = bidState(b); const a = b.auction
              return (
                <Pressable key={b.auction_id} style={styles.card} onPress={() => router.push(`/auction/${b.auction_id}` as any)}>
                  <Image source={a?.post?.images?.[0] ? { uri: a.post.images[0] } : AUCTION_IMG} style={styles.thumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{a?.post?.title || "경매 물품"}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}><Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text></View>
                    </View>
                    <Text style={styles.metaSm}>내 입찰가 {won(b.amount)}</Text>
                    <Text style={styles.cardPrice}>현재가 {won(a?.current_price || 0)}</Text>
                  </View>
                </Pressable>
              )
            })}
            {tab === "bookings" && (
              <>
                {bookings.map((b) => {
                  const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.requested
                  return (
                    <View key={b.id} style={styles.card}>
                      <Image source={b.rental?.post?.images?.[0] ? { uri: b.rental.post.images[0] } : FARM_IMG} style={styles.thumb} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.cardTitle} numberOfLines={1}>{b.rental?.post?.title || "농기구"}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}><Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text></View>
                        </View>
                        <Text style={styles.metaSm}>{b.start_date} ~ {b.end_date}</Text>
                        <Text style={styles.cardPrice}>{won(b.total_amount)}{b.deposit ? `  +보증금 ${won(b.deposit)}` : ""}</Text>
                        {(b.status === "completed" || b.status === "returned") && b.rental?.owner_id ? (
                          <Pressable style={styles.reviewBtn}
                            onPress={() => router.push(`/mypage/write-review?reviewed_user_id=${b.rental.owner_id}&source_type=rental&source_id=${b.id}&target_name=${encodeURIComponent(b.rental?.post?.title || "소유자")}` as any)}>
                            <Ionicons name="star" size={13} color="#fff" />
                            <Text style={styles.reviewBtnText}>소유자 후기 작성</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  )
                })}
                <Pressable onPress={() => router.push("/rental/manage" as any)}>
                  <Text style={styles.manageLink}>대여 예약 관리(승인/취소)로 이동 →</Text>
                </Pressable>
              </>
            )}
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
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  tabOn: { backgroundColor: GREEN, borderColor: GREEN },
  tabText: { fontSize: 13, fontWeight: "800", color: "#64748b" },
  tabTextOn: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { fontSize: 15, fontWeight: "800", color: "#334155" },
  emptyLink: { fontSize: 14, fontWeight: "700", color: GREEN, marginTop: 4 },
  card: { flexDirection: "row", gap: 12, borderWidth: 2, borderColor: "#e2e8f0", borderRadius: 16, padding: 12, backgroundColor: "#fff" },
  thumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: "#f1f5f9" },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#1e293b", marginRight: 6 },
  cardPrice: { fontSize: 15, fontWeight: "900", color: GREEN, marginTop: 4 },
  metaSm: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },
  manageLink: { textAlign: "center", fontSize: 14, fontWeight: "700", color: GREEN, marginTop: 8 },
  reviewBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  reviewBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
})
