/**
 * 게시판 글쓰기 — 광장 web /board/create 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 글쓰기)
 *   - 카테고리 (board_categories 칩)
 *   - 제목 *
 *   - 본문 *
 *   - 이미지 (최대 10장)
 *   - 등록 버튼 (createBoardPost — supabase direct insert)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Alert } from "@/lib/alert"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createBoardPost,
  listBoardCategories,
  type BoardCategory,
} from "@gwangjang/features/board"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, uploadImage, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"

const MAX_IMAGES = 10

export default function BoardCreateScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [nickname, setNickname] = useState<string>("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  // 지역 (sub_region) — 사용자 프로필에서 prefill, plaza coverage 안에서 변경 가능 (web 1:1)
  const [region, setRegion] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<string[]>([])
  // 시/군 region FK (regions 테이블) — sub_region 과 별개
  const [cityRegionId, setCityRegionId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      router.back()
      return
    }
    const supabase = getSupabase()
    listBoardCategories(supabase, DEFAULT_PLAZA).then((cats) => {
      setCategories(cats)
      if (cats.length > 0) setCategoryId(cats[0].id)
    })
    // 🅲 댓글 작성자 표시 — 현재 광장 plaza_profiles 우선 (nickname/avatar)
    ;(async () => {
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("nickname, avatar_url, sub_region")
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
      const pp: any = (ppRes as any)?.data || {}
      const d: any = profRes?.data || {}
      setNickname((pp.nickname ?? d.nickname) || "익명")
      setAvatarUrl((pp.avatar_url ?? d.avatar_url) ?? null)
      if (d?.sub_region) setRegion(d.sub_region as string)
    })()
    // 광장 coverage 로드 (지역 chip 용)
    if (DEFAULT_PLAZA) {
      supabase
        .from("plazas")
        .select("coverage")
        .eq("id", DEFAULT_PLAZA)
        .maybeSingle()
        .then(({ data }) => {
          const cov = (data as any)?.coverage
          if (Array.isArray(cov)) setCoverage(cov)
        })
    }
  }, [user, router, DEFAULT_PLAZA])

  async function pickImages() {
    try {
    if (images.length >= MAX_IMAGES) return
    const result = await ImagePicker.launchImageLibraryAsync({
      // 이미지 + 동영상 둘 다 지원 (web board/create 1:1)
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    })
    if (!result.assets || result.assets.length === 0) return
    const assets = result.assets.slice(0, MAX_IMAGES - images.length)
    // URI 정규화 — file:// 프리픽스 보장 (Android content:// 대응)
    const localUris = assets.map((a) => {
      const u = a.uri
      if (u.startsWith("file://") || u.startsWith("http")) return u
      if (u.startsWith("content://") || u.startsWith("/")) return u
      // 웹: blob:/data: 등 스킴 있는 URI 는 그대로 — file:// 붙이면 깨져 미리보기 안 됨
      if (u.includes(":")) return u
      return `file://${u}`
    })

    // 즉시 로컬 URI 로 미리보기 표시
    setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))
    setFormDirty(true)

    // 백그라운드 업로드 → 로컬 URI 를 서버 URL 로 교체
    setUploading(true)
    try {
      const settled = await Promise.allSettled(
        assets.map((a) => uploadImage(a.uri, "board")),
      )
      let failCount = 0
      setImages((prev) => {
        const next = [...prev]
        for (let i = 0; i < settled.length; i++) {
          const localUri = localUris[i]
          const idx = next.indexOf(localUri)
          if (idx === -1) continue
          const res = settled[i]
          if (res.status === "fulfilled" && res.value) {
            next[idx] = res.value
          } else {
            // 업로드 실패해도 로컬 URI 유지 (미리보기 보존)
            failCount++
          }
        }
        return next
      })
      if (failCount > 0) Alert.alert("업로드 실패", `${failCount}개 파일 업로드에 실패했습니다. 재업로드가 필요합니다.`)
    } catch (err) {
      Alert.alert("업로드 오류", (err as Error)?.message || "이미지 업로드에 실패했습니다")
    } finally {
      setUploading(false)
    }
    } catch (err) {
      Alert.alert("이미지 선택 오류", `${(err as Error)?.message || "알 수 없는 오류"}`)
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  // 대표이미지 지정 — idx 를 0번으로 이동 (web /board/create setAsThumbnail 1:1)
  function setAsThumbnail(idx: number) {
    if (idx === 0) return
    setImages((prev) => {
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      next.unshift(picked)
      return next
    })
  }

  async function handleSubmit() {
    if (submitting || !user) return
    const errors: string[] = []
    if (!title.trim()) errors.push("제목을 입력해주세요")
    if (!content.trim()) errors.push("내용을 입력해주세요")
    if (!categoryId) errors.push("카테고리를 선택해주세요")
    if (errors.length > 0) {
      Alert.alert("입력을 확인해주세요", errors.join("\n"))
      return
    }
    // 업로드 실패한 로컬 이미지(file://) 가 남아있으면 제출 차단 — 깨진 이미지 방지
    if (uploading) {
      Alert.alert("업로드 중", "이미지 업로드가 끝난 후 다시 시도해주세요.")
      return
    }
    const unuploaded = images.filter((u) => !u.startsWith("http"))
    if (unuploaded.length > 0) {
      Alert.alert(
        "업로드 미완료",
        `${unuploaded.length}개 이미지가 업로드되지 않았습니다. 해당 이미지를 삭제하거나 다시 추가해주세요.`,
      )
      return
    }
    setSubmitting(true)
    try {
      const r = await createBoardPost(getSupabase(), {
        plaza: DEFAULT_PLAZA,
        userId: user.id,
        authorName: nickname,
        authorAvatar: avatarUrl,
        title: title.trim(),
        content: content.trim(),
        categoryId,
        images,
        region,
      })
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("board_posts", r.postId, cityRegionId)
      // 포인트 적립 (web /api/points/award 1:1)
      if (r.postId) {
        try {
          await gwangjangFetch("/api/points/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleId: "post.create",
              sourceId: r.postId,
              qualityData: {
                length: content.trim().length,
                has_image: images.length > 0,
              },
            }),
          })
        } catch {}
      }
      setFormDirty(false)
      Alert.alert("등록 완료", "게시글이 등록되었습니다")
      if (r.postId) {
        router.replace(`/board/${r.postId}` as any)
      } else {
        router.back()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn} accessibilityLabel="뒤로가기" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>글쓰기</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting || uploading}
          style={[styles.submitInline, (submitting || uploading) && { opacity: 0.5 }]}
          accessibilityLabel="게시글 등록"
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : uploading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.submitInlineText}>업로드 중</Text>
            </View>
          ) : (
            <Text style={styles.submitInlineText}>등록</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Category chips */}
          <View>
            <Text style={styles.label}>게시판 *</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.chip,
                    categoryId === c.id
                      ? { backgroundColor: lightColors.primary }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: categoryId === c.id ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 지역 (sub_region) — web Select 1:1 */}
          {coverage.length > 0 && (
            <View>
              <Text style={styles.label}>지역</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Pressable
                  onPress={() => setRegion(null)}
                  style={[
                    styles.chip,
                    !region
                      ? { backgroundColor: lightColors.primary }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: !region ? "#ffffff" : lightColors.ink900 }]}>
                    전체
                  </Text>
                </Pressable>
                {coverage.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRegion(r)}
                    style={[
                      styles.chip,
                      region === r
                        ? { backgroundColor: lightColors.primary }
                        : { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: region === r ? "#ffffff" : lightColors.ink900 }]}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 시/군 region — 새 region 필터 시스템 */}
          <RegionFormField
            plazaId={DEFAULT_PLAZA}
            userId={user?.id}
            value={cityRegionId}
            onChange={setCityRegionId}
          />

          {/* Title */}
          <TextInput
            value={title}
            onChangeText={(v) => { setTitle(v); setFormDirty(true) }}
            placeholder="제목"
            placeholderTextColor={lightColors.ink500}
            style={styles.titleInput}
            maxLength={100}
            accessibilityLabel="게시글 제목 입력"
          />
          <Text style={{ fontSize: 11, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
            {title.length}/100
          </Text>

          {/* Content */}
          <TextInput
            value={content}
            onChangeText={(v) => { setContent(v); setFormDirty(true) }}
            placeholder="내용을 입력하세요"
            placeholderTextColor={lightColors.ink500}
            multiline
            maxLength={3000}
            style={styles.contentInput}
            accessibilityLabel="게시글 내용 입력"
          />
          <Text style={{ fontSize: 11, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
            {content.length}/3000
          </Text>

          {/* Images */}
          <View>
            <Text style={styles.label}>사진/동영상 ({images.length}/{MAX_IMAGES}) · ⭐ 탭하여 대표이미지 지정</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {images.map((url, idx) => (
                <View key={`${idx}-${url}`} style={styles.imgWrap}>
                  {url.startsWith("http") ? (
                    <ExpoImage source={url} contentFit="cover" style={styles.img} />
                  ) : (
                    <RNImage source={{ uri: url }} resizeMode="cover" style={styles.img} />
                  )}
                  {idx === 0 ? (
                    <View style={styles.thumbBadge}>
                      <Ionicons name="star" size={10} color="#fde68a" />
                      <Text style={styles.thumbBadgeText}>대표</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => setAsThumbnail(idx)} style={styles.thumbStarBtn} hitSlop={6}>
                      <Ionicons name="star-outline" size={14} color="#ffffff" />
                    </Pressable>
                  )}
                  <Pressable onPress={() => removeImage(idx)} style={styles.imgRemove} hitSlop={6}>
                    <Ionicons name="close" size={12} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable onPress={pickImages} style={styles.imgPick} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator size="small" color={lightColors.ink500} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={24} color={lightColors.ink500} />
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  submitInline: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
    minWidth: 60,
    alignItems: "center",
  },
  submitInlineText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },

  titleInput: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  contentInput: {
    minHeight: 200,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    textAlignVertical: "top",
  },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  imgWrap: { width: 100, height: 100, position: "relative", overflow: "visible" },
  img: { width: 100, height: 100, borderRadius: radius.md },
  imgRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(250,204,21,0.95)",
  },
  thumbBadgeText: { color: "#78350f", fontSize: 10, fontWeight: "700" },
  thumbStarBtn: {
    position: "absolute",
    bottom: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgPick: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
