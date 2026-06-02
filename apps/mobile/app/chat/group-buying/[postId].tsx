/**
 * 공동구매 채팅방 — group_buying_chat_messages 기반.
 * 광장 web /chat/group-buying/[postId] 와 동일 동작.
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { ChatComposer } from "@/components/chat/ChatComposer"
import { ContextCard } from "@/components/chat/ContextCard"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { plazaName } from "@/lib/constants"

interface GbMessage {
  id: string
  post_id: string
  user_id: string
  content: string | null
  image_url: string | null
  created_at: string
}

interface GbInfo {
  id: string
  title: string
  status: string
  current_participants: number
  max_participants: number | null
  images?: string[] | null
  group_price?: number | null
  original_price?: number | null
  plaza_id?: string | null
  visibility?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "입금 대기",
  in_progress: "주문 진행중",
  completed: "완료",
}

export default function GbChatScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const DEFAULT_PLAZA = useCurrentPlaza()
  const [post, setPost] = useState<GbInfo | null>(null)
  const [messages, setMessages] = useState<GbMessage[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, { nickname: string | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const PAGE_SIZE = 50

  useEffect(() => {
    if (!postId || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [postRes, msgRes] = await Promise.all([
          supabase
            .from("group_buying_posts")
            .select("id, title, status, current_participants, max_participants, images, group_price, original_price, plaza_id, visibility")
            .eq("id", postId)
            .maybeSingle(),
          supabase
            .from("group_buying_chat_messages")
            .select("*")
            .eq("post_id", postId)
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE),
        ])
        if (cancelled) return
        if (!postRes.data) {
          setError("공동구매를 찾을 수 없습니다")
          return
        }
        setPost(postRes.data as GbInfo)
        const msgs = (msgRes.data ?? []) as GbMessage[]
        setMessages(msgs)
        if (msgs.length < PAGE_SIZE) setHasMore(false)
        const ids = Array.from(new Set(msgs.map((m) => m.user_id)))
        if (ids.length > 0) {
          // 🅲 메시지 작성자 — 현재 광장 plaza_profiles 우선
          const [profsRes, ppsRes] = await Promise.all([
            supabase.from("profiles").select("id, nickname").in("id", ids),
            DEFAULT_PLAZA
              ? supabase
                  .from("plaza_profiles")
                  .select("user_id, nickname")
                  .in("user_id", ids)
                  .eq("plaza_id", DEFAULT_PLAZA)
              : Promise.resolve({ data: null } as any),
          ])
          if (!cancelled && profsRes.data) {
            const ppMap = new Map<string, any>(
              (((ppsRes as any)?.data as any[]) || []).map((p) => [p.user_id, p]),
            )
            setProfilesMap(
              new Map(
                (profsRes.data as any[]).map((p) => {
                  const pp = ppMap.get(p.id) || {}
                  return [p.id, { nickname: pp.nickname ?? p.nickname }]
                }),
              ),
            )
          }
        }
        // last_read_at — 실패해도 채팅 자체는 사용 가능하도록 silent
        gwangjangFetch(`/api/group-buying/${postId}/chat/read`, {
          method: "POST",
        }).catch(() => {})
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "불러오지 못했습니다")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [postId, user, DEFAULT_PLAZA])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const supabase = getSupabase()
      const oldest = messages[messages.length - 1]
      const { data } = await supabase
        .from("group_buying_chat_messages")
        .select("*")
        .eq("post_id", postId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
      const older = (data ?? []) as GbMessage[]
      if (older.length < PAGE_SIZE) setHasMore(false)
      if (older.length > 0) setMessages((prev) => [...prev, ...older])
    } catch { /* ignore */ } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, messages, postId])

  // Realtime
  useEffect(() => {
    if (!postId) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(`gb-${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_buying_chat_messages",
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const msg = payload.new as GbMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [msg, ...prev]
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId])

  const handleSend = useCallback(
    async (content: string) => {
      if (!user || !postId) return
      const optimistic: GbMessage = {
        id: `temp-${Date.now()}`,
        post_id: postId,
        user_id: user.id,
        content,
        image_url: null,
        created_at: new Date().toISOString(),
      }
      setMessages((p) => [optimistic, ...p])
      try {
        // web /api/group-buying/[id]/chat POST — rate-limit + 멤버 검증
        const res = await gwangjangFetch(`/api/group-buying/${postId}/chat`, {
          method: "POST",
          body: JSON.stringify({ content }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          // 디버깅 — 서버 응답 그대로 Alert 노출
          const detail = j?.details ? `\n\n[debug] ${JSON.stringify(j.details)}` : ""
          const errMsg = (j?.error || "메시지 전송 실패") + detail
          // 참여 필요 케이스 — 참여 페이지로 안내
          if (j?.needsJoin) {
            Alert.alert(
              "참여 필요",
              "공동구매 채팅은 참여자만 가능합니다.\n공동구매 페이지에서 '참여하기' 버튼을 눌러주세요.",
              [
                { text: "취소", style: "cancel" },
                { text: "참여하러 가기", onPress: () => router.push(`/group-buying/${postId}` as any) },
              ],
            )
          } else {
            Alert.alert("메시지 전송 실패", errMsg)
          }
          throw new Error(errMsg)
        }
        const j = await res.json().catch(() => ({}))
        const real = (j?.message ?? j?.data ?? j) as GbMessage
        if (real?.id) {
          setMessages((p) => p.map((m) => (m.id === optimistic.id ? real : m)))
        }
      } catch (e) {
        setMessages((p) => p.filter((m) => m.id !== optimistic.id))
        throw e
      }
    },
    [user, postId],
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  if (error || !post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: lightColors.ink500 }}>{error || "오류"}</Text>
      </SafeAreaView>
    )
  }

  const statusText = STATUS_LABEL[post.status] ?? post.status

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* cross-plaza national 글 — 글 광장 라벨 표시 */}
            {post.plaza_id && DEFAULT_PLAZA && post.plaza_id !== DEFAULT_PLAZA && (
              <View style={styles.plazaChip}>
                <Text style={styles.plazaChipText}>{plazaName(post.plaza_id)}</Text>
              </View>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {post.title}
            </Text>
          </View>
          <Text style={styles.headerSub}>
            🛒 {statusText} · {post.current_participants}
            {post.max_participants ? `/${post.max_participants}` : ""}명
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Pin Card — 공동구매 정보 (1:1 채팅의 ContextCard 톤) */}
      <ContextCard
        context={{
          href: `/group-buying/${post.id}` as any,
          image: post.images?.[0] ?? null,
          title: post.title,
          subtitle: post.group_price
            ? `${post.group_price.toLocaleString()}원${
                post.original_price && post.original_price > post.group_price
                  ? ` · ${Math.round(
                      ((post.original_price - post.group_price) / post.original_price) * 100,
                    )}% 할인`
                  : ""
              }`
            : undefined,
          meta: `🛒 ${post.current_participants}${
            post.max_participants ? `/${post.max_participants}` : ""
          }명`,
          badgeLabel: statusText,
          badgeTone:
            post.status === "completed"
              ? "muted"
              : post.status === "in_progress"
              ? "primary"
              : "amber",
        }}
        onPress={() => router.push(`/group-buying/${post.id}` as any)}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={messages.length === 0 ? { flex: 1, padding: spacing[3] } : { padding: spacing[3] }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
              <Ionicons name="chatbubbles-outline" size={48} color={lightColors.ink300} />
              <Text style={{ color: lightColors.ink500, fontSize: 14, marginTop: 12, textAlign: "center" }}>
                아직 대화가 없습니다{"\n"}첫 메시지를 보내보세요!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === user?.id
            const sender = profilesMap.get(item.user_id)
            return (
              <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                {!isMe && (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>
                      {(sender?.nickname?.[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ maxWidth: "75%" }}>
                  {!isMe && sender?.nickname && (
                    <Text style={styles.senderName}>{sender.nickname}</Text>
                  )}
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, isMe && { color: "#ffffff" }]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              </View>
            )
          }}
        />
        <ChatComposer onSend={handleSend} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  plazaChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.10)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
  },
  plazaChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1e40af",
  },
  headerSub: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginVertical: 4,
  },
  msgRowMe: { justifyContent: "flex-end" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  senderName: {
    fontSize: 11,
    color: lightColors.ink500,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: lightColors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#f1f5f9",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: lightColors.ink900,
    lineHeight: 20,
  },
})
