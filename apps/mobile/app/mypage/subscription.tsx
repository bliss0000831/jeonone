/**
 * 내 구독 — 광장 web /mypage/subscription 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더: ← 내 구독 (Crown 아이콘)
 *   - 6개월 무료 운영 기간 안내 (emerald callout)
 *   - 현재 구독 상태 카드 (있을 때)
 *   - 사용 가능 플랜 그리드 (얼리버드 할인 표시)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  calculateChargeAmount,
  createSubscription,
  getCurrentSubscription,
  isFeatureEnabled,
  listActivePlans,
  type Subscription,
  type SubscriptionPlan,
} from "@gwangjang/features/billing"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"


const STATUS_LABEL: Record<Subscription["status"], string> = {
  free_period: "무료 기간",
  active: "활성",
  pending: "결제 대기",
  past_due: "결제 필요",
  canceled: "취소됨",
  expired: "만료",
}

export default function SubscriptionScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [current, setCurrent] = useState<Subscription | null>(null)
  const [monetizationOn, setMonetizationOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [pp, cur, mon] = await Promise.all([
          listActivePlans(supabase),
          getCurrentSubscription(supabase, user.id, DEFAULT_PLAZA),
          isFeatureEnabled(supabase, "monetization.subscriptions"),
        ])
        if (cancelled) return
        setPlans(pp)
        setCurrent(cur)
        setMonetizationOn(mon)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSubscribe(plan: SubscriptionPlan) {
    if (!user) return
    if (current?.plan_id === plan.id) return
    if (monetizationOn) {
      Alert.alert(
        "결제 안내",
        "결제 페이지로 이동합니다. 광장 web 에서 카드 등록을 마쳐주세요.",
      )
      return
    }
    setSubscribing(plan.id)
    try {
      const sub = await createSubscription(getSupabase(), {
        userId: user.id,
        plazaId: DEFAULT_PLAZA,
        planId: plan.id,
        freePeriod: true,
      })
      setCurrent(sub)
      Alert.alert("완료", `${plan.name} 무료 가입이 완료되었습니다`)
    } catch (e: any) {
      Alert.alert("실패", e?.message || "다시 시도해주세요")
    } finally {
      setSubscribing(null)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>내 구독</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <View style={styles.heroRow}>
          <Ionicons name="ribbon" size={24} color="#f59e0b" />
          <Text style={styles.heroTitle}>내 구독</Text>
        </View>
        <Text style={styles.heroSub}>
          공인중개사 / 서비스 업종 가입자를 위한 월정액 구독 정보입니다.
        </Text>

        {/* 무료 운영 기간 */}
        {!monetizationOn && (
          <View style={styles.freeCallout}>
            <Ionicons name="sparkles" size={18} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={styles.freeTitle}>6개월 무료 운영 기간 진행 중</Text>
              <Text style={styles.freeBody}>
                현재 모든 카테고리가 무료입니다. 지금 가입하시면 추후 유료 전환 시{" "}
                <Text style={{ fontWeight: "700" }}>평생 50% 할인 (얼리버드 락인)</Text> 적용됩니다.
              </Text>
            </View>
          </View>
        )}

        {/* 현재 구독 */}
        {current && (
          <View style={styles.currentCard}>
            <View style={styles.currentTop}>
              <Text style={styles.currentTitle}>현재 구독</Text>
              <View
                style={[
                  styles.statusBadge,
                  current.status === "free_period" && {
                    backgroundColor: "rgba(16,185,129,0.15)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    current.status === "free_period" && { color: "#059669" },
                  ]}
                >
                  {STATUS_LABEL[current.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.muted}>플랜: {plans.find((p) => p.id === current.plan_id)?.name ?? "구독 플랜"}</Text>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color={lightColors.ink500} />
              <Text style={styles.muted}>
                {new Date(current.current_period_start).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(current.current_period_end).toLocaleDateString("ko-KR")}
              </Text>
            </View>
            {current.is_early_bird && (
              <View style={styles.earlyBird}>
                <Ionicons name="sparkles" size={11} color="#b45309" />
                <Text style={styles.earlyBirdText}>
                  얼리버드 — 평생 {current.applied_discount_pct}% 할인
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 플랜 목록 */}
        <Text style={styles.sectionTitle}>사용 가능한 플랜</Text>
        <View style={{ gap: 12 }}>
          {plans.map((plan) => {
            const charge = calculateChargeAmount(plan, true)
            const isCurrent = current?.plan_id === plan.id
            return (
              <View key={plan.id} style={styles.planCard}>
                <Text style={styles.planName}>{plan.name}</Text>
                {plan.description && (
                  <Text style={styles.planDesc}>{plan.description}</Text>
                )}
                <View style={{ marginTop: 12 }}>
                  {plan.monthly_price === 0 ? (
                    <Text style={styles.planPrice}>무료</Text>
                  ) : (
                    <>
                      <Text style={styles.planPrice}>
                        {charge.net.toLocaleString()}
                        <Text style={styles.planUnit}> 원/월</Text>
                      </Text>
                      {!monetizationOn && charge.discount > 0 && (
                        <Text style={styles.planOldPrice}>
                          정상가 {plan.monthly_price.toLocaleString()}원
                        </Text>
                      )}
                      {!monetizationOn && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <Ionicons name="sparkles" size={11} color="#059669" />
                          <Text style={styles.earlyBirdLabel}>
                            얼리버드 평생 {plan.early_bird_discount_pct}% 할인
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
                <Pressable
                  onPress={() => handleSubscribe(plan)}
                  disabled={isCurrent || subscribing != null}
                  style={({ pressed }) => [
                    styles.subscribeBtn,
                    isCurrent && styles.subscribeBtnDisabled,
                    pressed && !isCurrent && { opacity: 0.85 },
                  ]}
                >
                  {subscribing === plan.id ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text
                      style={[
                        styles.subscribeText,
                        isCurrent && { color: lightColors.ink500 },
                      ]}
                    >
                      {isCurrent ? "현재 플랜" : monetizationOn ? "구독 시작" : "무료 가입"}
                    </Text>
                  )}
                </Pressable>
              </View>
            )
          })}
        </View>

        {!monetizationOn && (
          <View style={styles.infoCard}>
            <Ionicons name="alert-circle-outline" size={18} color={lightColors.ink500} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>결제는 언제 시작되나요?</Text>
              <Text style={styles.infoBody}>
                6개월 무료 운영 기간 종료 후 결제가 시작됩니다. 그 전까지는 모든 기능을 무료로 사용하실 수 있습니다.
              </Text>
              <Text style={styles.infoBody}>
                무료 기간 중 가입하신 분은 유료 전환 시 <Text style={{ fontWeight: "700" }}>평생 50% 할인</Text> 이 자동 적용됩니다.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  heroSub: {
    fontSize: 13,
    color: lightColors.ink500,
    marginBottom: spacing[5],
  },
  freeCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "rgba(16,185,129,0.2)",
    backgroundColor: "rgba(16,185,129,0.05)",
    marginBottom: spacing[4],
  },
  freeTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: "#065f46",
    marginBottom: 4,
  },
  freeBody: {
    fontSize: 13,
    lineHeight: 18,
    color: "#047857",
  },
  currentCard: {
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    marginBottom: spacing[5],
  },
  currentTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  currentTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: lightColors.muted,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  muted: {
    fontSize: 12,
    color: lightColors.ink500,
    marginTop: 4,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  earlyBird: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(245,158,11,0.15)",
    marginTop: 12,
  },
  earlyBirdText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b45309",
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[3],
  },
  planCard: {
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  planName: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 2,
  },
  planDesc: {
    fontSize: 11,
    color: lightColors.ink500,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  planUnit: {
    fontSize: fontSize.sm,
    fontWeight: "400",
    color: lightColors.ink500,
  },
  planOldPrice: {
    fontSize: 11,
    color: lightColors.ink500,
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  earlyBirdLabel: {
    fontSize: 11,
    color: "#059669",
  },
  subscribeBtn: {
    height: 40,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[3],
  },
  subscribeBtnDisabled: {
    backgroundColor: lightColors.muted,
  },
  subscribeText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: "#ffffff",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "rgba(241,245,249,0.4)",
    marginTop: spacing[5],
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 6,
  },
  infoBody: {
    fontSize: 12,
    lineHeight: 18,
    color: lightColors.ink500,
    marginBottom: 4,
  },
})
