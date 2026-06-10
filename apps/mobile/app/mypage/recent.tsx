/**
 * 최근 본 글 — AsyncStorage 기반 로컬 히스토리 (recent-views.ts).
 * favorites/posts 와 동일한 chip 필터 + 카드 레이아웃.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { ListItemCard } from "@/components/mypage/ListItemCard"
import { CategoryPills, type CategoryPillItem } from "@/components/mypage/CategoryPills"
import {
  listRecentViews,
  clearRecentViews,
  type RecentView,
} from "@/lib/recent-views"
import { plazaName } from "@/lib/constants"

// 사용자 게시글 카테고리 (라벨은 fallback — RecentView.kindLabel 우선)
const CATEGORY_LABELS: Record<string, string> = {
  property: "매물",
  board: "소식통",
  sharing: "나눔",
  club: "모임",
  clubs: "모임",
  new_store: "신장개업",
  local_food: "로컬푸드",
  group_buying: "공동구매",
  secondhand: "농기구/자재",
  jobs: "구인구직",
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

export default function RecentScreen() {
  const router = useRouter()
  const [items, setItems] = useState<RecentView[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    const list = await listRecentViews()
    setItems(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 화면 다시 보일 때마다 갱신 (다른 곳에서 본 글이 반영되도록)
  // useFocusEffect 는 mount 시에도 fire — useEffect(load) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      load()
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  const pills: CategoryPillItem[] = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    items.forEach((it) => {
      const prev = counts.get(it.kind)
      counts.set(it.kind, {
        label: it.kindLabel || CATEGORY_LABELS[it.kind] || it.kind,
        count: (prev?.count ?? 0) + 1,
      })
    })
    const base: CategoryPillItem[] = [
      { kind: "all", label: "전체", count: items.length },
    ]
    counts.forEach((v, kind) => {
      base.push({ kind, label: v.label, count: v.count })
    })
    return base
  }, [items])

  const filtered =
    filter === "all" ? items : items.filter((it) => it.kind === filter)

  const renderItem = useCallback(({ item }: { item: RecentView }) => {
    const pName = plazaName(item.plaza_id)
    return (
      <ListItemCard
        image={item.image}
        title={item.title}
        footer={
          (pName ? `${pName} · ` : "") + formatRelative(item.viewedAt) + " 봤어요"
        }
        badge={{
          label: item.kindLabel || CATEGORY_LABELS[item.kind] || item.kind,
          tone: "primary",
        }}
        onPress={() => router.push(item.href as any)}
      />
    )
  }, [router])

  function handleClear() {
    if (items.length === 0) return
    Alert.alert("최근 본 글 삭제", "기록을 모두 지울까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await clearRecentViews()
          setItems([])
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        title="최근 본 글"
        rightSlot={
          items.length > 0 ? (
            <Pressable onPress={handleClear} hitSlop={8} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>전체 삭제</Text>
            </Pressable>
          ) : undefined
        }
      />

      <CategoryPills items={pills} value={filter} onChange={setFilter} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>최근 본 글이 없어요</Text>
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

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.floor((now - d.getTime()) / 1000)
  if (diff < 60) return "방금"
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
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
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  clearBtnText: {
    fontSize: 12,
    color: lightColors.ink700,
    fontWeight: "600",
  },
})
