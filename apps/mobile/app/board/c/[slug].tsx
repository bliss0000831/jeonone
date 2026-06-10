/** 카테고리 게시판 (RN) — 웹 /board/c/[slug] 미러. 녹색 탭 + 목록. */
import { useState, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlazaState, useCurrentRegion } from "@/lib/plaza"

const GREEN = "#225a39"
const CATS = [
  { slug: "free", label: "마을 사랑방", icon: "chatbubble-ellipses" as const },
  { slug: "daily", label: "농업 일기", icon: "camera" as const },
  { slug: "share", label: "무료 나눔", icon: "gift" as const },
  { slug: "life", label: "살림 정보", icon: "bulb" as const },
  { slug: "subsidy", label: "정부 지원금", icon: "cash" as const },
  { slug: "qna", label: "궁금해요", icon: "help-circle" as const },
]

/** 본문에서 사람이 읽을 발췌 텍스트만 추출 (【라벨】·URL·자동수집 안내 제거) */
function excerpt(content?: string) {
  if (!content) return ""
  return content
    .replace(/【[^】]*】/g, " ")
    .replace(/원문 보기:\s*\S+/g, "")
    .replace(/—\s*보조금24[^\n]*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export default function BoardCategoryScreen() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const cur = CATS.find((c) => c.slug === slug) ?? CATS[0]
  const isSubsidy = cur.slug === "subsidy"
  const myRegion = useCurrentRegion(plaza.id)

  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [regionMode, setRegionMode] = useState<"mine" | "all">("mine")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = getSupabase()
      let catQ = sb.from("board_categories").select("id").eq("slug", cur.slug)
      if (plaza.id) catQ = catQ.eq("plaza_id", plaza.id)
      const { data: cat } = await catQ.limit(1).maybeSingle()
      if (!cat) { setPosts([]); setLoading(false); return }
      let q = sb.from("board_posts").select("*").eq("category_id", (cat as any).id).order("created_at", { ascending: false }).limit(60)
      if (plaza.id) q = q.eq("plaza_id", plaza.id)
      const { data } = await q
      setPosts(((data as any[]) || []).filter((p) => p.status !== "hidden"))
    } catch { setPosts([]) }
    setLoading(false)
  }, [cur.slug, plaza.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const filtered = posts.filter((p) => {
    if (!(p.title || "").toLowerCase().includes(search.toLowerCase())) return false
    // 정부지원금: 내 시군 글 + 전국(region NULL) 글만 (전체 보기 토글 시 해제)
    if (isSubsidy && regionMode === "mine" && myRegion) {
      return !p.region || p.region === myRegion
    }
    return true
  })

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>소식통</Text>
        <Pressable onPress={() => router.push("/board/create" as any)} hitSlop={10}><Ionicons name="create-outline" size={22} color={GREEN} /></Pressable>
      </View>

      {/* 녹색 카테고리 탭 */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
          {CATS.map((c) => {
            const active = c.slug === cur.slug
            return (
              <Pressable key={c.slug} onPress={() => router.replace(`/board/c/${c.slug}` as any)}
                style={[styles.tab, active ? styles.tabActive : null]}>
                <Ionicons name={c.icon} size={15} color={active ? GREEN : "#fff"} />
                <Text style={[styles.tabText, { color: active ? GREEN : "#fff" }]}>{c.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.h1}>{cur.label}</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput value={search} onChangeText={setSearch} placeholder="게시글 검색..." placeholderTextColor="#94a3b8" style={styles.searchInput} />
        </View>

        {isSubsidy ? (
          <View style={styles.regionBar}>
            <Text style={styles.regionText}>
              {regionMode === "mine" ? `📍 ${myRegion} + 전국 지원금` : "🗺️ 강원 전체 지원금"}
            </Text>
            <Pressable onPress={() => setRegionMode((m) => (m === "mine" ? "all" : "mine"))} hitSlop={8}>
              <Text style={styles.regionToggle}>{regionMode === "mine" ? "전체 보기" : "내 지역만"}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : filtered.length === 0 ? (
          <Text style={styles.empty}>아직 게시글이 없습니다</Text>
        ) : (
          <View style={styles.listBox}>
            {filtered.map((p) => {
              const thumb = p.thumbnail_url || p.images?.[0]
              const ex = excerpt(p.content)
              return (
                <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/board/${p.id}` as any)}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.chipRow}>
                      <View style={styles.chip}>
                        <Ionicons name={cur.icon} size={11} color={GREEN} />
                        <Text style={styles.chipText}>{cur.label}</Text>
                      </View>
                      {isSubsidy ? (
                        <View style={[styles.regionChip, p.region ? styles.regionChipLocal : styles.regionChipAll]}>
                          <Text style={[styles.regionChipText, p.region ? styles.regionChipTextLocal : styles.regionChipTextAll]}>
                            {p.region ? `📍 ${p.region} 농가 대상` : "🌐 전국 어디나"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowTitle} numberOfLines={1}>{p.title}</Text>
                    {ex ? <Text style={styles.rowExcerpt} numberOfLines={1}>{ex}</Text> : null}
                    <Text style={styles.rowMeta}>
                      {p.author_name || "이웃"} · 조회 {p.view_count ?? 0} · ♥ {p.like_count ?? 0} · 💬 {p.comment_count ?? 0}
                    </Text>
                  </View>
                  {thumb ? <Image source={{ uri: thumb }} style={styles.rowThumb} contentFit="cover" /> : null}
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f6f0" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  barTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  tabsWrap: { backgroundColor: GREEN, paddingVertical: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tabActive: { backgroundColor: "#fff" },
  tabText: { fontSize: 13, fontWeight: "700" },
  h1: { fontSize: 22, fontWeight: "900", color: "#1e293b", marginBottom: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 2, borderColor: "#e2e8f0", paddingHorizontal: 14, marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15 },
  regionBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingHorizontal: 2 },
  regionText: { fontSize: 14, color: "#64748b", flex: 1 },
  regionToggle: { fontSize: 14, fontWeight: "800", color: GREEN },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 15, paddingVertical: 48 },
  listBox: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#eee", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  chipRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: "#eaf3ed", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: "700", color: GREEN },
  regionChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  regionChipLocal: { backgroundColor: "#fef3c7" },
  regionChipAll: { backgroundColor: "#e0f2fe" },
  regionChipText: { fontSize: 11, fontWeight: "700" },
  regionChipTextLocal: { color: "#b45309" },
  regionChipTextAll: { color: "#0369a1" },
  rowTitle: { fontSize: 16, fontWeight: "800", color: "#1e293b" },
  rowExcerpt: { fontSize: 13, color: "#64748b", marginTop: 3, lineHeight: 18 },
  rowMeta: { fontSize: 12, color: "#94a3b8", marginTop: 6 },
  rowThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: "#f1f5f9" },
})
