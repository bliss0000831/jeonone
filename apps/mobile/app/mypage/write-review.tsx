/**
 * 후기 작성 — 광장 web 의 review 작성 폼 1:1 미러.
 *
 * 진입 query params:
 *   reviewed_user_id: 후기 대상 사용자
 *   source_type: 'local_food_order' | 'group_buying_order'
 *   source_id: 주문 ID (서버에서 거래 검증)
 *   target_name: (선택) 헤더 표시용 상대방 닉네임
 *
 * POST /api/reviews — 응답·정확·친절 3개 별점(1~5) + 내용(<500자).
 * 서버에서:
 *   - 거래 검증 (buyer 본인 + reviewed_user_id 가 seller 본인 + status 통과)
 *   - total_score = (3개 평균)
 *   - 중복 후기 차단 (unique constraint)
 *   - reviews 트리거가 profiles 평균 별점 갱신
 */

import { useState } from "react"
import {
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
import { useAuth } from "@/lib/auth-context"
import { gwangjangFetch } from "@/lib/supabase"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"

const STAR_LABELS = {
  response_speed: "응답 속도",
  accuracy: "정보 정확성",
  kindness: "친절도",
} as const

type StarKey = keyof typeof STAR_LABELS

export default function WriteReviewScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{
    reviewed_user_id?: string
    source_type?: string
    source_id?: string
    target_name?: string
  }>()

  const [scores, setScores] = useState<Record<StarKey, number>>({
    response_speed: 0,
    accuracy: 0,
    kindness: 0,
  })
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function setStar(key: StarKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (submitting) return
    if (!user) {
      Alert.alert("로그인 필요")
      return
    }
    if (!params.reviewed_user_id || !params.source_type || !params.source_id) {
      Alert.alert("정보 부족", "거래 정보가 누락되었습니다. 거래 페이지에서 다시 진입해주세요.")
      return
    }
    if (scores.response_speed < 1 || scores.accuracy < 1 || scores.kindness < 1) {
      Alert.alert("별점 선택", "모든 항목의 별점을 선택해주세요")
      return
    }
    setSubmitting(true)
    try {
      const res = await gwangjangFetch("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          reviewed_user_id: params.reviewed_user_id,
          source_type: params.source_type,
          source_id: params.source_id,
          response_speed: scores.response_speed,
          accuracy: scores.accuracy,
          kindness: scores.kindness,
          content: content.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert("등록 실패", j?.error || "후기 등록에 실패했습니다")
        return
      }
      Alert.alert("등록 완료", "후기가 등록되었습니다", [
        { text: "확인", onPress: () => router.back() },
      ])
    } finally {
      setSubmitting(false)
    }
  }

  const targetName = params.target_name || "거래 상대"

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="후기 작성" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.targetCard}>
            <Ionicons name="person-circle-outline" size={24} color={lightColors.ink500} />
            <View style={{ flex: 1 }}>
              <Text style={styles.targetLabel}>후기 대상</Text>
              <Text style={styles.targetName}>{targetName}</Text>
            </View>
          </View>

          {(Object.keys(STAR_LABELS) as StarKey[]).map((key) => (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionLabel}>{STAR_LABELS[key]}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStar(key, s)}
                    hitSlop={6}
                    style={styles.starBtn}
                  >
                    <Ionicons
                      name={s <= scores[key] ? "star" : "star-outline"}
                      size={32}
                      color={s <= scores[key] ? "#fbbf24" : lightColors.ink300}
                    />
                  </Pressable>
                ))}
                <Text style={styles.scoreText}>{scores[key]} / 5</Text>
              </View>
            </View>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>한줄 후기 (선택)</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="거래 경험을 자유롭게 적어주세요 (500자 이내)"
              placeholderTextColor={lightColors.ink500}
              style={styles.contentInput}
              multiline
              maxLength={500}
            />
            <Text style={styles.charCount}>{content.length} / 500</Text>
          </View>

          <View style={styles.info}>
            <Ionicons name="information-circle-outline" size={16} color={lightColors.ink500} />
            <Text style={styles.infoText}>
              총 별점은 위 3가지 항목의 평균으로 자동 계산됩니다.{"\n"}
              동일 거래에는 한 번만 후기를 남길 수 있습니다.
            </Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              (submitting || pressed) && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? "등록 중..." : "후기 등록"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  body: { padding: spacing[4], gap: spacing[4] },
  targetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing[3],
    backgroundColor: lightColors.muted,
    borderRadius: radius.md,
  },
  targetLabel: { fontSize: fontSize.xs, color: lightColors.ink500 },
  targetName: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginTop: 2,
  },
  section: { gap: spacing[2] },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  starBtn: { padding: 4 },
  scoreText: {
    marginLeft: 8,
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  contentInput: {
    backgroundColor: lightColors.muted,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    minHeight: 120,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    alignSelf: "flex-end",
  },
  info: {
    flexDirection: "row",
    gap: 6,
    padding: spacing[3],
    backgroundColor: "#eff6ff",
    borderRadius: radius.md,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: "#1e40af",
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: lightColors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
})
