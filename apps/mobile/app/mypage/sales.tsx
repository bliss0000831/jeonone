/**
 * 판매 내역 (seller) — 로컬푸드 / 공동구매 탭 + 운송장 입력.
 *
 * 웹 /mypage/sales 와 1:1: paid 상태 주문에 운송장(택배사+번호) 입력 가능.
 *   - 로컬푸드: PATCH /api/local-food-orders/:id/ship
 *   - 공동구매: PATCH /api/group-buying-orders/:id/ship
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { listOrders, markOrderShipped, type OrderEntry } from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { OrderRow } from "@/components/mypage/OrderRow"

type Tab = "lf" | "gb"

const CARRIERS = ["CJ대한통운", "롯데택배", "한진택배", "우체국택배", "로젠택배"]

export default function SalesScreen() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>("lf")
  const [items, setItems] = useState<OrderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [shippingFor, setShippingFor] = useState<OrderEntry | null>(null)
  const [carrier, setCarrier] = useState(CARRIERS[0])
  const [trackNum, setTrackNum] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadList = useCallback(async () => {
    if (!user) return
    const list = await listOrders(getSupabase(), user.id, "seller")
    setItems(list)
  }, [user])

  async function reload() {
    if (!user) return
    setLoading(true)
    try {
      await loadList()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // useFocusEffect 는 mount 시에도 fire — useEffect(reload) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      loadList()
    }, [loadList]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await loadList() } finally { setRefreshing(false) }
  }, [loadList])

  const filtered = useMemo(
    () =>
      items.filter((o) =>
        tab === "lf" ? o.domain === "local_food" : o.domain === "group_buying",
      ),
    [items, tab],
  )
  const lfCount = items.filter((o) => o.domain === "local_food").length
  const gbCount = items.filter((o) => o.domain === "group_buying").length
  const stats = items.reduce(
    (acc, o) => {
      acc.total += 1
      if (o.status === "paid") acc.toShip += 1
      if (o.status === "shipped" || o.status === "received") acc.shipped += 1
      if (o.status === "completed" || o.status === "confirmed") {
        acc.completed += 1
        acc.revenue += o.amount || 0
      }
      return acc
    },
    { total: 0, toShip: 0, shipped: 0, completed: 0, revenue: 0 },
  )

  function openShippingModal(o: OrderEntry) {
    setShippingFor(o)
    setCarrier(CARRIERS[0])
    setTrackNum("")
  }

  async function submitTracking() {
    if (!shippingFor) return
    if (!trackNum.trim()) {
      Alert.alert("운송장 번호를 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      // 통합 API — 로컬푸드 / 공동구매 양쪽 동작
      const r = await markOrderShipped(getSupabase(), shippingFor, {
        carrier,
        number: trackNum.trim(),
      })
      if (!r.ok) throw new Error(r.error || "처리 실패")
      setShippingFor(null)
      await reload()
      Alert.alert("발송 처리 완료")
    } catch (e: any) {
      Alert.alert("실패", e?.message || "처리 실패")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="판매 관리" />

      {/* 요약 */}
      <View style={styles.statsRow}>
        <Stat label="전체" value={stats.total} />
        <Stat label="발송 대기" value={stats.toShip} tint="#b45309" bg="#fef3c7" />
        <Stat label="배송 중" value={stats.shipped} tint="#1e40af" bg="#dbeafe" />
        <Stat
          label="정산 예정"
          value={`${stats.revenue.toLocaleString()}`}
          tint="#047857"
          bg="#d1fae5"
        />
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("lf")}
          style={[styles.tab, tab === "lf" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "lf" && styles.tabTextActive]}>
            🥬 로컬푸드 ({lfCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("gb")}
          style={[styles.tab, tab === "gb" && styles.tabActiveRose]}
        >
          <Text
            style={[styles.tabText, tab === "gb" && styles.tabTextActiveRose]}
          >
            🛒 공동구매 ({gbCount})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="pricetag-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.empty}>
            {tab === "lf" ? "로컬푸드 판매 내역이 없어요" : "공동구매 주최 내역이 없어요"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View>
              <OrderRow order={item} />
              {item.status === "paid" &&
                !item.tracking_number &&
                item.domain === "local_food" && (
                <Pressable
                  onPress={() => openShippingModal(item)}
                  style={styles.shipBtn}
                >
                  <Ionicons name="car-outline" size={14} color="#ffffff" />
                  <Text style={styles.shipBtnText}>발송 처리</Text>
                </Pressable>
              )}
            </View>
          )}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}

      {/* 운송장 모달 */}
      <Modal
        visible={!!shippingFor}
        transparent
        animationType="fade"
        onRequestClose={() => setShippingFor(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>운송장 등록</Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {shippingFor?.product_name}
            </Text>

            <Text style={styles.fieldLabel}>택배사</Text>
            <View style={styles.carrierRow}>
              {CARRIERS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCarrier(c)}
                  style={[
                    styles.carrierChip,
                    carrier === c && styles.carrierChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.carrierChipText,
                      carrier === c && styles.carrierChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>송장 번호</Text>
            <TextInput
              value={trackNum}
              onChangeText={setTrackNum}
              placeholder="송장번호를 입력하세요"
              keyboardType="number-pad"
              style={styles.input}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShippingFor(null)}
                style={[styles.btn, styles.btnGhost]}
                disabled={submitting}
              >
                <Text style={styles.btnGhostText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={submitTracking}
                style={[styles.btn, styles.btnPrimary]}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>등록</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function Stat({
  label,
  value,
  tint = lightColors.ink900,
  bg = "#ffffff",
}: {
  label: string
  value: string | number
  tint?: string
  bg?: string
}) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.muted },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: lightColors.background,
  },
  stat: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
  },
  statLabel: { fontSize: 10, color: lightColors.ink500, marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    backgroundColor: lightColors.background,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    paddingHorizontal: spacing[3],
  },
  tab: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: "#10b981" },
  tabActiveRose: { borderBottomColor: "#f43f5e" },
  tabText: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink500 },
  tabTextActive: { color: "#047857" },
  tabTextActiveRose: { color: "#be123c" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },
  empty: { fontSize: fontSize.md, color: lightColors.ink500, marginTop: spacing[2] },

  shipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    paddingVertical: 10,
    borderRadius: 8,
  },
  shipBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: spacing[5],
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: lightColors.ink900 },
  modalSub: { fontSize: 12, color: lightColors.ink500, marginTop: 4, marginBottom: spacing[4] },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink700,
    marginBottom: 6,
    marginTop: spacing[3],
  },
  carrierRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  carrierChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.muted,
  },
  carrierChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  carrierChipText: { fontSize: 12, color: lightColors.ink700 },
  carrierChipTextActive: { color: "#ffffff", fontWeight: "700" },

  input: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: lightColors.ink900,
  },

  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: spacing[5],
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { backgroundColor: lightColors.muted },
  btnGhostText: { fontSize: 14, fontWeight: "600", color: lightColors.ink700 },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
})
