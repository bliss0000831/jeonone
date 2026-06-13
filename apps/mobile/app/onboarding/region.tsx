/**
 * 가입 직후 region(시/군) 강제 선택 화면 — 모달 스타일 팝업.
 *
 * - Kakao OAuth 가입자는 가입 단계에서 region 을 선택하지 않으므로,
 *   첫 로그인 후 profile.location 이 비어있으면 이 화면으로 강제 진입.
 * - 선택 후 profiles.location = "<plaza_label> <region_name>" 형태로 저장
 *   → 기존 parseRegionFromAddress 가 그대로 매칭.
 */

import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"
import { listPlazaRegions, type Region } from "@/lib/region-utils"

export default function OnboardingRegionScreen() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const plaza = useCurrentPlaza()
  const [regions, setRegions] = useState<Region[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 비로그인 상태에서 이 화면이 열려있으면 모달 자체를 닫음
  // (이전 로그인 시도 중단/세션 만료 후 라우팅 잔재 케이스)
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/(tabs)")
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (!plaza) return
    let alive = true
    ;(async () => {
      try {
        const list = await listPlazaRegions(plaza)
        if (!alive) return
        setRegions(list)
      } catch (e) {
        console.warn("[onboarding] region load failed", e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [plaza])

  const retry = async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const list = await listPlazaRegions(plaza)
      setRegions(list)
    } catch (e) {
      console.warn("[onboarding] region load retry failed", e)
    } finally {
      setLoading(false)
    }
  }

  const plazaLabel = useMemo(() => {
    if (plaza === "chuncheon") return "강원특별자치도 춘천시"
    if (plaza === "gangneung") return "강원특별자치도 강릉시"
    return ""
  }, [plaza])

  async function handleSubmit() {
    if (submitting) return
    if (!user?.id) {
      Alert.alert("로그인 필요", "다시 로그인 후 시도해주세요.")
      return
    }
    if (!selected) {
      Alert.alert("선택 필요", "시/군을 먼저 선택해주세요.")
      return
    }
    const region = regions.find((r) => r.id === selected)
    if (!region) {
      Alert.alert("오류", "선택한 지역을 찾을 수 없어요.")
      return
    }
    setSubmitting(true)
    try {
      const supabase = getSupabase()
      const location = `${plazaLabel ? plazaLabel + " " : ""}${region.name}`.trim()
      const { error } = await supabase
        .from("profiles")
        .update({ location })
        .eq("id", user.id)
      if (error) {
        Alert.alert("저장 실패", error.message)
        return
      }
      if (plaza) {
        try {
          const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default
          await AsyncStorage.removeItem(`region.selected.v1:${plaza}`)
        } catch {
          /* noop */
        }
      }
      router.replace("/(tabs)")
    } catch (e: any) {
      Alert.alert("오류", e?.message || "다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={28} color="#fff" />
        </View>

        <Text style={styles.title}>지역을 선택해주세요</Text>
        <Text style={styles.subtitle}>
          전원일기에서 글을 보고 쓰려면 활동 지역(시/군)이 필요해요.{"\n"}
          마이페이지에서 언제든 변경할 수 있어요.
        </Text>

        {loading ? (
          <View style={{ paddingVertical: spacing[6] }}>
            <ActivityIndicator color={lightColors.primary} />
          </View>
        ) : regions.length === 0 ? (
          <View style={{ paddingVertical: spacing[6], alignItems: "center", gap: spacing[3] }}>
            <Text style={styles.subtitle}>
              지역 목록을 불러오지 못했어요.{"\n"}네트워크 상태를 확인해 주세요.
            </Text>
            <Pressable onPress={retry} style={styles.retryBtn} hitSlop={8}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={8}>
              <Text style={styles.skipText}>나중에 하기</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.grid}>
              {regions.map((r) => {
                const on = selected === r.id
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelected(r.id)}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  >
                    <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                      {r.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </ScrollView>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting || !selected}
          style={({ pressed }) => [
            styles.submitBtn,
            (!selected || submitting) && { opacity: 0.4 },
            pressed && { opacity: 0.8 },
          ]}
          hitSlop={8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>완료</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[4],
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[4],
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: lightColors.ink900,
    textAlign: "center",
  },
  subtitle: {
    marginTop: spacing[2],
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    lineHeight: 20,
    textAlign: "center",
  },
  scroll: {
    marginTop: spacing[5],
    marginBottom: spacing[5],
  },
  scrollContent: {
    paddingBottom: spacing[2],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipOn: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  chipOff: {
    backgroundColor: "#ffffff",
    borderColor: lightColors.border,
  },
  chipText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  chipTextOn: { color: "#ffffff" },
  submitBtn: {
    backgroundColor: lightColors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  submitText: {
    color: "#ffffff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: lightColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: radius.md,
    minHeight: 44,
  },
  retryText: {
    color: "#ffffff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  skipText: {
    color: lightColors.ink500,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textDecorationLine: "underline",
    paddingVertical: 6,
  },
})
