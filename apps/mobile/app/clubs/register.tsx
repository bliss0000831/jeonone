/**
 * 모임 만들기 — 광장 web /clubs/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 모임 만들기 + 그라디언트 아이콘)
 *   - 제목 *
 *   - 종목 (CLUB_SPORT_TYPES 칩) *
 *   - 실력 수준 (CLUB_SKILL_LEVELS 칩)
 *   - 한 줄 소개
 *   - 상세 내용
 *   - 장소
 *   - 날짜 / 시간 (text input — RN datepicker 미설치, "YYYY-MM-DD" / "HH:MM" 형식 가이드)
 *   - 최대 인원 stepper (2~100)
 *   - 등록 버튼
 */

import { useEffect, useState } from "react"
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
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createClubAtomic,
  CLUB_SPORT_TYPES,
  CLUB_SKILL_LEVELS,
} from "@gwangjang/features/clubs"
import { gwangjangFetch, uploadImage } from "@/lib/supabase"
import { DatePickerField } from "@/components/DatePickerField"
import { AddressSearch } from "@/components/AddressSearch"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const SPORT_EMOJI: Record<string, string> = {
  러닝: "🏃", 배드민턴: "🏸", 축구: "⚽", 농구: "🏀", 테니스: "🎾",
  등산: "⛰️", 수영: "🏊", 자전거: "🚴", 요가: "🧘", 기타: "🎯",
}

const MAX_IMAGES = 10

export default function ClubsRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const [regionId, setRegionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [sportType, setSportType] = useState<string>(CLUB_SPORT_TYPES[0])
  const [skillLevel, setSkillLevel] = useState<string>(CLUB_SKILL_LEVELS[0])
  const [location, setLocation] = useState("")
  const [meetingDate, setMeetingDate] = useState("")
  const [meetingTime, setMeetingTime] = useState("")
  const [maxMembers, setMaxMembers] = useState(10)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (title.trim() || description.trim() || content.trim() || images.length > 0) setFormDirty(true)
  }, [title, description, content, images])

  async function pickImages() {
    try {
      if (images.length >= MAX_IMAGES) return
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다. 설정에서 허용해 주세요.")
        return
      }
      const remaining = MAX_IMAGES - images.length
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      })
      if (!result.assets || result.assets.length === 0) return
      const assets = result.assets.slice(0, remaining)
      const localUris = assets.map((a) => {
        const u = a.uri
        if (u.startsWith("file://") || u.startsWith("http")) return u
        if (u.startsWith("content://") || u.startsWith("/")) return u
        return `file://${u}`
      })
      setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))
      setUploading(true)
      try {
        const settled = await Promise.allSettled(
          assets.map((a) => uploadImage(a.uri, "clubs")),
        )
        let failCount = 0
        setImages((prev) => {
          const next = [...prev]
          for (let i = 0; i < settled.length; i++) {
            const idx = next.indexOf(localUris[i])
            if (idx === -1) continue
            const res = settled[i]
            if (res.status === "fulfilled" && res.value) next[idx] = res.value
            else failCount++
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

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (title.trim()) setFormDirty(true)
  }, [title])

  async function handleSubmit() {
    if (submitting) return
    if (!title.trim()) {
      Alert.alert("입력 필요", "제목을 입력해주세요")
      return
    }
    if (uploading) {
      Alert.alert("업로드 중", "이미지 업로드가 끝난 후 다시 시도해주세요.")
      return
    }
    const unuploaded = images.filter((u) => !u.startsWith("http"))
    if (unuploaded.length > 0) {
      Alert.alert("업로드 미완료", `${unuploaded.length}개 이미지가 업로드되지 않았습니다. 해당 이미지를 삭제하거나 다시 추가해주세요.`)
      return
    }
    setSubmitting(true)
    try {
      const r = await createClubAtomic(
        (u, init) => gwangjangFetch(u, init as any),
        {
          title: title.trim(),
          description: description.trim() || null,
          content: content.trim() || null,
          category: sportType,
          sport_type: sportType,
          location: location.trim() || null,
          meeting_date: meetingDate.trim() || null,
          meeting_time: meetingTime.trim() || null,
          max_members: maxMembers,
          skill_level: skillLevel,
          images,
        },
      )
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("clubs", r.postId, regionId)
      Alert.alert("등록 완료", "모임이 만들어졌습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/clubs/${r.postId}` as any)
      else router.back()
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
          <View style={styles.iconBg}>
            <Ionicons name="people" size={16} color="#ffffff" />
          </View>
          <Text style={styles.headerTitle}>모임 만들기</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="모임 제목을 입력하세요"
              placeholderTextColor={lightColors.ink500}
              maxLength={60}
              style={styles.input}
            />
          </Field>

          {/* Sport */}
          <Field label="종목 *">
            <View style={styles.chipWrap}>
              {CLUB_SPORT_TYPES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setSportType(c)}
                  style={[
                    styles.chip,
                    sportType === c
                      ? { backgroundColor: lightColors.primary, borderColor: lightColors.primary }
                      : styles.chipIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: sportType === c ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {SPORT_EMOJI[c]} {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* Skill */}
          <Field label="실력 수준">
            <View style={styles.chipWrap}>
              {CLUB_SKILL_LEVELS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSkillLevel(s)}
                  style={[
                    styles.chip,
                    skillLevel === s
                      ? { backgroundColor: lightColors.primary, borderColor: lightColors.primary }
                      : styles.chipIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: skillLevel === s ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="한줄 소개">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="모임을 한 줄로 소개해주세요"
              placeholderTextColor={lightColors.ink500}
              maxLength={100}
              style={styles.input}
            />
          </Field>

          <Field label="상세 내용">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={"모임에 대해 자세히 소개해주세요\n- 어떤 활동을 하나요?\n- 준비물은?\n- 참여 방법은?"}
              placeholderTextColor={lightColors.ink500}
              multiline
              style={[styles.input, styles.textarea]}
            />
          </Field>

          <Field label={`사진/동영상 (${images.length}/${MAX_IMAGES})`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {images.map((url, idx) => (
                <View key={`${idx}-${url}`} style={styles.imgWrap}>
                  {url.startsWith("http") ? (
                    <ExpoImage source={url} contentFit="cover" style={styles.img} />
                  ) : (
                    <RNImage source={{ uri: url }} resizeMode="cover" style={styles.img} />
                  )}
                  <Pressable onPress={() => removeImage(idx)} style={styles.imgRemove} hitSlop={6}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable onPress={pickImages} style={styles.imgAdd} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator size="small" color={lightColors.ink500} />
                  ) : (
                    <Ionicons name="camera-outline" size={24} color={lightColors.ink500} />
                  )}
                </Pressable>
              )}
            </ScrollView>
          </Field>

          <Field label="모임 장소">
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

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="날짜">
                <DatePickerField
                  value={meetingDate}
                  onChange={setMeetingDate}
                  mode="date"
                  placeholder="날짜 선택"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="시간">
                <DatePickerField
                  value={meetingTime}
                  onChange={setMeetingTime}
                  mode="time"
                  placeholder="시간 선택"
                />
              </Field>
            </View>
          </View>

          <Field label="최대 인원">
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => setMaxMembers((n) => Math.max(2, n - 1))}
                style={styles.stepperBtn}
              >
                <Text style={styles.stepperBtnText}>-</Text>
              </Pressable>
              <Text style={styles.stepperVal}>{maxMembers}명</Text>
              <Pressable
                onPress={() => setMaxMembers((n) => Math.min(100, n + 1))}
                style={styles.stepperBtn}
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </Field>

          <RegisterConsentBlock serviceKind="club" onChange={setConsented} />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !consented}
            style={[styles.submitBtn, (submitting || !consented) && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <Ionicons name="people" size={16} color="#ffffff" />
                <Text style={styles.submitBtnText}>모임 만들기</Text>
              </View>
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
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    marginBottom: spacing[2],
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

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipIdle: { borderColor: lightColors.border, backgroundColor: lightColors.background },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnText: { fontSize: 20, fontWeight: "700", color: lightColors.ink900 },
  stepperVal: { fontSize: fontSize.lg, fontWeight: "700", color: lightColors.ink900, minWidth: 60, textAlign: "center" },

  imgWrap: { position: "relative" },
  img: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: lightColors.muted },
  imgRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgAdd: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.background,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
    alignItems: "center",
  },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
})
