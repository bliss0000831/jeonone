/** 카테고리 게시판 (RN) — 웹 /board/c/[slug] 미러. 녹색 탭 + 목록. */
import { useState, useCallback } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image } from "expo-image"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlazaState } from "@/lib/plaza"

const GREEN = "#225a39"
const CATS = [
  { slug: "free", label: "자유게시판", icon: "chatbubble-ellipses" as const },
  { slug: "daily", label: "일상 공유", icon: "camera" as const },
  { slug: "share", label: "무료 나눔", icon: "gift" as const },
  { slug: "life", label: "생활 정보", icon: "bulb" as const },
  { slug: "subsidy", label: "정부 지원금", icon: "cash" as const },
  { slug: "qna", label: "질문 답변", icon: "help-circle" as const },
]

export default function BoardCategoryScreen() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const cur = CATS.find((c) => c.slug === slug) ?? CATS[0]

  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

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

  const filtered = posts.filter((p) => (p.title || "").toLowerCase().includes(search.toLowerCase()))

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#1e293b" /></Pressable>
        <Text style={styles.barTitle}>게시판</Text>
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

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : filtered.length === 0 ? (
          <Text style={styles.empty}>아직 게시글이 없습니다</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((p) => {
              const thumb = p.thumbnail_url || p.images?.[0]
              return (
                <Pressable key={p.id} style={styles.card} onPress={() => router.push(`/board/${p.id}` as any)}>
                  {thumb ? <Image source={{ uri: thumb }} style={styles.cardImg} contentFit="cover" /> : (
                    <View style={[styles.cardImg, styles.cardImgPlaceholder]}><Ionicons name={cur.icon} size={28} color="#cbd5e1" /></View>
                  )}
                  <View style={{ flex: 1, padding: 12 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{p.title}</Text>
                    <Text style={styles.cardMeta}>{p.author_name || "이웃"} · 조회 {p.view_count ?? 0}</Text>
                    <View style={styles.cardStats}>
                      <Text style={styles.stat}>♥ {p.like_count ?? 0}</Text>
                      <Text style={styles.stat}>💬 {p.comment_count ?? 0}</Text>
                    </View>
                  </View>
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
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 15, paddingVertical: 48 },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#eee" },
  cardImg: { width: 96, height: 96 },
  cardImgPlaceholder: { backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  cardMeta: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  cardStats: { flexDirection: "row", gap: 10, marginTop: 6 },
  stat: { fontSize: 12, color: "#64748b" },
})
