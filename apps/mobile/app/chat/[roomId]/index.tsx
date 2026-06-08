/**
 * 채팅방 화면 — 광장 web 과 시각 일관성.
 *
 * Layout (위 → 아래):
 *   1. Header — 뒤로가기 + 타이틀 + 전화 + 메뉴(점3개)
 *   2. ParticipantStrip — 참가자 아바타 + "초대" 버튼
 *   3. ContextCard — 매물/게시글 정보 (이미지 + 가격 + 상태 뱃지)
 *   4. FlatList — 메시지 (역순)
 *   5. QuickReplies — 첫 메시지 시만
 *   6. ChatComposer — leftSlot 에 + 버튼 (전문가 초대)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  type AppStateStatus,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { notification as hapticNotification } from "@gwangjang/platform/haptics"
import {
  getChatRoom,
  listMessages,
  listRoomParticipants,
  loadPostContext,
  markAsRead,
  sendMessage,
  subscribeToMessages,
  type ChatContextDescriptor,
  type ChatParticipant,
  type ChatRoom,
  type Message,
} from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { plazaName } from "@/lib/constants"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { ChatComposer } from "@/components/chat/ChatComposer"
import {
  ParticipantStrip,
  type StripParticipant,
} from "@/components/chat/ParticipantStrip"
import { ContextCard } from "@/components/chat/ContextCard"
import { QuickReplies } from "@/components/chat/QuickReplies"
import { ParticipantsModal } from "@/components/chat/ParticipantsModal"
import { ChatRoomMenu } from "@/components/chat/ChatRoomMenu"
import { ReportSheet } from "@/components/chat/ReportSheet"
import { chatPrefs } from "@/lib/chat-prefs"
import { leaveDirectRoom, reportChatRoom } from "@gwangjang/features/chat"

const PAGE_SIZE = 50
const QUICK_REPLY_ITEMS = [
  "혹시 예약 가능한가요?",
  "구매하고 싶습니다.",
  "아직 판매중인가요?",
]

/** 타이핑 인디케이터 애니메이션 점 */
function AnimatedDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [delay, opacity])
  return <Animated.View style={[styles.typingDot, { opacity }]} />
}

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const currentPlaza = useCurrentPlaza()

  // 키보드 높이 — Android edge-to-edge 에선 KeyboardAvoidingView 가 깨지므로 직접 추적.
  // 키보드 올라오면 composer 아래에 padding 추가 → 가려지지 않음.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e?.endCoordinates?.height ?? 0)
    })
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [participants, setParticipants] = useState<ChatParticipant[]>([])
  const [context, setContext] = useState<ChatContextDescriptor | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  // chatPrefs 변경 시 리렌더 (mute 상태 즉시 반영)
  const [, setPrefsTick] = useState(0)
  useEffect(() => {
    const unsub = chatPrefs.subscribe(() => setPrefsTick((t) => t + 1))
    return unsub
  }, [])

  // 초기 로드
  useEffect(() => {
    if (!roomId || !user) return
    let cancelled = false
    async function load() {
      setError(null)
      setLoading(true)
      try {
        setError(null)
        const supabase = getSupabase()
        const r = await getChatRoom(supabase, roomId)
        if (cancelled) return
        if (!r) {
          setError("채팅방을 찾을 수 없습니다")
          return
        }
        setRoom(r)
        const [p, msgs, ctx, myPp] = await Promise.all([
          listRoomParticipants(supabase, roomId, currentPlaza ?? null),
          listMessages(supabase, roomId, { limit: PAGE_SIZE }),
          loadPostContext(supabase, r as any, user!.id, currentPlaza ?? null),
          // 🅲 본인 row 는 현재 광장 plaza_profile 기준으로 override
          //   (chat_rooms 의 buyer_plaza_id 가 옛 DM 컨텍스트일 수 있어 신뢰 X)
          currentPlaza && user
            ? supabase
                .from("plaza_profiles")
                .select("nickname, avatar_url, account_type, phone")
                .eq("user_id", user.id)
                .eq("plaza_id", currentPlaza)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        if (cancelled) return
        // 본인 row 의 nickname/avatar 등을 현재 광장 plaza_profile 로 교체
        const myPpData: any = (myPp as any)?.data ?? null
        const enriched = myPpData
          ? p.map((part) =>
              part.id === user!.id
                ? {
                    ...part,
                    nickname: myPpData.nickname ?? part.nickname,
                    avatar_url: myPpData.avatar_url ?? null,
                    account_type: myPpData.account_type ?? part.account_type,
                    phone: myPpData.phone ?? part.phone,
                  }
                : part,
            )
          : p
        setParticipants(enriched)
        setMessages(msgs)
        setContext(ctx)
        setHasMore(msgs.length >= PAGE_SIZE)
        await markAsRead(supabase, roomId, user!.id).catch(() => {})
      } catch (err: unknown) {
        if (cancelled) return
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as any).message)
              : typeof err === "string"
                ? err
                : "채팅방을 불러오지 못했습니다"
        console.error("[ChatRoom] load failed:", err)
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [roomId, user, retryKey])

  // Realtime
  useEffect(() => {
    if (!roomId || !user) return
    const supabase = getSupabase()
    const unsubscribe = subscribeToMessages(supabase, roomId, async (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [msg, ...prev]
      })
      if (msg.sender_id !== user.id) {
        try {
          await hapticNotification("success")
        } catch {}
        await markAsRead(supabase, roomId, user.id).catch(() => {})
      }
    })
    return unsubscribe
  }, [roomId, user])

  // 포그라운드 복귀 시 메시지 갭 복구 — 백그라운드 동안 소켓이 끊겨
  // 놓친 메시지가 있을 수 있으므로 최근 메시지를 다시 불러와 병합.
  useEffect(() => {
    if (!roomId || !user) return
    const sub = AppState.addEventListener("change", async (state: AppStateStatus) => {
      if (state !== "active") return
      try {
        const supabase = getSupabase()
        const fresh = await listMessages(supabase, roomId, { limit: PAGE_SIZE })
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id))
          const missing = fresh.filter((m) => !ids.has(m.id))
          if (missing.length === 0) return prev
          // 최신순(내림차순) 유지하며 병합
          return [...missing, ...prev].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
        })
        await markAsRead(supabase, roomId, user.id).catch(() => {})
      } catch (e) {
        console.warn("[chat] foreground refetch failed", e)
      }
    })
    return () => sub.remove()
  }, [roomId, user])

  // 타이핑 indicator — Supabase Realtime broadcast 채널
  // 송신: composer 가 입력 변경 시 sendTyping() 호출 (debounce 1.5s)
  // 수신: 'typing' 이벤트가 다른 사용자로부터 오면 typingUsers 에 추가, 3s 후 제거
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const typingChannelRef = useRef<any>(null)
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!roomId || !user) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(`typing-${roomId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        const sender = String(payload?.user_id || "")
        if (!sender || sender === user.id) return
        setTypingUsers((prev) => {
          if (prev.has(sender)) return prev
          const next = new Set(prev)
          next.add(sender)
          return next
        })
        // 3초 후 자동 제거 (이전 타이머가 있으면 갱신)
        const prevT = typingClearTimers.current.get(sender)
        if (prevT) clearTimeout(prevT)
        const t = setTimeout(() => {
          setTypingUsers((prev) => {
            if (!prev.has(sender)) return prev
            const next = new Set(prev)
            next.delete(sender)
            return next
          })
          typingClearTimers.current.delete(sender)
        }, 3000)
        typingClearTimers.current.set(sender, t)
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => {
      try { channel.unsubscribe() } catch {}
      typingChannelRef.current = null
      for (const t of typingClearTimers.current.values()) clearTimeout(t)
      typingClearTimers.current.clear()
    }
  }, [roomId, user])

  // composer 가 호출 — debounce 는 composer 가 자체 관리
  const sendTyping = useCallback(() => {
    const ch = typingChannelRef.current
    if (!ch || !user) return
    try {
      ch.send({ type: "broadcast", event: "typing", payload: { user_id: user.id } })
    } catch {}
  }, [user])

  // O(1) participant lookup — avoids O(n) find() per message render
  const participantsMap = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  )

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const prev = messages[index + 1]
      const samePrev =
        prev &&
        prev.sender_id === item.sender_id &&
        new Date(item.created_at).getTime() -
          new Date(prev.created_at).getTime() <
          60_000
      const sender = participantsMap.get(item.sender_id)
      return (
        <MessageBubble
          message={item}
          isMe={item.sender_id === user?.id}
          showTime={!samePrev}
          senderName={sender?.nickname ?? null}
          senderAvatar={sender?.avatar_url ?? null}
          showSenderInfo={!samePrev && item.sender_id !== user?.id}
          onSenderPress={
            item.sender_id
              ? () => {
                  const sid = item.sender_id
                  let targetPlaza: string | null | undefined
                  if (sid === user?.id) {
                    targetPlaza = currentPlaza
                  } else {
                    targetPlaza =
                      participantsMap.get(sid)?.plaza_id ?? null
                  }
                  const qs = targetPlaza ? `?plaza=${encodeURIComponent(targetPlaza)}` : ""
                  router.push(`/profile/${sid}${qs}` as any)
                }
              : undefined
          }
        />
      )
    },
    [messages, participantsMap, user, currentPlaza, router],
  )

  const handleSend = useCallback(
    async (content: string) => {
      if (!user || !room) return
      const supabase = getSupabase()
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        chat_room_id: roomId,
        sender_id: user.id,
        content,
        is_read: false,
        plaza_id: room.plaza_id,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [optimistic, ...prev])
      try {
        // web /api/chat/messages POST — 메시지 insert 시 상대방에게 notification 생성
        // (mobile direct insert 는 RLS 통과해도 알림 트리거 안 됨)
        const res = await gwangjangFetch("/api/chat/messages", {
          method: "POST",
          body: JSON.stringify({
            chat_room_id: roomId,
            content,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || "메시지 전송 실패")
        }
        const j = await res.json().catch(() => ({}))
        const real = (j?.message ?? j?.data ?? j) as any
        if (real?.id) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimistic.id ? real : m)),
          )
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        Alert.alert("전송 실패", err instanceof Error ? err.message : "메시지를 보내지 못했습니다.")
        throw err // composer 가 입력 텍스트 복원하도록 재던짐
      }
    },
    [room, roomId, user],
  )

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const supabase = getSupabase()
      const oldest = messages[messages.length - 1]
      const more = await listMessages(supabase, roomId, {
        before: oldest.created_at,
        limit: PAGE_SIZE,
      })
      setMessages((prev) => [...prev, ...more])
      setHasMore(more.length >= PAGE_SIZE)
    } catch (e) {
      // 실패를 "끝 도달"과 구분 — hasMore 유지 + 재시도 노출
      console.warn("[chat] loadMore failed", e)
      setLoadMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  // 화면 상태
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <BasicHeader title="…" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    )
  }
  if (error || !room) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <BasicHeader title="채팅방" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error ?? "채팅방을 찾을 수 없습니다"}
          </Text>
          {error && (
            <Pressable
              onPress={() => setRetryKey((k) => k + 1)}
              style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: lightColors.primary }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>다시 시도</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    )
  }

  // 데이터
  const isAdminNotice = room.post_type === "admin_notice"
  const otherUser = participants.find((p) => p.id !== user?.id)
  const otherName = isAdminNotice
    ? `${plazaName(room.plaza_id)} 관리자`
    : (otherUser?.nickname ?? "이웃")
  const otherPhone = otherUser?.phone
  const isFirstMessage = messages.length === 0

  // 참가자 strip 데이터 변환
  const stripParticipants: StripParticipant[] = participants.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar_url: p.avatar_url,
    badge:
      p.role === "seller" ? "seller" : p.role === "expert" ? "host" : null,
  }))

  const muteKey = `direct:${roomId}`
  const isMuted = chatPrefs.isMuted(muteKey)

  function handleLeave() {
    setMenuOpen(false)
    Alert.alert("대화방 나가기", "이 대화방에서 나가시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "나가기",
        style: "destructive",
        onPress: async () => {
          if (!user) return
          try {
            await leaveDirectRoom(getSupabase(), roomId, user.id)
            router.back()
          } catch (e: any) {
            Alert.alert("실패", e?.message || "나가기에 실패했습니다")
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && styles.btnPressed,
          ]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() => setParticipantsOpen(true)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* cross-plaza 채팅방 — "상대방 광장" 표시.
                DM 의 경우 loadPostContext 가 상대방 home 광장을 href ?plaza= 에 포함시켜 그것 사용.
                그 외는 post-anchored: seller 가 보면 buyer 광장, buyer 가 보면 seller 광장. */}
            {(() => {
              if (!room || !currentPlaza || !user) return null
              let otherPlaza: string | null = null
              if (room.post_type === "direct") {
                // context.href = /profile/{id}?plaza={home} — 거기서 추출
                try {
                  const href = context?.href ?? ""
                  const m = /[?&]plaza=([^&]+)/.exec(String(href))
                  if (m && m[1]) otherPlaza = decodeURIComponent(m[1])
                } catch {}
              }
              if (!otherPlaza) {
                const isSeller = user.id === room.seller_id
                otherPlaza = isSeller
                  ? ((room as any).buyer_plaza_id ?? room.plaza_id)
                  : room.plaza_id
              }
              if (!otherPlaza || otherPlaza === currentPlaza) return null
              return (
                <View style={styles.plazaChip}>
                  <Text style={styles.plazaChipText}>{plazaName(otherPlaza)}</Text>
                </View>
              )
            })()}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {otherName}
            </Text>
          </View>
          <View style={styles.headerAvatarRow}>
            <Text style={styles.headerSubtitle}>
              {isAdminNotice ? "공지사항" : `참가자 ${participants.length}명`}
            </Text>
            {stripParticipants.slice(0, 4).map((p) => {
              const initial = p.nickname?.[0] || "?"
              return (
                <View key={p.id} style={styles.headerAvatar}>
                  {p.avatar_url ? (
                    <Image
                      source={{ uri: p.avatar_url }} cachePolicy="memory-disk"
                      style={styles.headerAvatarImg}
                    />
                  ) : (
                    <Text style={styles.headerAvatarLetter}>{initial}</Text>
                  )}
                </View>
              )
            })}
          </View>
        </Pressable>
        {otherPhone && (
          <Pressable
            onPress={() => {
              Alert.alert(`${otherName}님에게 전화`, otherPhone, [
                { text: "취소", style: "cancel" },
                {
                  text: "전화 걸기",
                  onPress: () => { void Linking.openURL(`tel:${otherPhone}`) },
                },
              ])
            }}
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && styles.btnPressed,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="call-outline"
              size={22}
              color={lightColors.ink900}
            />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="더보기"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && styles.btnPressed,
          ]}
          hitSlop={8}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={20}
            color={lightColors.ink900}
          />
        </Pressable>
      </View>

      {/* Participant strip 제거 — 아바타는 헤더로 이동 (요청).
          전문가 초대 버튼은 메뉴(⋮) 안에 있음. */}

      {/* Context Card — 클릭 시 RN 상세페이지로 이동 */}
      {context && (
        <ContextCard
          context={context}
          onPress={() => router.push(context.href as any)}
        />
      )}

      {/* 키보드 가림 방지 — KeyboardAvoidingView 대신 수동 padding.
          삼성 등 일부 Android 에서 키보드 위 이모지/툴바 행이 추가로 떠서
          composer 하단이 살짝 겹침. +12 버퍼로 여유 확보. */}
      <View
        style={[
          styles.flex,
          {
            paddingBottom:
              keyboardHeight > 0 ? keyboardHeight + 12 : insets.bottom,
          },
        ]}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          inverted
          renderItem={renderMessage}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64, transform: [{ scaleY: -1 }] }}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color={lightColors.ink300} />
              <Text style={{ marginTop: 12, color: lightColors.ink500, fontSize: 14, fontWeight: "600" }}>
                대화를 시작해보세요
              </Text>
              <Text style={{ marginTop: 4, color: lightColors.ink300, fontSize: 12 }}>
                첫 메시지를 보내 대화를 시작할 수 있어요
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMore}>
                <ActivityIndicator size="small" color={lightColors.ink500} />
              </View>
            ) : loadMoreError ? (
              <Pressable style={styles.loadMore} onPress={loadMore}>
                <Text style={{ color: lightColors.primary, fontSize: 13, fontWeight: "600" }}>
                  이전 메시지를 불러오지 못했어요 · 다시 시도
                </Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={styles.messagesContent}
        />

        {/* Quick Replies — 첫 메시지 시만 + DM 제외 */}
        {isFirstMessage && room.post_type !== "direct" && (
          <QuickReplies
            items={QUICK_REPLY_ITEMS}
            onPick={(text) => {
              const trySend = () => {
                handleSend(text).catch((e) => {
                  // 빠른답장은 입력창에 없으므로 실패 시 재전송 버튼 제공 (메시지 소실 방지)
                  Alert.alert("전송 실패", e?.message ?? "메시지를 보내지 못했습니다.", [
                    { text: "취소", style: "cancel" },
                    { text: "다시 시도", onPress: trySend },
                  ])
                })
              }
              trySend()
            }}
          />
        )}

        {/* Composer with + button (전문가 초대).
            SafeAreaView 가 edges=bottom 으로 home indicator 영역을 잡아주고,
            KeyboardAvoidingView behavior=padding 이 키보드 위로 띄움. */}
        {/* 타이핑 indicator — 상대방이 입력 중일 때 */}
        {typingUsers.size > 0 && (
          <View style={styles.typingRow}>
            <View style={styles.typingDots}>
              <AnimatedDot delay={0} />
              <AnimatedDot delay={150} />
              <AnimatedDot delay={300} />
            </View>
            <Text style={styles.typingText}>
              {(() => {
                const ids = [...typingUsers]
                if (ids.length === 1) {
                  const p = participantsMap.get(ids[0])
                  return `${p?.nickname || "상대방"}님이 입력 중...`
                }
                return `${ids.length}명이 입력 중...`
              })()}
            </Text>
          </View>
        )}
        {isAdminNotice ? (
          <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>관리자 공지는 답장할 수 없습니다.</Text>
          </View>
        ) : (
          <ChatComposer
            onSend={handleSend}
            onTyping={sendTyping}
          />
        )}
      </View>

      {/* 채팅방 헤더 메뉴 — ⋯ 클릭 시 시트 */}
      <ChatRoomMenu
        visible={menuOpen}
        isMuted={isMuted}
        onClose={() => setMenuOpen(false)}
        onToggleMute={() => {
          chatPrefs.toggleMuted(muteKey)
          setMenuOpen(false)
        }}
        onReport={() => {
          setMenuOpen(false)
          setReportOpen(true)
        }}
        onLeave={handleLeave}
      />

      {/* 신고 시트 */}
      <ReportSheet
        visible={reportOpen}
        targetLabel={otherName}
        onClose={() => setReportOpen(false)}
        onSubmit={async (reason, detail) => {
          if (!user) return
          try {
            await reportChatRoom(getSupabase(), {
              reporterId: user.id,
              targetKind: "direct",
              targetId: roomId,
              reason,
              detail,
            })
            Alert.alert("접수 완료", "신고가 접수되었습니다")
          } catch (e: any) {
            Alert.alert("실패", e?.message || "신고 접수에 실패했습니다")
          }
        }}
      />

      {/* 참가자 모달 — strip 클릭 시 열림, 본인 외 클릭 → 프로필 페이지 (WebView) */}
      <ParticipantsModal
        visible={participantsOpen}
        participants={participants}
        currentUserId={user?.id ?? null}
        onClose={() => setParticipantsOpen(false)}
        onSelect={(p) => {
          setParticipantsOpen(false)
          // 🅲 navigation 광장 — participants 의 plaza_id (휴리스틱 결과) 우선
          //   본인이면 currentPlaza
          const targetPlaza =
            p.id === user?.id
              ? currentPlaza
              : (p as any).plaza_id ?? null
          const qs = targetPlaza ? `?plaza=${encodeURIComponent(targetPlaza)}` : ""
          router.push(`/profile/${p.id}${qs}` as any)
        }}
      />
    </SafeAreaView>
  )
}

function BasicHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={{ width: 40 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  errorText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    gap: 4,
    backgroundColor: lightColors.background,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  btnPressed: { opacity: 0.6 },
  headerCenter: { flex: 1, marginHorizontal: spacing[2] },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  // cross-plaza 칩 — 헤더 제목 좌측에 표시 (chat 리스트와 동일 톤)
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
  // 헤더 안에 들어가는 작은 참가자 아바타 — strip 없애고 여기로 통합
  headerAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  headerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarImg: {
    width: "100%",
    height: "100%",
  },
  headerAvatarLetter: {
    fontSize: 9,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  messagesContent: {
    paddingVertical: spacing[2],
    flexGrow: 1,
    // inverted FlatList 에서 flex-end → 시각적 상단 (column-reverse 의 끝).
    // 메시지가 핀 카드 바로 아래부터 차오르고, 비는 공간은 input 위로.
    justifyContent: "flex-end",
  },
  loadMore: {
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  composerLeft: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[1],
    paddingBottom: 4,
  },
  typingDots: {
    flexDirection: "row",
    gap: 3,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: lightColors.ink500,
  },
  typingText: {
    fontSize: 12,
    color: lightColors.ink500,
    fontStyle: "italic",
  },
})
