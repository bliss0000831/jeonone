/**
 * 구매 내역 (buyer) — 로컬푸드 / 공동구매 탭.
 *
 * 웹 /mypage/orders 와 1:1: ?type=group-buying 진입 시 GB 탭 선택.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import {
  confirmOrderReceived,
  listOrders,
  type OrderEntry,
} from "@gwangjang/features/profile"
import { Alert } from "react-native"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { OrderRow } from "@/components/mypage/OrderRow"

type Tab = "lf" | "gb"

export default function OrdersScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ type?: string }>()
  const initialTab: Tab =
    params.type === "group-buying" || params.type === "gb" ? "gb" : "lf"
  const [tab, setTab] = useState<Tab>(initialTab)
  const [items, setItems] = useState<OrderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadList = useCallback(async () => {
    if (!user) return
    try {
      const list = await listOrders(getSupabase(), user.id, "buyer")
      setItems(list)
    } catch (e) {
      console.warn("[orders] load failed", e)
      Alert.alert("불러오기 실패", "주문 내역을 불러오지 못했습니다. 다시 시도해 주세요.")
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadList().finally(() => setLoading(false))
  }, [user, loadList])

  // useFocusEffect 는 mount 시에도 fire — useEffect(loadList) 와 중복 호출 방지.
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="구매 내역" />

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
          <Ionicons name="bag-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.empty}>
            {tab === "lf" ? "로컬푸드 구매 내역이 없어요" : "공동구매 참여 내역이 없어요"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              role="buyer"
              onWriteReview={(o) => {
                // reviews API 는 source_type 으로 '{domain}_order' 를 기대함
                const sourceType = o.domain === "local_food" ? "local_food_order" : "group_buying_order"
                router.push(
                  `/mypage/write-review?reviewed_user_id=${o.seller_id}&source_type=${sourceType}&source_id=${o.id}&target_name=${encodeURIComponent(o.product_name || "판매자")}` as any,
                )
              }}
              onConfirmReceived={(o) =>
                Alert.alert(
                  "수령 확인",
                  "상품을 정상적으로 수령하셨나요?",
                  [
                    { text: "취소", style: "cancel" },
                    {
                      text: "수령 완료",
                      onPress: async () => {
                        try {
                          const r = await confirmOrderReceived(getSupabase(), o)
                          if (!r.ok) {
                            Alert.alert("실패", r.error ?? "")
                            return
                          }
                          // 낙관적 업데이트
                          setItems((arr) =>
                            arr.map((x) =>
                              x.id === o.id
                                ? { ...x, status: "completed" }
                                : x,
                            ),
                          )
                        } catch (e: any) {
                          Alert.alert("실패", e?.message || "수령 확인에 실패했습니다.")
                        }
                      },
                    },
                  ],
                )
              }
            />
          )}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.muted },
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
  tabActive: {
    borderBottomColor: "#10b981",
  },
  tabActiveRose: {
    borderBottomColor: "#f43f5e",
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  tabTextActive: {
    color: "#047857",
  },
  tabTextActiveRose: {
    color: "#be123c",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  empty: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    marginTop: spacing[2],
  },
})
