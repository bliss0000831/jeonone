/**
 * 게시판 상세 — 광장 web /board/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 게시판 + 더보기/삭제)
 *   - 작성자 카드 (아바타 + 닉네임 + 상대시간)
 *   - 제목 + 본문
 *   - 이미지/비디오 캐러셀 (페이징 + 인디케이터)
 *   - 메타: 조회 / 좋아요 / 댓글
 *   - 좋아요 버튼 (board_post_likes 토글)
 *   - 댓글 리스트 (작성자 + 시간 + 내용 + 이미지)
 *   - 댓글 입력 (텍스트 + 이미지 첨부 최대 4장)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native"
import { Image } from "expo-image"
import { MediaItem, isVideoUrl } from "@/components/MediaItem"
import { ImageLightbox } from "@/components/ImageLightbox"
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  createBoardComment,
  deleteBoardComment,
  deleteBoardPost,
  getBoardPost,
  isBoardPostLiked,
  listBoardComments,
  toggleBoardLike,
  type BoardComment,
  type BoardPost,
} from "@gwangjang/features/board"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { useIsAdmin } from "@/lib/useIsAdmin"


import { relativeDate } from "@/lib/relative-date"


export default function BoardDetailScreen() {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const { width } = useWindowDimensions()

  useTrackView("board_posts", id, "view_count")

  const [post, setPost] = useState<BoardPost | null>(null)
  const [comments, setComments] = useState<BoardComment[]>([])
  const [loading, setLoading] = useState(true)
  const [imageIndex, setImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isLiked, setIsLiked] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [profile, setProfile] = useState<{ nickname: string; avatar_url: string | null } | null>(null)

  useTrackRecent({
    id: id as string,
    kind: "board",
    kindLabel: "소식통",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? (post as any)?.thumbnail ?? null,
    href: `/board/${id}`,
  })

  const [commentText, setCommentText] = useState("")
  const [commentImages, setCommentImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    try {
      const supabase = getSupabase()
      const [p, cs] = await Promise.all([
        getBoardPost(supabase, id, DEFAULT_PLAZA),
        listBoardComments(supabase, id, DEFAULT_PLAZA),
      ])
      setPost(p)
      setComments(cs)
      if (user) {
        const liked = await isBoardPostLiked(supabase, id, user.id)
        setIsLiked(liked)
        // 🅲 댓글 작성자 표시 — 현재 광장 plaza_profiles 우선
        const [profRes, ppRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("nickname, avatar_url")
            .eq("id", user.id)
            .maybeSingle(),
          DEFAULT_PLAZA
            ? supabase
                .from("plaza_profiles")
                .select("nickname, avatar_url")
                .eq("user_id", user.id)
                .eq("plaza_id", DEFAULT_PLAZA)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        const pp: any = ppRes?.data || {}
        const prof: any = profRes?.data || {}
        const nickname = pp.nickname ?? prof.nickname ?? "익명"
        const avatar_url = pp.avatar_url ?? prof.avatar_url ?? null
        setProfile({ nickname, avatar_url })
      }
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  // useFocusEffect 는 mount 시에도 fire — useEffect 와 중복 호출 방지.
  // 첫 focus 는 스킵, 이후 (탭 전환 후 돌아오기 등) 만 갱신.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      loadDetail()
    }, [loadDetail]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadDetail()
    } finally {
      setRefreshing(false)
    }
  }, [loadDetail])

  async function handleShare() {
    if (!post) return
    try {
      const url = buildShareUrl("board", post.id)
      share.open({ message: `${post.title}\n${url}`,
        url,
        title: post.title })
    } catch {}
  }

  async function handleLike() {
    if (!user) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (likeLoading || !post) return
    setLikeLoading(true)
    try {
      const next = await toggleBoardLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked,
      })
      setIsLiked(next)
      setPost((p) => (p ? { ...p, like_count: p.like_count + (next ? 1 : -1) } : p))
    } catch (e) {
      console.warn("[board] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setLikeLoading(false)
    }
  }

  async function pickCommentImage() {
    if (commentImages.length >= 4) {
      Alert.alert("제한", "댓글에 이미지는 최대 4장")
      return
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다")
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    })
    if (res.canceled || !res.assets) return
    setUploading(true)
    try {
      const newUrls: string[] = []
      for (const asset of res.assets.slice(0, 4 - commentImages.length)) {
        const fd = new FormData()
        fd.append("file", {
          uri: asset.uri,
          name: "comment.jpg",
          type: "image/jpeg",
        } as any)
        const upRes = await gwangjangFetch("/api/board/upload", {
          method: "POST",
          body: fd,
        })
        if (!upRes.ok) throw new Error("업로드 실패")
        const { url } = await upRes.json()
        newUrls.push(url)
      }
      setCommentImages((arr) => [...arr, ...newUrls])
    } catch (e: any) {
      Alert.alert("실패", e?.message || "업로드 실패")
    } finally {
      setUploading(false)
    }
  }

  async function submitComment() {
    if (!user || !post) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (!commentText.trim() && commentImages.length === 0) return
    setSubmitting(true)
    try {
      // web /api/board/comment POST 사용 — plaza_id 자동 주입 + rate limit + 알림
      const res = await gwangjangFetch("/api/board/comment", {
        method: "POST",
        body: JSON.stringify({
          post_id: post.id,
          content: commentText.trim(),
          author_name: profile?.nickname || "익명",
          author_avatar: profile?.avatar_url ?? null,
          images: commentImages,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || "댓글 작성 실패")
      }
      const j = await res.json().catch(() => ({}))
      const c = (j?.comment ?? j) as any
      setComments((cs) => [...cs, c])
      setCommentText("")
      setCommentImages([])
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p))
    } catch (e: any) {
      Alert.alert("실패", e?.message || "댓글 작성 실패")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteComment(commentId: string) {
    Alert.alert("댓글 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            // web /api/board/comment DELETE — plaza 격리 + admin override (body 에 id)
            const res = await gwangjangFetch(`/api/board/comment`, {
              method: "DELETE",
              body: JSON.stringify({ id: commentId }),
            })
            if (!res.ok) {
              const j = await res.json().catch(() => ({}))
              throw new Error(j?.error || "삭제 실패")
            }
            setComments((cs) => cs.filter((c) => c.id !== commentId))
            setPost((p) => (p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
          } catch (e: any) {
            Alert.alert("실패", e?.message || "삭제 실패")
          }
        },
      },
    ])
  }

  function handleDeletePost() {
    Alert.alert("게시글 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          if (!post) return
          try {
            await deleteBoardPost(getSupabase(), post.id)
            router.back()
          } catch (e: any) {
            Alert.alert("실패", e?.message || "삭제 실패")
          }
        },
      },
    ])
  }

  // ── Image carousel helpers (M6 perf: ScrollView → FlatList) ──
  // ⚠️ Hooks 는 반드시 조건부 return 위에 선언해야 함 (Rules of Hooks)
  const imageKeyExtractor = useCallback((_: string, i: number) => String(i), [])
  const onImageScrollEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width)
      setImageIndex(idx)
    },
    [width],
  )
  const openLightbox = useCallback((img: string) => {
    const imageOnly = (post?.images ?? []).filter((u: string) => !isVideoUrl(u))
    const idx = imageOnly.indexOf(img)
    setLightboxIndex(idx >= 0 ? idx : 0)
    setLightboxOpen(true)
  }, [post?.images])

  const renderImageItem = useCallback(
    ({ item: img }: { item: string }) => (
      <View style={{ width, aspectRatio: isVideoUrl(img) ? 16 / 9 : 1 }}>
        {isVideoUrl(img) ? (
          <MediaItem
            uri={img}
            style={{ width, aspectRatio: 16 / 9 }}
            autoplay={false}
            muted
            videoControls
          />
        ) : (
          <Pressable onPress={() => openLightbox(img)}>
            <Image source={{ uri: img }} cachePolicy="memory-disk" style={{ width, aspectRatio: 1 }} contentFit="cover" />
          </Pressable>
        )}
      </View>
    ),
    [width, openLightbox],
  )
  const getImageItemLayout = useCallback(
    (_: any, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  )

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: lightColors.background }} edges={["top"]}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing[3] }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }} accessibilityLabel="뒤로가기" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Text style={{ color: lightColors.ink500 }}>게시글을 찾을 수 없습니다</Text>
      </SafeAreaView>
    )
  }

  const isOwner = user?.id === post.user_id
  const images = post.images ?? []

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>게시글</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable onPress={handleLike} hitSlop={8} style={styles.headerBtn}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={22}
              color={isLiked ? "#ef4444" : lightColors.ink900}
            />
          </Pressable>
          <Pressable onPress={handleShare} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="share-social-outline" size={22} color={lightColors.ink900} />
          </Pressable>
          <PostActionsMenu
            kind="board"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/board/${post.id}/edit`}
            onDeleted={() => router.back()}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* 제목 */}
          <Text style={styles.titleText}>{post.title}</Text>

          {/* 이미지 캐러셀 */}
          {images.length > 0 && (
            <View style={{ marginVertical: spacing[3] }}>
              <FlatList
                data={images}
                keyExtractor={imageKeyExtractor}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onImageScrollEnd}
                renderItem={renderImageItem}
                getItemLayout={getImageItemLayout}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
              />
              {images.length > 1 && (
                <View style={styles.indicator}>
                  <Text style={styles.indicatorText}>
                    {imageIndex + 1} / {images.length}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* 본문 */}
          <View style={styles.contentWrap}>
            <Text style={styles.contentText}>{post.content}</Text>
          </View>

          {/* 메타 */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{(post.view_count ?? 0).toLocaleString()}</Text>
            </View>
            <Pressable
              onPress={handleLike}
              disabled={likeLoading}
              style={[styles.metaItem, isLiked && { backgroundColor: "rgba(239,68,68,0.1)" }]}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={14}
                color={isLiked ? "#ef4444" : lightColors.ink500}
              />
              <Text style={[styles.metaText, isLiked && { color: "#ef4444" }]}>
                {(post.like_count ?? 0).toLocaleString()}
              </Text>
            </Pressable>
            <View style={styles.metaItem}>
              <Ionicons name="chatbubble-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{(post.comment_count ?? 0).toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* 댓글 */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>댓글 {comments.length}</Text>
            {comments.length === 0 ? (
              <Text style={styles.emptyComments}>첫 댓글을 남겨보세요</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.avatarSmall}>
                    {c.author_avatar ? (
                      <Image source={{ uri: c.author_avatar }} cachePolicy="memory-disk" style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarSmallLetter}>
                        {(c.author_name?.[0] ?? "?").toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.commentTop}>
                      <Text style={styles.commentAuthor}>{c.author_name}</Text>
                      <Text style={styles.commentTime}>{relativeDate(c.created_at)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.content}</Text>
                    {c.images && c.images.length > 0 && (
                      <View style={styles.commentImages}>
                        {c.images.map((img, i) => (
                          <Image key={i} source={{ uri: img }} style={styles.commentImg} />
                        ))}
                      </View>
                    )}
                  </View>
                  {(c.user_id === user?.id || isAdmin) && (
                    <Pressable onPress={() => handleDeleteComment(c.id)} hitSlop={6} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={14} color="#dc2626" />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>

          {/* 작성자 정보 — 가장 아래 */}
          <AuthorCard
            profile={{
              id: post.user_id,
              nickname: post.author_name,
              avatar_url: post.author_avatar ?? null,
              account_type: (post as any).author_account_type ?? null,
              created_at: (post as any).author_created_at ?? null,
            }}
            title="작성자"
          />
        </ScrollView>

        {/* 댓글 입력 */}
        {user && (
          <View style={styles.composer}>
            {commentImages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
                {commentImages.map((img, i) => (
                  <View key={i} style={styles.previewTile}>
                    <Image source={{ uri: img }} cachePolicy="memory-disk" style={styles.previewImg} />
                    <Pressable
                      onPress={() => setCommentImages((arr) => arr.filter((_, idx) => idx !== i))}
                      style={styles.previewRemove}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={10} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.composerRow}>
              <Pressable onPress={pickCommentImage} disabled={uploading} style={styles.composerBtn} hitSlop={6}>
                {uploading ? (
                  <ActivityIndicator size="small" color={lightColors.ink500} />
                ) : (
                  <Ionicons name="image-outline" size={20} color={lightColors.ink500} />
                )}
              </Pressable>
              <TextInput
                style={styles.composerInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="댓글을 입력하세요"
                placeholderTextColor={lightColors.ink500}
                multiline
                maxLength={500}
                accessibilityLabel="댓글 입력"
              />
              <Pressable
                onPress={submitComment}
                disabled={submitting || (!commentText.trim() && commentImages.length === 0)}
                accessibilityLabel="댓글 전송"
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!commentText.trim() && commentImages.length === 0) && { opacity: 0.4 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="send" size={16} color="#ffffff" />
                )}
              </Pressable>
            </View>
          </View>
        )}
        {!user && (
          <Pressable
            onPress={() => router.push("/auth/login" as any)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: lightColors.border,
              backgroundColor: lightColors.muted,
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={lightColors.primary} />
            <Text style={{ color: lightColors.primary, fontSize: 14, fontWeight: "600" }}>
              로그인하고 댓글 남기기
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
      {share.element}
      <ImageLightbox
        visible={lightboxOpen}
        images={(post?.images ?? []).filter((u: string) => !isVideoUrl(u))}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: "relative",
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: {
    position: "absolute",
    left: 56, right: 56,
    top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },

  avatarImg: { width: "100%", height: "100%" },

  titleText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink900,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    lineHeight: 28,
  },

  indicator: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  indicatorText: { fontSize: 11, fontWeight: "600", color: "#ffffff" },

  contentWrap: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.ink900,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  metaText: { fontSize: 12, color: colors.ink500 },

  divider: {
    height: 8,
    backgroundColor: colors.muted,
    marginTop: spacing[3],
  },

  commentsSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: spacing[3],
  },
  emptyComments: {
    fontSize: 13,
    color: colors.ink500,
    textAlign: "center",
    paddingVertical: spacing[5],
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarSmallLetter: { fontSize: 12, fontWeight: "700", color: colors.primary },
  commentTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  commentAuthor: { fontSize: 12, fontWeight: "600", color: colors.ink900 },
  commentTime: { fontSize: 10, color: colors.ink500 },
  commentText: { fontSize: 13, lineHeight: 18, color: colors.ink900 },
  commentImages: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
    flexWrap: "wrap",
  },
  commentImg: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },

  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  previewRow: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
  previewTile: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    marginRight: 6,
    overflow: "hidden",
    position: "relative",
  },
  previewImg: { width: "100%", height: "100%" },
  previewRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  composerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.muted,
    fontSize: fontSize.sm,
    color: colors.ink900,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
})
}

const styles = makeStyles(lightColors)
