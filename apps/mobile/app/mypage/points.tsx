/**
 * 내 포인트 — 광장 web /mypage/points 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더: ← 마이페이지 + ⓘ 포인트 안내 (오른쪽)
 *   - amber 그라디언트 잔액 카드: 사용 가능 포인트 + (대기 / 누적 적립 / 신뢰도)
 *   - 거래 내역: 위/아래 화살표 아이콘 (emerald/rose), source 라벨,
 *     status 뱃지 (대기/회수), amount 부호+색
 *   - "더 보기" 페이지네이션 (cursor 기반)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"

interface Tx {
  id: string
  type: "earn" | "spend" | "revert" | "expire" | "manual_adjust" | "penalty" | "event"
  amount: number
  source: string
  source_id: string | null
  status: "pending" | "confirmed" | "reverted"
  reverted_reason: string | null
  created_at: string
}

interface Balance {
  available: number
  pending: number
  lifetime_earned: number
  lifetime_spent: number
  reputation_score: number
}

const SOURCE_LABEL: Record<string, string> = {
  "post.create": "게시글 작성",
  "comment.create": "댓글 작성",
  "secondhand.create": "농기구/자재 등록",
  "sharing.create": "나눔 등록",
  "local_food.create": "로컬푸드 등록",
  "jobs.create": "일손 등록",
  "like.received": "좋아요 받음",
  "signup.bonus": "가입 보너스",
  "daily.login": "일일 출석",
  "local_food.purchase": "로컬푸드 결제",
  "boost.purchase": "부스트 결제",
  "event.purchase": "이벤트 응모",
  "giftcard.purchase": "기프티콘 교환",
}

function sourceLabel(s: string): string {
  return SOURCE_LABEL[s] ?? s
}

function txSign(t: Tx): { sign: string; color: string } {
  if (t.type === "earn" || t.type === "manual_adjust" || t.type === "event") {
    return { sign: "+", color: "#059669" }
  }
  if (t.type === "spend") return { sign: "-", color: "#e11d48" }
  return { sign: "−", color: lightColors.ink500 }
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}일 전`
  return d.toLocaleDateString("ko-KR")
}

const PAGE_SIZE = 30

export default function PointsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [items, setItems] = useState<Tx[]>([])
  const [cursor, setCursor] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setError("로그인이 필요합니다")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        // 광장 격리 해제 — 통합 잔액 (PK = user_id, 단일 row)
        const [balRes, txRes] = await Promise.all([
          supabase
            .from("user_points")
            .select("available, pending, lifetime_earned, lifetime_spent, reputation_score")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("point_transactions")
            .select(
              "id, type, amount, source, source_id, status, reverted_reason, created_at",
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(0, PAGE_SIZE - 1),
        ])

        if (cancelled) return
        const bal = balRes.data
        setBalance(
          (bal as Balance) ?? {
            available: 0,
            pending: 0,
            lifetime_earned: 0,
            lifetime_spent: 0,
            reputation_score: 100,
          },
        )

        const { data: txs, error: txErr } = txRes
        if (cancelled) return
        if (!txErr) {
          setItems((txs ?? []) as Tx[])
          setCursor((txs?.length ?? 0) < PAGE_SIZE ? null : PAGE_SIZE)
        } else {
          // RLS 차단 시 — 빈 리스트, balance 만 표시
          setItems([])
          setCursor(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "로드 실패")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  async function loadMore() {
    if (cursor == null || loadingMore || !user) return
    setLoadingMore(true)
    try {
      const supabase = getSupabase()
      const { data: txs } = await supabase
        .from("point_transactions")
        .select("id, type, amount, source, source_id, status, reverted_reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(cursor, cursor + PAGE_SIZE - 1)
      setItems((prev) => [...prev, ...((txs ?? []) as Tx[])])
      setCursor((txs?.length ?? 0) < PAGE_SIZE ? null : cursor + PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
          <Text style={styles.headerTitle}>내 포인트</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          {error === "로그인이 필요합니다" && (
            <Pressable
              onPress={() => router.replace("/auth/login")}
              style={styles.errorBtn}
            >
              <Text style={styles.errorBtnText}>로그인하기</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>내 포인트</Text>
        <Pressable
          onPress={() => router.push("/support/points-guide")}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Ionicons name="information-circle-outline" size={20} color={lightColors.ink500} />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing[4] }}
        ListHeaderComponent={
          <>
            {/* 잔액 카드 */}
            <LinearGradient
              colors={["#fbbf24", "#f59e0b"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.balanceTop}>
                <View>
                  <Text style={styles.balanceLabel}>사용 가능 포인트</Text>
                  <View style={styles.balanceValueRow}>
                    <Text style={styles.balanceValue}>
                      {(balance?.available ?? 0).toLocaleString()}
                    </Text>
                    <Text style={styles.balanceUnit}>P</Text>
                  </View>
                </View>
                <View style={styles.coin}>
                  <Text style={styles.coinText}>P</Text>
                </View>
              </View>
              {balance &&
                (balance.pending > 0 || balance.lifetime_earned > 0) && (
                  <View style={styles.balanceGrid}>
                    <BalanceCell
                      label="대기"
                      value={`${balance.pending.toLocaleString()}P`}
                    />
                    <BalanceCell
                      label="누적 적립"
                      value={`${balance.lifetime_earned.toLocaleString()}P`}
                    />
                    <BalanceCell
                      label="신뢰도"
                      value={`${balance.reputation_score}`}
                    />
                  </View>
                )}
            </LinearGradient>

            <Text style={styles.sectionTitle}>거래 내역</Text>
          </>
        }
        renderItem={({ item }) => <TxRow t={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyMain}>아직 거래 내역이 없어요</Text>
            <Text style={styles.emptySub}>글을 작성하면 포인트가 적립됩니다</Text>
          </View>
        }
        ListFooterComponent={
          cursor != null ? (
            <Pressable
              onPress={loadMore}
              disabled={loadingMore}
              style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={lightColors.ink500} />
              ) : (
                <Text style={styles.loadMoreText}>더 보기</Text>
              )}
            </Pressable>
          ) : null
        }
        // 거래 내역 카드 스타일을 위해 list 자체를 카드 안에 넣기보다 행마다 적용
      
        removeClippedSubviews={true}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={11}
      />
    </SafeAreaView>
  )
}

function BalanceCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.balanceCell}>
      <Text style={styles.balanceCellLabel}>{label}</Text>
      <Text style={styles.balanceCellValue}>{value}</Text>
    </View>
  )
}

function TxRow({ t }: { t: Tx }) {
  const { sign, color } = txSign(t)
  const isSpend = t.type === "spend"
  return (
    <View style={styles.txRow}>
      <View
        style={[
          styles.txIcon,
          {
            backgroundColor: isSpend
              ? "rgba(244,63,94,0.1)"
              : "rgba(16,185,129,0.1)",
          },
        ]}
      >
        <Ionicons
          name={isSpend ? "arrow-down" : "arrow-up"}
          size={16}
          color={isSpend ? "#e11d48" : "#059669"}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.txTop}>
          <Text style={styles.txSource} numberOfLines={1}>
            {sourceLabel(t.source)}
          </Text>
          {t.status === "pending" && (
            <View style={[styles.statusBadge, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
              <Ionicons name="time-outline" size={10} color="#b45309" />
              <Text style={[styles.statusText, { color: "#b45309" }]}>대기</Text>
            </View>
          )}
          {t.status === "reverted" && (
            <View style={[styles.statusBadge, { backgroundColor: "rgba(244,63,94,0.15)" }]}>
              <Ionicons name="alert-circle-outline" size={10} color="#e11d48" />
              <Text style={[styles.statusText, { color: "#e11d48" }]}>회수</Text>
            </View>
          )}
        </View>
        <Text style={styles.txTime}>
          {formatTimeAgo(t.created_at)}
          {t.reverted_reason ? ` · 사유: ${t.reverted_reason}` : ""}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color }]}>
        {sign}
        {t.amount.toLocaleString()}P
      </Text>
    </View>
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
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },

  // 잔액 카드
  balanceCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: spacing[4],
    shadowColor: "#f59e0b",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  balanceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    fontSize: 11,
    color: "#ffffff",
    opacity: 0.85,
    marginBottom: 4,
  },
  balanceValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  balanceValue: {
    fontSize: 30,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  balanceUnit: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
    opacity: 0.85,
    marginBottom: 4,
  },
  coin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  coinText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  balanceGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  balanceCell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  balanceCellLabel: {
    fontSize: 11,
    color: "#ffffff",
    opacity: 0.7,
  },
  balanceCellValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 2,
  },

  // 거래 내역
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    backgroundColor: lightColors.background,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  txSource: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  txTime: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  sep: {
    height: 1,
    backgroundColor: lightColors.border,
    marginLeft: spacing[3] + 36 + spacing[3],
  },

  empty: {
    paddingVertical: 60,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  emptyMain: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  emptySub: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 6,
  },

  loadMore: {
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginBottom: 16,
  },
  errorBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: lightColors.primary,
  },
  errorBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
})
