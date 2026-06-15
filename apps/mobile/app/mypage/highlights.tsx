/**
 * 대표 사진 관리 — 광장 web /mypage/highlights 1:1 매핑.
 *
 * 구조:
 *   - Header: "대표 사진 관리"
 *   - 새 대표 사진 추가 카드: 제목 입력 + [사진][영상] 버튼
 *   - 목록: 위/아래 화살표 + 그라데이션 원형 썸네일 + 제목/타입 + 수정/삭제
 *   - 영상 지원 + 순서 변경 지원
 */

import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createHighlight,
  deleteHighlight,
  listHighlights,
  updateHighlight,
  type ProfileHighlight,
} from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { getSupabase, uploadImage, API_BASE } from "@/lib/supabase"
import { VideoPoster } from "@/components/mypage/VideoPoster"

const MAX_HIGHLIGHTS = 20
const MAX_TITLE_LEN = 12

type Row = ProfileHighlight & {
  sort_order?: number
  media_url?: string | null
  media_type?: "image" | "video" | null
}

export default function HighlightsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plaza = useCurrentPlaza()
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")

  // 이름 변경 모달
  const [renameTarget, setRenameTarget] = useState<Row | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)

  // 웹용 hidden <input type="file"> ref — RN Web 의 ImagePicker 가 불안정해서 직접 픽업
  const webFileInputRef = useRef<any>(null)
  const [webKind, setWebKind] = useState<"image" | "video">("image")

  const isWeb = Platform.OS === "web"

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const rows = await listHighlights(getSupabase(), user.id, plaza ?? null)
        setItems(rows as Row[])
      } catch (e) {
        console.warn("[highlights] load failed", e)
        Alert.alert("불러오기 실패", "대표 사진을 불러오지 못했어요. 다시 시도해 주세요.")
      } finally {
        setLoading(false)
      }
    })()
  }, [user, plaza])

  function showAlert(title: string, msg?: string) {
    if (isWeb) {
      if (typeof window !== "undefined") window.alert(`${title}${msg ? "\n" + msg : ""}`)
    } else {
      Alert.alert(title, msg)
    }
  }

  function confirmAsync(message: string): Promise<boolean> {
    if (isWeb) {
      return Promise.resolve(
        typeof window !== "undefined" ? window.confirm(message) : false,
      )
    }
    return new Promise((resolve) => {
      Alert.alert("확인", message, [
        { text: "취소", style: "cancel", onPress: () => resolve(false) },
        { text: "삭제", style: "destructive", onPress: () => resolve(true) },
      ])
    })
  }

  async function uploadAndCreate(
    kind: "image" | "video",
    source: { uri: string } | File,
  ) {
    if (!user) return
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      let url: string | null
      if (isWeb && (source as any) instanceof (globalThis as any).File) {
        const fd = new FormData()
        fd.append("file", source as any)
        fd.append("folder", "highlights")
        const supabase = getSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          headers,
          body: fd,
        })
        const json = await res.json().catch(() => ({}))
        url = res.ok ? (json.url as string) : null
      } else {
        url = await uploadImage((source as any).uri, "highlights")
      }
      if (!url) {
        showAlert("업로드 실패", "업로드에 실패했습니다")
        return
      }
      const maxOrder = items.reduce(
        (m, x) => Math.max(m, (x as Row).sort_order ?? -1),
        -1,
      )
      const created = await createHighlight(getSupabase(), {
        userId: user.id,
        title: trimmed,
        coverUrl: kind === "image" ? url : null,
        mediaUrl: url,
        mediaType: kind,
        durationMs: kind === "video" ? 15000 : 5000,
        sortOrder: maxOrder + 1,
        plazaId: plaza ?? null,
      })
      setItems((arr) => [...arr, created as Row])
      setTitle("")
    } catch (e: any) {
      showAlert("오류", e?.message || "추가 실패")
    } finally {
      setBusy(false)
    }
  }

  async function pickAndUpload(kind: "image" | "video") {
    if (!user) return
    const trimmed = title.trim()
    if (!trimmed) {
      showAlert("알림", "제목을 먼저 입력해주세요")
      return
    }
    if (items.length >= MAX_HIGHLIGHTS) {
      showAlert("알림", `대표 사진은 최대 ${MAX_HIGHLIGHTS}개까지 등록할 수 있습니다`)
      return
    }

    if (isWeb) {
      // 웹: hidden file input 트리거
      setWebKind(kind)
      const el = webFileInputRef.current
      if (el) {
        el.accept = kind === "image" ? "image/*" : "video/*"
        el.value = ""
        el.click()
      }
      return
    }

    // 네이티브: expo-image-picker
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      showAlert("권한 필요", "미디어 접근 권한이 필요합니다.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: false,
      quality: 0.85,
      videoMaxDuration: 15,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset?.uri) return
    await uploadAndCreate(kind, { uri: asset.uri })
  }

  function handleWebFileChange(e: any) {
    const file: File | undefined = e?.target?.files?.[0]
    if (!file) return
    uploadAndCreate(webKind, file)
  }

  function openRename(h: Row) {
    setRenameTarget(h)
    setRenameValue(h.title)
  }

  async function submitRename() {
    if (!renameTarget || renameBusy) return
    const trimmed = renameValue.trim().slice(0, MAX_TITLE_LEN)
    if (!trimmed) {
      showAlert("알림", "제목은 비어있을 수 없습니다")
      return
    }
    if (trimmed === renameTarget.title) {
      setRenameTarget(null)
      return
    }
    setRenameBusy(true)
    try {
      await updateHighlight(getSupabase(), renameTarget.id, { title: trimmed })
      setItems((arr) =>
        arr.map((x) => (x.id === renameTarget.id ? { ...x, title: trimmed } : x)),
      )
      setRenameTarget(null)
      setRenameValue("")
    } catch (e: any) {
      showAlert("오류", e?.message || "수정 실패")
    } finally {
      setRenameBusy(false)
    }
  }

  async function confirmDelete(id: string) {
    const ok = await confirmAsync("이 대표 사진을 삭제할까요?")
    if (!ok) return
    try {
      await deleteHighlight(getSupabase(), id)
      setItems((p) => p.filter((h) => h.id !== id))
    } catch (e: any) {
      showAlert("오류", e?.message || "삭제 실패")
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const a = items[idx]
    const b = items[j]
    const aOrder = (a as Row).sort_order ?? idx
    const bOrder = (b as Row).sort_order ?? j
    const newArr = [...items]
    newArr[idx] = { ...b, sort_order: aOrder }
    newArr[j] = { ...a, sort_order: bOrder }
    setItems(newArr)
    const supabase = getSupabase()
    await Promise.all([
      updateHighlight(supabase, a.id, { sort_order: bOrder } as any).catch(() => {}),
      updateHighlight(supabase, b.id, { sort_order: aOrder } as any).catch(() => {}),
    ])
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isWeb &&
        // 웹: hidden 파일 input — pickAndUpload 가 click() 트리거
        require("react").createElement("input", {
          ref: webFileInputRef,
          type: "file",
          style: { display: "none" },
          onChange: handleWebFileChange,
        })}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>대표 사진 관리</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          {/* 새 대표 사진 추가 카드 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>새 대표 사진 추가</Text>
            <TextInput
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE_LEN))}
              placeholder="제목 (예: 신메뉴, 후기, 작업)"
              placeholderTextColor={lightColors.ink300}
              maxLength={MAX_TITLE_LEN}
              style={styles.input}
              editable={!busy}
            />
            <View style={styles.btnRow}>
              {busy ? (
                <View style={[styles.btnPrimary, { flex: 1 }]}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.btnPrimaryText}>업로드 중...</Text>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() => pickAndUpload("image")}
                    disabled={!title.trim() || items.length >= MAX_HIGHLIGHTS}
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      (!title.trim() || items.length >= MAX_HIGHLIGHTS) && styles.btnDisabled,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="image-outline" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>사진</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => pickAndUpload("video")}
                    disabled={!title.trim() || items.length >= MAX_HIGHLIGHTS}
                    style={({ pressed }) => [
                      styles.btnOutline,
                      (!title.trim() || items.length >= MAX_HIGHLIGHTS) && { opacity: 0.5 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="videocam-outline" size={16} color={lightColors.ink900} />
                    <Text style={styles.btnOutlineText}>영상</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Text style={styles.hint}>
              이미지 10MB / 영상 100MB까지 · 영상은 최대 15초까지 재생됩니다 · 최대 {MAX_HIGHLIGHTS}개 ({items.length}/{MAX_HIGHLIGHTS})
            </Text>
          </View>

          {/* 목록 카드 */}
          <View style={styles.listCard}>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>등록된 대표 사진이 없습니다</Text>
              </View>
            ) : (
              items.map((h, i) => (
                <View key={h.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  {/* 위/아래 이동 */}
                  <View style={styles.moveCol}>
                    <Pressable
                      onPress={() => move(i, -1)}
                      disabled={i === 0}
                      hitSlop={4}
                      style={({ pressed }) => [
                        styles.moveBtn,
                        i === 0 && { opacity: 0.3 },
                        pressed && { opacity: 0.5 },
                      ]}
                    >
                      <Ionicons name="chevron-up" size={14} color={lightColors.ink700} />
                    </Pressable>
                    <Pressable
                      onPress={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      hitSlop={4}
                      style={({ pressed }) => [
                        styles.moveBtn,
                        i === items.length - 1 && { opacity: 0.3 },
                        pressed && { opacity: 0.5 },
                      ]}
                    >
                      <Ionicons name="chevron-down" size={14} color={lightColors.ink700} />
                    </Pressable>
                  </View>

                  {/* 그라데이션 원형 썸네일 */}
                  <LinearGradient
                    colors={["#facc15", "#ec4899", "#9333ea"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ring}
                  >
                    <View style={styles.ringInner}>
                      {h.cover_url ? (
                        <Image
                          source={{ uri: h.cover_url }} cachePolicy="memory-disk"
                          style={styles.thumb}
                        />
                      ) : (h as Row).media_type === "video" && (h as Row).media_url ? (
                        <View style={styles.thumb}>
                          <VideoPoster
                            src={(h as Row).media_url as string}
                            style={StyleSheet.absoluteFill}
                            borderRadius={THUMB / 2}
                          />
                          <View style={styles.thumbPlayBadge}>
                            <Ionicons name="play" size={10} color="#fff" />
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.thumb, styles.thumbFallback]}>
                          <Text style={styles.thumbFallbackText}>
                            {h.title.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>

                  {/* 제목 + 타입 */}
                  <View style={styles.info}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {h.title}
                    </Text>
                    <View style={styles.typeRow}>
                      <Ionicons
                        name={
                          (h as Row).media_type === "video"
                            ? "videocam-outline"
                            : "image-outline"
                        }
                        size={12}
                        color={lightColors.ink500}
                      />
                      <Text style={styles.typeText}>
                        {(h as Row).media_type === "video" ? "영상" : "이미지"}
                      </Text>
                    </View>
                  </View>

                  {/* 액션 */}
                  <Pressable
                    onPress={() => openRename(h)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="pencil-outline" size={16} color={lightColors.ink500} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(h.id)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* 이름 변경 모달 */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !renameBusy && setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !renameBusy && setRenameTarget(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>대표 사진 제목 수정</Text>
            <Text style={styles.modalHint}>최대 {MAX_TITLE_LEN}자까지 입력할 수 있어요</Text>
            <TextInput
              autoFocus
              value={renameValue}
              onChangeText={(v) => setRenameValue(v.slice(0, MAX_TITLE_LEN))}
              placeholder="제목 입력"
              placeholderTextColor={lightColors.ink300}
              maxLength={MAX_TITLE_LEN}
              style={styles.input}
              editable={!renameBusy}
              returnKeyType="done"
              onSubmitEditing={submitRename}
            />
            <View style={styles.modalRow}>
              <Pressable
                onPress={() => !renameBusy && setRenameTarget(null)}
                style={[styles.modalBtn, styles.modalBtnGhost]}
                disabled={renameBusy}
              >
                <Text style={styles.modalBtnGhostText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={submitRename}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                disabled={renameBusy}
              >
                {renameBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>저장</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const RING_OUTER = 56
const RING_INNER = 52
const THUMB = 48

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
  headerBtn: { width: 36, padding: 6, alignItems: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  card: {
    backgroundColor: lightColors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  input: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    backgroundColor: lightColors.background,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: lightColors.primary,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  btnPrimaryText: { color: "#fff", fontSize: fontSize.sm, fontWeight: "600" },
  btnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: lightColors.border,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: lightColors.background,
  },
  btnOutlineText: {
    color: lightColors.ink900,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.5 },
  hint: { fontSize: fontSize.xs, color: lightColors.ink500 },

  listCard: {
    backgroundColor: lightColors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  empty: { padding: spacing[6], alignItems: "center" },
  emptyText: { fontSize: fontSize.sm, color: lightColors.ink500 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  moveCol: { gap: 2 },
  moveBtn: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: lightColors.muted,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.muted,
  },
  thumbVideo: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f2937", // 어두운 회색 — play 아이콘 강조
  },
  thumbPlayBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFallbackText: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink700,
  },
  info: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  typeText: { fontSize: fontSize.xs, color: lightColors.ink500 },
  actionBtn: {
    padding: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: lightColors.card,
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  modalHint: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
    marginBottom: spacing[3],
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  modalBtn: {
    minWidth: 72,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: { backgroundColor: "transparent" },
  modalBtnGhostText: {
    color: lightColors.ink700,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  modalBtnPrimary: { backgroundColor: lightColors.primary },
  modalBtnPrimaryText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
})
