/**
 * 찜한 항목 목록 (모든 카테고리 통합).
 * 상단 둥근 chip 필터 + 카운트 표시.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import {
  listFavorites,
  type SavedItem,
} from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { plazaName } from "@/lib/constants"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { ListItemCard } from "@/components/mypage/ListItemCard"
import { CategoryPills, type CategoryPillItem } from "@/components/mypage/CategoryPills"

// 찜 가능 카테고리 (광장 web 정독 — listFavorites 매핑과 일치)
const SAVED_CATEGORIES: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: "secondhand", label: "농기구/자재" },
  { kind: "local_food", label: "로컬푸드" },
  { kind: "jobs", label: "일손" },
  { kind: "sharing", label: "나눔" },
  { kind: "board", label: "소식통" },
]

export default function FavoritesScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>("all")

  const loadList = useCallback(async () => {
    if (!user) return
    // 광장 격리 해제 — 모든 광장의 찜 목록 통합 표시
    try {
      const list = await listFavorites(getSupabase(), user.id, null)
      setItems(list)
    } catch (e) {
      console.warn("[favorites] load failed", e)
      Alert.alert("불러오기 실패", "찜 목록을 불러오지 못했어요. 다시 시도해 주세요.")
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

  const pills: CategoryPillItem[] = useMemo(() => {
    // 카운트 계산
    const counts = new Map<string, number>()
    items.forEach((it) => counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1))
    // 전체 + 항목이 있는 카테고리만 노출 (없으면 칩 너무 많아짐)
    const base: CategoryPillItem[] = [
      { kind: "all", label: "전체", count: items.length },
    ]
    SAVED_CATEGORIES.forEach((c) => {
      const n = counts.get(c.kind) ?? 0
      if (n > 0) base.push({ kind: c.kind, label: c.label, count: n })
    })
    return base
  }, [items])

  const filtered =
    filter === "all" ? items : items.filter((it) => it.kind === filter)

  const renderItem = useCallback(({ item }: { item: SavedItem }) => {
    const pName = plazaName(item.plaza_id)
    return (
      <ListItemCard
        image={item.image}
        title={item.title}
        subtitle={item.meta ?? null}
        footer={
          (pName ? `${pName} · ` : "") + formatKoDate(item.created_at) + " 찜"
        }
        badge={{ label: item.kindLabel, tone: "primary" }}
        onPress={() => router.push(item.href as any)}
      />
    )
  }, [router])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="찜한 항목" />

      <CategoryPills items={pills} value={filter} onChange={setFilter} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>찜한 항목이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => `${it.kind}-${it.id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={renderItem}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

function formatKoDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  emptyTitle: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    marginTop: spacing[2],
  },
})
