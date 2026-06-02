/**
 * 내 글 목록 — 상단 chip 필터 + 우측 ⋮ 메뉴 + 선택 모드(일괄 올리기).
 *
 * 선택 모드:
 *   - 헤더 우측 "선택" 버튼 → 체크박스 모드 진입 ("취소" 로 토글)
 *   - chip 아래에 "전체 선택" 토글 + 선택 개수 표시
 *   - 카드 좌측에 ☐ 체크박스, 탭 시 토글 (게시글 이동 X)
 *   - 하단 floating "X개 올리기" 버튼 — bump_atomic RPC 1초 간격 큐 처리
 *
 * ⋮ 메뉴 (작성자, 비선택모드일 때):
 *   - 올리기 (bumpable 만)
 *   - 수정하기
 *   - 삭제하기
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
import { BulkBumpDialog, type BulkBumpPost } from "@/components/BulkBumpDialog"

const MY_POST_CATEGORIES: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: "property", label: "매물" },
  { kind: "board", label: "게시판" },
  { kind: "sharing", label: "나눔" },
  { kind: "club", label: "모임" },
  { kind: "new_store", label: "신장개업" },
  { kind: "local_food", label: "로컬푸드" },
  { kind: "group_buying", label: "공동구매" },
  { kind: "secondhand", label: "중고거래" },
  { kind: "jobs", label: "구인구직" },
  { kind: "interior", label: "인테리어" },
  { kind: "moving", label: "이사" },
  { kind: "cleaning", label: "청소" },
  { kind: "repair", label: "수리" },
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

// 일괄 올리기용 — UnifiedPost.kind → bump_atomic 의 p_target_type
const BUMP_TARGET_BY_KIND: Record<string, string> = {
  property: "property",
  secondhand: "secondhand",
  group_buying: "group_buying",
  local_food: "local_food",
  jobs: "jobs",
  new_store: "new_store",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  // board, sharing, club 은 bumpable 아님
}

export default function MyPostsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [posts, setPosts] = useState<UnifiedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>("all")
  const [reloadVersion, setReloadVersion] = useState(0)

  // 선택 모드 상태
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

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

  // 현재 필터 안에서 bumpable 한 글 (전체 선택 / 일괄 올리기 대상)
  const bumpablesInFilter = useMemo(
    () => filtered.filter((p) => BUMP_TARGET_BY_KIND[p.kind]),
    [filtered],
  )

  function enterSelectMode() {
    setSelectMode(true)
    setSelected(new Set())
  }
  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllInFilter() {
    const ids = new Set(bumpablesInFilter.map((p) => p.id))
    setSelected(ids)
  }
  function clearSelection() {
    setSelected(new Set())
  }

  // 선택된 항목 중 bumpable 만 추출
  const selectedBumpables = useMemo(
    () =>
      filtered.filter(
        (p) => selected.has(p.id) && BUMP_TARGET_BY_KIND[p.kind],
      ),
    [filtered, selected],
  )

  function runBulkBump() {
    if (selectedBumpables.length === 0) return
    setBulkOpen(true)
  }

  // BulkBumpDialog 가 받을 형식으로 변환
  const bulkBumpPayload: BulkBumpPost[] = useMemo(
    () =>
      selectedBumpables.map((p) => ({
        id: p.id,
        kind: p.kind,
        targetType: BUMP_TARGET_BY_KIND[p.kind]!,
        title: p.title,
      })),
    [selectedBumpables],
  )

  const allInFilterSelected =
    bumpablesInFilter.length > 0 &&
    bumpablesInFilter.every((p) => selected.has(p.id))

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        title={selectMode ? `${selected.size}개 선택` : "내 글"}
        rightSlot={
          selectMode ? (
            <Pressable onPress={exitSelectMode} hitSlop={8} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>취소</Text>
            </Pressable>
          ) : posts.length > 0 ? (
            <Pressable onPress={enterSelectMode} hitSlop={8} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: lightColors.primary }]}>
                선택
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <CategoryPills items={pills} value={filter} onChange={setFilter} />

      {/* 선택 모드 — 전체 선택 / 해제 toolbar */}
      {selectMode && (
        <View style={styles.selectToolbar}>
          <Pressable
            onPress={allInFilterSelected ? clearSelection : selectAllInFilter}
            style={styles.toolbarBtn}
            hitSlop={4}
          >
            <Ionicons
              name={allInFilterSelected ? "checkbox" : "square-outline"}
              size={18}
              color={
                allInFilterSelected ? lightColors.primary : lightColors.ink500
              }
            />
            <Text
              style={[
                styles.toolbarBtnText,
                allInFilterSelected && { color: lightColors.primary },
              ]}
            >
              {allInFilterSelected ? "전체 해제" : "전체 선택"}
              {bumpablesInFilter.length > 0 && (
                <Text style={{ color: lightColors.ink500 }}>
                  {" "}
                  ({bumpablesInFilter.length})
                </Text>
              )}
            </Text>
          </Pressable>
          <Text style={styles.toolbarHint}>
            ※ 올리기 미지원 글(게시판/나눔/모임)은 선택돼도 자동 제외돼요
          </Text>
        </View>
      )}

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
          contentContainerStyle={selectMode ? { paddingBottom: 80 } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const cardKind = UNIFIED_TO_CARD_KIND[item.kind]
            const isBumpable = !!BUMP_TARGET_BY_KIND[item.kind]
            const isChecked = selected.has(item.id)

            const pName = plazaName(item.plaza_id)
            const card = (
              <ListItemCard
                image={item.image}
                title={item.title}
                subtitle={item.excerpt ?? null}
                footer={(pName ? `${pName} · ` : "") + formatKoDate(item.created_at)}
                badge={{ label: item.kindLabel, tone: "primary" }}
                onPress={
                  selectMode
                    ? () => isBumpable && toggleSelect(item.id)
                    : () => router.push(item.href as any)
                }
                rightContent={
                  selectMode || !cardKind ? undefined : (
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

            if (!selectMode) return card

            return (
              <View style={styles.selectRow}>
                <Pressable
                  onPress={() => isBumpable && toggleSelect(item.id)}
                  disabled={!isBumpable}
                  hitSlop={8}
                  style={[
                    styles.checkboxWrap,
                    !isBumpable && { opacity: 0.4 },
                  ]}
                >
                  <Ionicons
                    name={isChecked ? "checkbox" : "square-outline"}
                    size={22}
                    color={
                      isChecked ? lightColors.primary : lightColors.ink500
                    }
                  />
                </Pressable>
                <View style={{ flex: 1 }}>{card}</View>
              </View>
            )
          }}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}

      {/* 하단 floating "X개 올리기" */}
      {selectMode && (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            onPress={runBulkBump}
            disabled={selectedBumpables.length === 0}
            style={({ pressed }) => [
              styles.fab,
              selectedBumpables.length === 0 && styles.fabDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="arrow-up-circle" size={20} color="#ffffff" />
            <Text style={styles.fabText}>
              {selectedBumpables.length > 0
                ? `${selectedBumpables.length}개 올리기`
                : "올릴 글 선택"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* 일괄 올리기 모달 — 우선순위 + 시뮬레이션 + 진행 + 결과 */}
      <BulkBumpDialog
        visible={bulkOpen}
        onClose={() => {
          setBulkOpen(false)
          // 완료 후 닫힘 시 선택 모드도 해제 + 리스트 갱신
          exitSelectMode()
          reload()
        }}
        posts={bulkBumpPayload}
        onCompleted={() => {
          reload()
        }}
      />
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

  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
  },

  selectToolbar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 4,
    backgroundColor: lightColors.background,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  toolbarHint: { fontSize: 11, color: lightColors.ink500 },

  selectRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  fabWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  fabDisabled: {
    backgroundColor: lightColors.ink500,
  },
  fabText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
})
