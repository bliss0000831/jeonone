/**
 * 모임 수정 — 광장 web /clubs/[id]/edit 미러 (없으면 register form 동일).
 * PATCH /api/clubs/[id].
 */

import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  getClubPost,
  updateClub,
  CLUB_SPORT_TYPES,
  CLUB_SKILL_LEVELS,
} from "@gwangjang/features/clubs"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"
import { DatePickerField } from "@/components/DatePickerField"
import { AddressSearch } from "@/components/AddressSearch"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"


const SPORT_EMOJI: Record<string, string> = {
  러닝: "🏃", 배드민턴: "🏸", 축구: "⚽", 농구: "🏀", 테니스: "🎾",
  등산: "⛰️", 수영: "🏊", 자전거: "🚴", 요가: "🧘", 기타: "🎯",
}

export default function ClubsEditScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { user } = useAuth()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const loadedRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [sportType, setSportType] = useState<string>(CLUB_SPORT_TYPES[0])
  const [skillLevel, setSkillLevel] = useState<string>(CLUB_SKILL_LEVELS[0])
  const [location, setLocation] = useState("")
  const [regionId, setRegionId] = useState<string | null>(null)
  const [meetingDate, setMeetingDate] = useState("")
  const [meetingTime, setMeetingTime] = useState("")
  const [maxMembers, setMaxMembers] = useState(10)

  useEffect(() => {
    if (!id) return
    getClubPost(getSupabase(), id, DEFAULT_PLAZA).then(({ post }) => {
      if (post) {
        setTitle(post.title || "")
        setDescription(post.description || "")
        setContent(post.content || "")
        setSportType((post.sport_type as string) || CLUB_SPORT_TYPES[0])
        setSkillLevel((post.skill_level as string) || CLUB_SKILL_LEVELS[0])
        setLocation(post.location || "")
        setRegionId((post as any).region_id ?? null)
        setMeetingDate(post.meeting_date || "")
        setMeetingTime(post.meeting_time || "")
        setMaxMembers(post.max_members || 10)
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, content])

  async function handleSubmit() {
    if (submitting || !id) return
    if (!title.trim()) {
      Alert.alert("입력 필요", "제목을 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const r = await updateClub(
        (u, init) => gwangjangFetch(u, init as any),
        id,
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
        },
      )
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      await setPostRegion("clubs", id, regionId)
      Alert.alert("수정 완료", "모임이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/clubs/${id}` as any)
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
        <Text style={styles.headerTitle}>모임 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>저장</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Field label="제목 *">
            <TextInput value={title} onChangeText={setTitle} maxLength={60} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

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
                  <Text style={[styles.chipText, { color: sportType === c ? "#ffffff" : lightColors.ink900 }]}>
                    {SPORT_EMOJI[c]} {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

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
                  <Text style={[styles.chipText, { color: skillLevel === s ? "#ffffff" : lightColors.ink900 }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="한줄 소개">
            <TextInput value={description} onChangeText={setDescription} maxLength={100} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="상세 내용">
            <TextInput value={content} onChangeText={setContent} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="모임 장소">
            <AddressSearch
              value={location}
              onChange={(addr) => setLocation(addr)}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <RegionFormField
            plazaId={DEFAULT_PLAZA}
            userId={user?.id}
            address={location}
            value={regionId}
            onChange={setRegionId}
            skipAutoDefault
          />

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="날짜">
                <DatePickerField value={meetingDate} onChange={setMeetingDate} mode="date" placeholder="날짜 선택" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="시간">
                <DatePickerField value={meetingTime} onChange={setMeetingTime} mode="time" placeholder="시간 선택" />
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

  input: {
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background, fontSize: 15, color: lightColors.ink900,
  },
  textarea: { minHeight: 140, textAlignVertical: "top", lineHeight: 22 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipIdle: { borderColor: lightColors.border, backgroundColor: lightColors.background },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepperBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: lightColors.border,
    alignItems: "center", justifyContent: "center",
  },
  stepperBtnText: { fontSize: 20, fontWeight: "700", color: lightColors.ink900 },
  stepperVal: { fontSize: fontSize.lg, fontWeight: "700", color: lightColors.ink900, minWidth: 60, textAlign: "center" },
})
