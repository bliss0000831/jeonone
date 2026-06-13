/**
 * 구인구직 등록 — 광장 web /jobs/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 구인구직 등록)
 *   - 구인 / 구직 토글
 *   - 사진 (최대 10장)
 *   - 제목 *
 *   - 카테고리 (JOBS_CATEGORIES 칩)
 *   - 근무 형태 (WORK_TYPES 칩)
 *   - 시급 * (MIN_WAGE_2026 미만 경고)
 *   - 근무일 / 근무시간
 *   - 위치 / 연락처
 *   - 설명 *
 *   - 등록 버튼
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image as RNImage,
} from "react-native"
import { Alert } from "@/lib/alert"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createJobsPost,
  JOBS_CATEGORIES,
  JOBS_WORK_TYPES,
  MIN_WAGE_2026,
} from "@gwangjang/features/jobs"
import { gwangjangFetch, uploadImage } from "@/lib/supabase"
import { AddressSearch } from "@/components/AddressSearch"
import { DatePickerField } from "@/components/DatePickerField"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { JobsConsentExtras } from "@/components/legal/JobsConsentExtras"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const TEAL = "#0d9488"

export default function JobsRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const [regionId, setRegionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [kind, setKind] = useState<"hiring" | "seeking">("hiring")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<string>(JOBS_CATEGORIES[0])
  const [workType, setWorkType] = useState<string>(JOBS_WORK_TYPES[0])
  const [hourlyWage, setHourlyWage] = useState("")
  const [workDays, setWorkDays] = useState("")
  // 근무시간 — DatePickerField time 모드 (시작/종료 분리 후 "HH:MM ~ HH:MM" 합쳐 저장)
  const [workStart, setWorkStart] = useState("")
  const [workEnd, setWorkEnd] = useState("")
  const workHours =
    workStart && workEnd
      ? `${workStart} ~ ${workEnd}`
      : workStart || workEnd || ""
  const [location, setLocation] = useState("")
  const [contact, setContact] = useState("")

  useEffect(() => {
    if (title.trim() || description.trim() || images.length > 0) setFormDirty(true)
  }, [title, description, images])

  const wageNum = Number(hourlyWage) || 0
  const wageBelowMin = wageNum > 0 && wageNum < MIN_WAGE_2026

  // 대표이미지 지정 — idx 를 0번으로 이동 (web 1:1, 모바일 통일)
  function setAsThumbnail(idx: number) {
    if (idx === 0) return
    setImages((prev) => {
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      next.unshift(picked)
      return next
    })
  }

  async function pickImages() {
    try {
    if (images.length >= MAX_IMAGES) return
    // 사진 권한 — 거부 시 빈 화면 대신 안내 (다른 등록 화면과 동일)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다. 설정에서 허용해 주세요.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // 이미지 + 동영상 (web 1:1)
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

    // 백그라운드 업로드 → 로컬 URI 를 서버 URL 로 교체
    setUploading(true)
    try {
      const settled = await Promise.allSettled(
        assets.map((a) => uploadImage(a.uri, "jobs")),
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

  async function handleSubmit() {
    if (submitting) return
    if (!title.trim() || !description.trim()) {
      Alert.alert("입력 필요", "제목과 설명을 입력해주세요")
      return
    }
    if (!hourlyWage || Number.isNaN(wageNum) || wageNum <= 0) {
      Alert.alert("시급 오류", "시급을 정확히 입력해주세요 (원 단위, 0보다 큰 숫자)")
      return
    }
    // 업로드 중/실패한 로컬 이미지(file://) 가 남아있으면 제출 차단 — 깨진 이미지 등록 방지
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
      const r = await createJobsPost(
        (u, init) => gwangjangFetch(u, init as any),
        {
          kind,
          title: title.trim(),
          description: description.trim(),
          category,
          workType,
          hourlyWage: wageNum,
          workDays: workDays.trim(),
          workHours: workHours.trim(),
          location: location.trim(),
          contact: contact.trim(),
          images,
        },
      )
      if (r.rateLimited) {
        Alert.alert("등록 제한", r.error ?? "")
        return
      }
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("jobs_posts", r.postId, regionId)
      if (r.flagged) {
        Alert.alert("등록 완료", "등록되었지만 관리자 검토 중입니다.")
      } else {
        Alert.alert("등록 완료", "공고가 성공적으로 등록되었습니다")
      }
      setFormDirty(false)
      if (r.postId && !r.flagged) router.replace(`/jobs/${r.postId}` as any)
      else router.replace("/(tabs)/mypage" as any)
    } catch (e: any) {
      console.warn("[jobs/register] submit failed", e)
      Alert.alert(
        "네트워크 오류",
        "등록에 실패했습니다. 입력 내용은 유지되니 다시 시도해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "다시 시도", onPress: () => { handleSubmit() } },
        ],
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="briefcase" size={18} color={TEAL} />
          <Text style={styles.headerTitle}>구인구직 등록</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Kind toggle */}
          <View style={styles.kindRow}>
            {(["hiring", "seeking"] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[
                  styles.kindBtn,
                  kind === k
                    ? { backgroundColor: k === "hiring" ? "#3b82f6" : "#a855f7" }
                    : { backgroundColor: lightColors.muted },
                ]}
              >
                <Text
                  style={[
                    styles.kindBtnText,
                    { color: kind === k ? "#ffffff" : lightColors.ink900 },
                  ]}
                >
                  {k === "hiring" ? "구인" : "구직"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Images */}
          <View>
            <Text style={styles.label}>사진 (최대 {MAX_IMAGES}장)</Text>
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

          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={kind === "hiring" ? "예: 카페 알바 모집" : "예: 카페 알바 구함"}
              placeholderTextColor={lightColors.ink500}
              maxLength={80}
              style={styles.input}
            />
            <Text style={{ fontSize: 13, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {title.length}/80
            </Text>
          </Field>

          <Field label="카테고리">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {JOBS_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: TEAL }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: category === c ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="근무 형태">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {JOBS_WORK_TYPES.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setWorkType(w)}
                  style={[
                    styles.chip,
                    workType === w
                      ? { backgroundColor: TEAL }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: workType === w ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {w}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label={`시급 * (2026 최저시급 ${MIN_WAGE_2026.toLocaleString()}원)`}>
            <TextInput
              value={hourlyWage}
              onChangeText={(v) => setHourlyWage(v.replace(/[^0-9]/g, ""))}
              placeholder="예: 12000"
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={[
                styles.input,
                wageBelowMin && { borderColor: "#ef4444" },
              ]}
            />
            {wageBelowMin && (
              <Text style={styles.warnText}>
                ⚠ 2026 최저시급({MIN_WAGE_2026.toLocaleString()}원) 미만입니다
              </Text>
            )}
          </Field>

          <Field label="근무일">
            <TextInput
              value={workDays}
              onChangeText={setWorkDays}
              placeholder="예: 월~금"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <Field label="근무시간">
            <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <DatePickerField
                  value={workStart}
                  onChange={setWorkStart}
                  mode="time"
                  placeholder="시작"
                  clearable
                />
              </View>
              <Text style={{ color: lightColors.ink500 }}>~</Text>
              <View style={{ flex: 1 }}>
                <DatePickerField
                  value={workEnd}
                  onChange={setWorkEnd}
                  mode="time"
                  placeholder="종료"
                  clearable
                />
              </View>
            </View>
          </Field>

          <Field label="근무지">
            <AddressSearch
              value={location}
              onChange={(addr) => setLocation(addr)}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={location}
            value={regionId}
            onChange={setRegionId}
          />

          <Field label="연락처 (선택)">
            <TextInput
              value={contact}
              onChangeText={setContact}
              placeholder="예: 010-0000-0000"
              placeholderTextColor={lightColors.ink500}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </Field>

          <Field label="상세 설명 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="업무 내용, 우대 사항 등을 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
            <Text style={{ fontSize: 13, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {description.length}/3000
            </Text>
          </Field>

          <JobsConsentExtras title={title} description={description} hourlyWage={wageNum || null} />

          <RegisterConsentBlock serviceKind="jobs" onChange={setConsented} />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || uploading || !consented}
            style={[styles.submitBtn, (submitting || uploading || !consented) && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : uploading ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.submitBtnText}>업로드 중...</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>
                {kind === "hiring" ? "구인 공고 등록" : "구직 공고 등록"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
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
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },

  kindRow: { flexDirection: "row", gap: 8 },
  kindBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  kindBtnText: { fontSize: fontSize.md, fontWeight: "700" },

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

  input: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    fontSize: 15,
    color: lightColors.ink900,
  },
  textarea: { minHeight: 140, textAlignVertical: "top", lineHeight: 22 },

  warnText: { fontSize: 11, color: "#ef4444", marginTop: 6 },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  submitBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: TEAL,
    alignItems: "center",
  },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
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
})
