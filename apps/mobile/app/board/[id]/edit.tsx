/**
 * 게시글 수정 — 광장 web /board/[id]/edit 1:1 미러.
 * board create form 동일 + prefill + supabase direct update.
 */

import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
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
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  getBoardPost,
  listBoardCategories,
  updateBoardPost,
  type BoardCategory,
} from "@gwangjang/features/board"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10

export default function BoardEditScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const loadedRef = useRef(false)
  const originalRef = useRef<string>("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    if (!id) return
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      router.back()
      return
    }
    const supabase = getSupabase()
    Promise.all([
      listBoardCategories(supabase, DEFAULT_PLAZA),
      getBoardPost(supabase, id, DEFAULT_PLAZA),
    ]).then(([cats, post]) => {
      setCategories(cats)
      if (post) {
        setTitle(post.title || "")
        setContent(post.content || "")
        setCategoryId(post.category_id || (cats[0]?.id ?? ""))
        setImages(post.images ?? [])
        // 원래 값 스냅샷 — 값 복원 시 dirty 해제 판별용
        originalRef.current = JSON.stringify({
          title: post.title || "",
          content: post.content || "",
          categoryId: post.category_id || (cats[0]?.id ?? ""),
          images: post.images ?? [],
        })
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id, user, router])

  useEffect(() => {
    if (!loadedRef.current) return
    // 현재 값이 원래 값과 같으면 dirty 아님 (수정 후 되돌린 경우 경고 X)
    const current = JSON.stringify({ title, content, categoryId, images })
    setFormDirty(current !== originalRef.current)
  }, [title, content, images, categoryId])

  async function pickImages() {
    try {
    if (images.length >= MAX_IMAGES) return
    const r = await ImagePicker.launchImageLibraryAsync({
      // 이미지 + 동영상 둘 다 지원 (web board/[id]/edit 1:1)
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    })
    if (!r.assets || r.assets.length === 0) return
    const assets = r.assets.slice(0, MAX_IMAGES - images.length)
    // URI 정규화 — file:// 프리픽스 보장 (Android content:// 대응)
    const localUris = assets.map((a) => {
      const u = a.uri
      if (u.startsWith("file://") || u.startsWith("http")) return u
      if (u.startsWith("content://") || u.startsWith("/")) return u
      return `file://${u}`
    })

    // 즉시 로컬 URI 로 미리보기 표시
    setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))

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

  async function handleSubmit() {
    if (submitting || !id) return
    if (!title.trim() || !content.trim() || !categoryId) {
      Alert.alert("입력 필요", "모든 필드를 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const r = await updateBoardPost(getSupabase(), {
        plaza: DEFAULT_PLAZA,
        postId: id,
        title: title.trim(),
        content: content.trim(),
        categoryId,
        images,
      })
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      Alert.alert("수정 완료", "게시글이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/board/${id}` as any)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>글 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : uploading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.saveBtnText}>업로드 중</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>저장</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <View>
            <Text style={styles.label}>카테고리</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.chip,
                    categoryId === c.id ? { backgroundColor: lightColors.primary } : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: categoryId === c.id ? "#ffffff" : lightColors.ink900 }]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="제목"
            placeholderTextColor={lightColors.ink500}
            style={styles.titleInput}
            maxLength={100}
          />

          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="내용을 입력하세요"
            placeholderTextColor={lightColors.ink500}
            multiline
            style={styles.contentInput}
          />

          <View>
            <Text style={styles.label}>사진/동영상 ({images.length}/{MAX_IMAGES}) · ⭐ 탭하여 대표이미지 지정</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {images.map((url, idx) => (
                <View key={idx} style={styles.imgWrap}>
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
                    <Pressable
                      onPress={() => setImages((p) => {
                        const next = [...p]
                        const [picked] = next.splice(idx, 1)
                        next.unshift(picked)
                        return next
                      })}
                      style={styles.thumbStarBtn}
                      hitSlop={6}
                    >
                      <Ionicons name="star-outline" size={14} color="#ffffff" />
                    </Pressable>
                  )}
                  <Pressable onPress={() => setImages((p) => p.filter((_, i) => i !== idx))} style={styles.imgRemove} hitSlop={6}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  saveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: lightColors.primary, minWidth: 60, alignItems: "center",
  },
  saveBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: { fontSize: 15, fontWeight: "600", color: lightColors.ink900, marginBottom: 8, letterSpacing: -0.1 },

  titleInput: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
    fontSize: fontSize.md, fontWeight: "600", color: lightColors.ink900,
  },
  contentInput: {
    minHeight: 200, paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    fontSize: fontSize.sm, color: lightColors.ink900, textAlignVertical: "top",
  },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  imgWrap: { width: 100, height: 100, position: "relative", overflow: "visible" },
  img: { width: 100, height: 100, borderRadius: radius.md },
  imgRemove: {
    position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
  },
  thumbBadge: {
    position: "absolute", bottom: 4, left: 4,
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: "rgba(250,204,21,0.95)",
  },
  thumbBadgeText: { color: "#78350f", fontSize: 10, fontWeight: "700" },
  thumbStarBtn: {
    position: "absolute", bottom: 4, left: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },
  imgPick: {
    width: 100, height: 100, borderRadius: radius.md,
    borderWidth: 2, borderStyle: "dashed", borderColor: lightColors.border,
    alignItems: "center", justifyContent: "center",
  },
})
