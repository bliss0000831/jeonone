/**
 * 광장 추가 가입 — 카카오로 이미 로그인된 사용자가 새 광장에 가입할 때.
 *
 * 흐름:
 *   카카오 OAuth callback → plaza_profiles 미존재 → 이 화면으로 redirect
 *   (?provider=kakao&prefill=<JSON encoded user metadata>)
 *
 *   여기서 광장별 닉네임 + 시/군 선택 → plaza_profiles INSERT → /(tabs)
 *
 * 🅲 광장 완전 격리 정책: 같은 카카오 계정도 광장마다 따로 가입 필요.
 */

import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
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
import { useCurrentPlazaState } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"
import { listPlazaRegions, type Region } from "@/lib/region-utils"

interface KakaoPrefill {
  nickname?: string
  full_name?: string
  avatar_url?: string
  email?: string
}

export default function PlazaSignupScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ provider?: string; prefill?: string }>()
  const plaza = useCurrentPlazaState()
  const { user, loading: authLoading } = useAuth()

  const prefill: KakaoPrefill = useMemo(() => {
    try {
      if (!params.prefill) return {}
      return JSON.parse(decodeURIComponent(params.prefill))
    } catch {
      return {}
    }
  }, [params.prefill])

  const [fullName, setFullName] = useState(prefill.full_name || "")
  // 🅲 새 광장 가입은 깨끗하게 시작 — 닉네임/아바타 자동 prefill 안 함
  const [nickname, setNickname] = useState("")
  const [regions, setRegions] = useState<Region[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!plaza.id) return
    let alive = true
    ;(async () => {
      const list = await listPlazaRegions(plaza.id)
      if (!alive) return
      setRegions(list)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [plaza.id])

  // 비로그인 상태로 진입했으면 로그인 페이지로
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/login" as any)
    }
  }, [authLoading, user, router])

  // 이미 이 광장에 plaza_profiles 있으면 폼 스킵하고 바로 tabs (방어 — 라우팅 race / 중복 진입 케이스)
  useEffect(() => {
    if (!user?.id || !plaza.id) return
    let alive = true
    ;(async () => {
      const supabase = getSupabase()
      const { data: pp } = await supabase
        .from("plaza_profiles")
        .select("plaza_id")
        .eq("user_id", user.id)
        .eq("plaza_id", plaza.id)
        .maybeSingle()
      if (alive && pp) {
        router.replace("/(tabs)")
      }
    })()
    return () => {
      alive = false
    }
  }, [user?.id, plaza.id, router])

  async function handleSubmit() {
    if (submitting) return
    if (!user?.id) {
      Alert.alert("로그인 필요", "다시 로그인 후 시도해주세요.")
      return
    }
    if (!fullName.trim()) {
      Alert.alert("입력 필요", "이름을 입력해주세요")
      return
    }
    if (!nickname.trim()) {
      Alert.alert("입력 필요", "닉네임을 입력해주세요")
      return
    }
    if (!selectedRegion) {
      Alert.alert("선택 필요", "거주 시/군을 선택해주세요")
      return
    }
    const region = regions.find((r) => r.id === selectedRegion)
    if (!region) return

    setSubmitting(true)
    try {
      const supabase = getSupabase()
      // 1) global profiles 에 full_name (이름) 저장 — 인증·실명 용도
      await supabase
        .from("profiles")
        .upsert(
          { id: user.id, full_name: fullName.trim(), nickname: nickname.trim() },
          { onConflict: "id" },
        )
      // 2) plaza_profiles 행 UPSERT (광장별 정체성)
      const province =
        plaza.id === "chuncheon" || plaza.id === "gangneung"
          ? "강원특별자치도"
          : ""
      const location = `${province ? province + " " : ""}${region.name}`.trim()
      // 🅲 깨끗한 plaza 시작 — avatar/account_type 등 자동 carry 안 함
      // 사용자가 마이페이지에서 명시적으로 설정해야 함
      const { error } = await supabase.from("plaza_profiles").upsert(
        {
          user_id: user.id,
          plaza_id: plaza.id,
          nickname: nickname.trim(),
          avatar_url: null,            // 비어 있게 시작 (춘천 아바타 carry X)
          background_url: null,
          bio: null,
          account_type: "user",        // 기본 일반 (전문가 자격은 광장별 재신청)
          location,
          region_id: region.id,
          is_active: true,
        },
        { onConflict: "user_id,plaza_id" },
      )
      if (error) {
        // 컬럼 누락(마이그레이션 미적용) 케이스 → 기본 컬럼만으로 재시도
        if (/avatar_url|location|region_id/i.test(error.message || "")) {
          const retry = await supabase.from("plaza_profiles").upsert(
            {
              user_id: user.id,
              plaza_id: plaza.id,
              nickname: nickname.trim(),
              is_active: true,
            },
            { onConflict: "user_id,plaza_id" },
          )
          if (retry.error) {
            Alert.alert("가입 실패", retry.error.message)
            return
          }
        } else {
          Alert.alert("가입 실패", error.message)
          return
        }
      }
      router.replace("/(tabs)")
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
        <Text style={styles.headerTitle}>{plaza.name || "전원일기"} 가입</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing[5] }}>
        <View style={styles.info}>
          <Ionicons name="information-circle" size={20} color={lightColors.primary} />
          <Text style={styles.infoText}>
            {params.provider === "kakao" ? "카카오 계정" : "계정"}으로 인증되었어요.{"\n"}
            <Text style={{ fontWeight: "700" }}>{plaza.name || "이 전원일기"}</Text> 는 별도
            가입이 필요해요. 여기서 사용할 닉네임과 거주 시/군을 입력해주세요.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>이름 *</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="홍길동"
            placeholderTextColor={lightColors.ink500}
            maxLength={20}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>이메일</Text>
          <Text style={styles.readonly}>{prefill.email || user?.email || "—"}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>닉네임 *</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="전원일기에서 사용할 닉네임"
            placeholderTextColor={lightColors.ink500}
            maxLength={10}
            style={styles.input}
          />
          <Text style={styles.helper}>한글·영문·숫자 (최대 10자)</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>거주 시/군 *</Text>
          {loading ? (
            <ActivityIndicator color={lightColors.primary} />
          ) : (
            <View style={styles.chips}>
              {regions.map((r) => {
                const on = selectedRegion === r.id
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelectedRegion(r.id)}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                      {r.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitBtn,
            submitting && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{plaza.name || "전원일기"} 가입 완료</Text>
          )}
        </Pressable>

        <Pressable
          onPress={async () => {
            const supabase = getSupabase()
            await supabase.auth.signOut()
            router.replace("/auth/login" as any)
          }}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>다른 계정으로 로그인</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  info: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: spacing[4],
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    marginBottom: spacing[5],
  },
  infoText: { flex: 1, fontSize: fontSize.sm, color: lightColors.ink900, lineHeight: 20 },
  field: { marginBottom: spacing[4] },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 6,
  },
  helper: { fontSize: 11, color: lightColors.ink500, marginTop: 4 },
  readonly: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    paddingVertical: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipOn: { backgroundColor: lightColors.primary, borderColor: lightColors.primary },
  chipOff: { backgroundColor: "#ffffff", borderColor: lightColors.border },
  chipText: { fontSize: fontSize.md, fontWeight: "600", color: lightColors.ink900 },
  chipTextOn: { color: "#ffffff" },
  submitBtn: {
    backgroundColor: lightColors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing[4],
  },
  submitText: { color: "#ffffff", fontSize: fontSize.md, fontWeight: "700" },
  linkBtn: { alignItems: "center", padding: spacing[4] },
  linkText: { fontSize: fontSize.sm, color: lightColors.ink500 },
})
