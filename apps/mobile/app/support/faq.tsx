/**
 * 자주 묻는 질문 — 광장 web /faq 와 동일 데이터 (shared listFaqs).
 * 카테고리별 그룹 + accordion (펼침/접힘).
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { listFaqs, type Faq } from "@gwangjang/features/support"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"


export default function FaqScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listFaqs(getSupabase(), DEFAULT_PLAZA)
      .then((data) => {
        if (!cancelled) setFaqs(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 카테고리별 그룹핑
  const groups = new Map<string, Faq[]>()
  for (const f of faqs) {
    const c = f.category || "general"
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push(f)
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>자주 묻는 질문</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : faqs.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: lightColors.ink500 }}>아직 등록된 질문이 없어요.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing[4] }}
          showsVerticalScrollIndicator={false}
        >
          {Array.from(groups.entries()).map(([cat, items]) => (
            <View key={cat} style={{ marginBottom: spacing[5] }}>
              <Text style={styles.catTitle}>{cat}</Text>
              <View style={styles.card}>
                {items.map((f, i) => {
                  const isOpen = openId === f.id
                  return (
                    <View key={f.id}>
                      <Pressable
                        onPress={() => setOpenId(isOpen ? null : f.id)}
                        style={({ pressed }) => [
                          styles.qRow,
                          pressed && { backgroundColor: lightColors.muted },
                          i > 0 && styles.divider,
                        ]}
                      >
                        <Text style={styles.q} numberOfLines={isOpen ? 0 : 2}>
                          Q. {f.question}
                        </Text>
                        <Ionicons
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={lightColors.ink500}
                        />
                      </Pressable>
                      {isOpen && (
                        <View style={styles.aWrap}>
                          <Text style={styles.a}>{f.answer}</Text>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  catTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink500,
    marginBottom: spacing[2],
  },
  card: {
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  qRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  q: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  aWrap: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: "rgba(241,245,249,0.4)",
  },
  a: {
    fontSize: 13,
    lineHeight: 20,
    color: lightColors.ink700,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
  },
})
