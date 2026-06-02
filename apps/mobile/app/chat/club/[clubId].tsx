/**
 * 모임 채팅방 — club_chat_messages 기반.
 *
 * 광장 web /chat/club/[clubId] 와 동일 동작:
 *   - 헤더: ← 모임 제목 + 멤버 카운트 + ⋯ 메뉴
 *   - 메시지 리스트 (시간 역순)
 *   - 입력창 (텍스트 전송)
 *
 * Realtime: club_chat_messages publication 등록되어 있으면 자동.
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

interface ClubMessage {
  id: string
  club_id: string
  user_id: string
  content: string | null
  image_url: string | null
  created_at: string
}

interface ClubInfo {
  id: string
  title: string
  current_members: number
  max_members: number
  images?: string[] | null
  sport_type?: string | null
  category?: string | null
}

export default function ClubChatScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const DEFAULT_PLAZA = useCurrentPlaza()
  const [club, setClub] = useState<ClubInfo | null>(null)
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, { nickname: string | null; avatar_url: string | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [clubRes, msgRes] = await Promise.all([
          supabase
            .from("clubs")
            .select("id, title, current_members, max_members, images, sport_type, category")
            .eq("id", clubId)
            .maybeSingle(),
          supabase
            .from("club_chat_messages")
            .select("*")
            .eq("club_id", clubId)
            .order("created_at", { ascending: false })
            .limit(50),
        ])
        if (cancelled) return
        if (!clubRes.data) {
          setError("모임을 찾을 수 없습니다")
          return
        }
        setClub(clubRes.data as ClubInfo)
        const msgs = (msgRes.data ?? []) as ClubMessage[]
        setMessages(msgs)
        // 메시지 작성자 프로필 batch
        const ids = Array.from(new Set(msgs.map((m) => m.user_id)))
        if (ids.length > 0) {
          // 🅲 메시지 작성자 — 현재 광장 plaza_profiles 우선
          const [profsRes, ppsRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, nickname, avatar_url")
              .in("id", ids),
            DEFAULT_PLAZA
              ? supabase
                  .from("plaza_profiles")
                  .select("user_id, nickname, avatar_url")
                  .in("user_id", ids)
                  .eq("plaza_id", DEFAULT_PLAZA)
              : Promise.resolve({ data: null } as any),
          ])
          if (!cancelled && profsRes.data) {
            const ppMap = new Map<string, any>(
              (((ppsRes as any)?.data as any[]) || []).map((p) => [p.user_id, p]),
            )
            const map = new Map(
              (profsRes.data as any[]).map((p) => {
                const pp = ppMap.get(p.id) || {}
                return [
                  p.id,
                  {
                    nickname: pp.nickname ?? p.nickname,
                    avatar_url: pp.avatar_url ?? p.avatar_url,
                  },
                ]
              }),
            )
            setProfilesMap(map)
          }
        }
        // last_read_at 업데이트 — 실패해도 채팅 자체는 사용 가능하도록 silent
        gwangjangFetch(`/api/clubs/${clubId}/chat/read`, {
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
  }, [clubId, user, DEFAULT_PLAZA])

  // Realtime
  useEffect(() => {
    if (!clubId) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(`club-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_chat_messages",
          filter: `club_id=eq.${clubId}`,
        },
        (payload) => {
          const msg = payload.new as ClubMessage
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
  }, [clubId])

  const handleSend = useCallback(
    async (content: string) => {
      if (!user || !clubId) return
      const optimistic: ClubMessage = {
        id: `temp-${Date.now()}`,
        club_id: clubId,
        user_id: user.id,
        content,
        image_url: null,
        created_at: new Date().toISOString(),
      }
      setMessages((p) => [optimistic, ...p])
      try {
        // web /api/clubs/[id]/chat POST 사용 — rate-limit + 멤버 검증 (mobile 직접 insert 우회 방지)
        const res = await gwangjangFetch(`/api/clubs/${clubId}/chat`, {
          method: "POST",
          body: JSON.stringify({ content }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || "메시지 전송 실패")
        }
        const j = await res.json().catch(() => ({}))
        const real = (j?.message ?? j?.data ?? j) as ClubMessage
        if (real?.id) {
          setMessages((p) => p.map((m) => (m.id === optimistic.id ? real : m)))
        }
      } catch (e) {
        setMessages((p) => p.filter((m) => m.id !== optimistic.id))
        throw e
      }
    },
    [user, clubId],
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  if (error || !club) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: lightColors.ink500 }}>{error || "오류"}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {club.title}
          </Text>
          <Text style={styles.headerSub}>
            👥 {club.current_members}/{club.max_members}명
          </Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert("모임", undefined, [
              { text: "모임 정보 보기", onPress: () => router.push(`/clubs/${club.id}` as any) },
              { text: "취소", style: "cancel" },
            ])
          }
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="메뉴"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={lightColors.ink900} />
        </Pressable>
      </View>

      {/* Pin Card — 모임 정보 (1:1 채팅의 ContextCard 톤) */}
      <ContextCard
        context={{
          href: `/clubs/${club.id}` as any,
          image: club.images?.[0] ?? null,
          title: club.title,
          subtitle: club.sport_type ?? club.category ?? "모임",
          meta: `👥 ${club.current_members}/${club.max_members}명`,
          badgeLabel:
            club.current_members >= club.max_members ? "마감" : "모집중",
          badgeTone:
            club.current_members >= club.max_members ? "muted" : "emerald",
        }}
        onPress={() => router.push(`/clubs/${club.id}` as any)}
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
          contentContainerStyle={{ padding: spacing[3] }}
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
  msgRowMe: {
    justifyContent: "flex-end",
  },
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
