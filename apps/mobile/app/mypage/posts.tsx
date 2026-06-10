/**
 * 내 글 목록 — 상단 chip 필터 + 우측 ⋮ 메뉴.
 *
 * ⋮ 메뉴 (작성자):
 *   - 수정하기
 *   - 삭제하기
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
  listMyPosts,
  type UnifiedPost,
} from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { plazaName } from "@/lib/constants"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { ListItemCard } from "@/components/mypage/ListItemCard"
import { CategoryPills, type CategoryPillItem } from "@/components/mypage/CategoryPills"
import { ListCardMenu, type ListCardKind } from "@/components/ListCardMenu"

const MY_POST_CATEGORIES: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: "secondhand", label: "농기구/자재" },
  { kind: "local_food", label: "로컬푸드" },
  { kind: "jobs", label: "일손" },
  { kind: "sharing", label: "나눔" },
  { kind: "board", label: "소식통" },
]

const UNIFIED_TO_CARD_KIND: Record<string, ListCardKind> = {
  property: "properties",
  secondhand: "secondhand",
  sharing: "sharing",
  group_buying: "group-buying",
  new_store: "new-store",
  local_food: "local-food",
  club: "clubs",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  jobs: "jobs",
  board: "board",
}

export default function MyPostsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [posts, setPosts] = useState<UnifiedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>("all")
  const [reloadVersion, setReloadVersion] = useState(0)

  const reload = useCallback(() => setReloadVersion((v) => v + 1), [])

  const loadList = useCallback(async () => {
    if (!user) return
    // listMyPosts 가 properties/secondhand/jobs 포함 모든 카테고리 처리 (POST_SOURCES 통합 후)
    // 광장 격리 해제 — 모든 광장의 내 글 통합 표시
    try {
      const list = await listMyPosts(getSupabase(), user.id, {})
      setPosts(list)
    } catch (e) {
      console.warn("[posts] load failed", e)
      Alert.alert("불러오기 실패", "내 글을 불러오지 못했어요. 다시 시도해 주세요.")
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadList().finally(() => setLoading(false))
  }, [loadList, reloadVersion])

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
    const counts = new Map<string, number>()
    posts.forEach((p) => counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1))
    const base: CategoryPillItem[] = [
      { kind: "all", label: "전체", count: posts.length },
    ]
    MY_POST_CATEGORIES.forEach((c) => {
      const n = counts.get(c.kind) ?? 0
      if (n > 0) base.push({ kind: c.kind, label: c.label, count: n })
    })
    return base
  }, [posts])

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.kind === filter)),
    [filter, posts],
  )

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="내 글" />

      <CategoryPills items={pills} value={filter} onChange={setFilter} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>작성한 글이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const cardKind = UNIFIED_TO_CARD_KIND[item.kind]
            const pName = plazaName(item.plaza_id)
            return (
              <ListItemCard
                image={item.image}
                title={item.title}
                subtitle={item.excerpt ?? null}
                footer={(pName ? `${pName} · ` : "") + formatKoDate(item.created_at)}
                badge={{ label: item.kindLabel, tone: "primary" }}
                onPress={() => router.push(item.href as any)}
                rightContent={
                  !cardKind ? undefined : (
                    <ListCardMenu
                      kind={cardKind}
                      postId={item.id}
                      authorId={user?.id}
                      title={item.title}
                      placement="row"
                      onChanged={reload}
                    />
                  )
                }
              />
            )
          }}
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
