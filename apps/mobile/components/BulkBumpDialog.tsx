/**
 * BulkBumpDialog — 일괄 올리기 모달.
 *
 * 자원별 사용 개수를 직접 입력. ↑↓ 로 우선순위 변경 시 자동 재분배.
 * 사용자가 직접 입력하면 그 값 유지 (수동 모드).
 *
 * 처리 흐름:
 *   1. 각 게시글마다 우선순위 순서로 사용자가 지정한 quota 만큼 자원 시도
 *   2. quota 소진되거나 자원 부족이면 다음 우선순위로 fallback
 *   3. 모두 실패면 unprocessable
 *   4. bump_atomic 호출 (1초 간격)
 */

import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { getCachedPlaza } from "@/lib/plaza"

type Resource = "free" | "ticket" | "points"

export interface BulkBumpPost {
  id: string
  kind: string
  targetType: string
  title: string
}

interface CategorySetting {
  freePerDay: number
  freeUsed: number
  pointsCost: number
}

interface Props {
  visible: boolean
  onClose: () => void
  posts: BulkBumpPost[]
  onCompleted?: () => void
}

const RESOURCE_LABEL: Record<Resource, string> = {
  free: "무료 잔여",
  ticket: "올리기권",
  points: "포인트",
}
const RESOURCE_ICON: Record<Resource, any> = {
  free: "arrow-up",
  ticket: "ticket-outline",
  points: "sparkles-outline",
}

export function BulkBumpDialog({ visible, onClose, posts, onCompleted }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 자원 잔여
  const [ticketBalance, setTicketBalance] = useState(0)
  const [pointBalance, setPointBalance] = useState(0)
  const [perCategory, setPerCategory] = useState<Record<string, CategorySetting>>({})

  // 우선순위 (드래그 대신 ↑↓)
  const [order, setOrder] = useState<Resource[]>(["free", "ticket", "points"])
  // 자원별 사용 개수 (사용자가 직접 입력)
  const [counts, setCounts] = useState<Record<Resource, number>>({
    free: 0,
    ticket: 0,
    points: 0,
  })
  // 사용자가 수동으로 손댄 자원 — 자동 분배 시 보존
  const [manuallyEdited, setManuallyEdited] = useState<Set<Resource>>(new Set())

  // 처리 상태
  const [bumping, setBumping] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{
    ok: number
    failures: Array<{ title: string; reason: string }>
  } | null>(null)

  // 모달 열릴 때 status fetch
  useEffect(() => {
    if (!visible) return
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      setResult(null)
      setProgress({ done: 0, total: 0 })
      setManuallyEdited(new Set())
      try {
        const supabase = getSupabase()
        if (!user?.id) {
          if (alive) setError("로그인이 필요합니다")
          return
        }
        const plaza = getCachedPlaza().id
        if (!plaza) {
          if (alive) setError("광장 정보가 없습니다")
          return
        }

        const uniqueTargets = Array.from(new Set(posts.map((p) => p.targetType)))
        const todayStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date())

        const next: Record<string, CategorySetting> = {}
        // 🆕 전체 도메인 합산 (사용자 단위 통합 일일 무료 2개)
        const GLOBAL_FREE_PER_DAY = 2
        const { data: dailyAll } = await supabase
          .from("bump_daily")
          .select("free_used")
          .eq("user_id", user.id)
          .eq("plaza_id", plaza)
          .eq("date", todayStr)
        const totalFreeUsed = (dailyAll ?? []).reduce(
          (sum, r: any) => sum + (r.free_used ?? 0),
          0,
        )
        // 카테고리별 settings 의 points_cost 만 필요 — freePerDay 는 global 로 통합
        await Promise.all(
          uniqueTargets.map(async (t) => {
            const { data: settingRes } = await supabase
              .from("bump_settings")
              .select("points_cost")
              .eq("target_type", t)
              .eq("enabled", true)
              .maybeSingle()
            // 모든 카테고리에 동일 global limit/used 적용 (UI 표시 일관성)
            next[t] = {
              freePerDay: GLOBAL_FREE_PER_DAY,
              freeUsed: totalFreeUsed,
              pointsCost: (settingRes as any)?.points_cost ?? 0,
            }
          }),
        )

        const [ticketRes, ptsRes] = await Promise.all([
          supabase
            .from("bump_tickets")
            .select("balance")
            .eq("user_id", user.id)
            .eq("plaza_id", plaza)
            .maybeSingle(),
          supabase
            .from("user_points")
            .select("available")
            .eq("user_id", user.id)
            .maybeSingle(),
        ])
        if (!alive) return
        setPerCategory(next)
        setTicketBalance((ticketRes.data as any)?.balance ?? 0)
        setPointBalance((ptsRes.data as any)?.available ?? 0)
      } catch (e: any) {
        if (alive) setError(e?.message || "조회 중 오류")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [visible, user?.id, posts])

  // ── 자원별 가용량 계산 ─────────────────────
  function availableOf(r: Resource): number {
    if (r === "free") {
      // 카테고리별 무료 잔여 합산 (실제 적용 시 카테고리 매칭 필요)
      return Object.values(perCategory).reduce(
        (acc, c) => acc + Math.max(0, c.freePerDay - c.freeUsed),
        0,
      )
    }
    if (r === "ticket") return ticketBalance
    if (r === "points") {
      // 평균 cost 기준 — 1포인트 이상의 비용 카테고리만 의미 있음
      const totalCost = posts.reduce(
        (acc, p) => acc + (perCategory[p.targetType]?.pointsCost ?? 0),
        0,
      )
      const avgCost = posts.length > 0 ? totalCost / posts.length : 0
      if (avgCost <= 0) return 0
      return Math.floor(pointBalance / avgCost)
    }
    return 0
  }

  // ── 우선순위 변경 시 자동 분배 (사용자가 손대지 않은 자원만) ──────
  useEffect(() => {
    if (loading || Object.keys(perCategory).length === 0) return
    setCounts((prev) => {
      const next = { ...prev }
      const target = posts.length
      // 수동 편집된 자원 합산
      const manualTotal = Array.from(manuallyEdited).reduce(
        (acc, r) => acc + (next[r] ?? 0),
        0,
      )
      let remaining = Math.max(0, target - manualTotal)
      for (const r of order) {
        if (manuallyEdited.has(r)) continue
        const avail = availableOf(r)
        const use = Math.min(remaining, avail)
        next[r] = use
        remaining -= use
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, posts.length, loading, ticketBalance, pointBalance, perCategory])

  function moveUp(idx: number) {
    if (idx <= 0) return
    setOrder((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }
  function moveDown(idx: number) {
    if (idx >= order.length - 1) return
    setOrder((prev) => {
      const next = [...prev]
      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
      return next
    })
  }
  function onChangeCount(r: Resource, text: string) {
    const n = Math.max(0, Math.min(parseInt(text || "0") || 0, availableOf(r), posts.length))
    setCounts((prev) => ({ ...prev, [r]: n }))
    setManuallyEdited((prev) => new Set(prev).add(r))
  }
  function resetAuto() {
    setManuallyEdited(new Set())
    // 자동 분배 useEffect 가 trigger 되도록 order 를 한 번 갱신 (얕은 복사)
    setOrder((o) => [...o])
  }

  // ── 시뮬레이션 ─────────────────────
  const simulation = useMemo(() => {
    const totalAllocated = counts.free + counts.ticket + counts.points
    const processable = Math.min(totalAllocated, posts.length)
    return {
      total: totalAllocated,
      processable,
      shortfall: Math.max(0, posts.length - processable),
    }
  }, [counts, posts.length])

  async function start() {
    if (!user?.id || bumping) return
    const plaza = getCachedPlaza().id
    if (!plaza) return
    setBumping(true)
    setProgress({ done: 0, total: posts.length })
    const supabase = getSupabase()

    const reasonMap: Record<string, string> = {
      no_free_quota: "무료 잔여 없음",
      no_tickets: "올리기권 없음",
      insufficient_points: "포인트 부족",
      cooldown: "쿨다운 중",
      account_too_young: "계정 가입 기간 부족",
      not_found_or_not_owner: "권한 없음",
    }

    // 사용자 지정 quota — 우선순위 순서로 소진
    const quota: Record<Resource, number> = { ...counts }

    let okCount = 0
    const failures: { title: string; reason: string }[] = []

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]
      let chosen: Resource | null = null
      for (const r of order) {
        if (quota[r] > 0) {
          // 자원 사용 가능 여부 (포인트는 잔액으로 추가 검증)
          if (r === "points") {
            const cost = perCategory[p.targetType]?.pointsCost ?? 0
            if (cost <= 0) continue
          }
          chosen = r
          break
        }
      }
      if (!chosen) {
        failures.push({ title: p.title, reason: "할당된 자원 소진" })
      } else {
        try {
          const pointsCost = perCategory[p.targetType]?.pointsCost ?? 0
          const { data, error: rpcErr } = await supabase.rpc("bump_atomic", {
            p_user_id: user.id,
            p_plaza_id: plaza,
            p_target_type: p.targetType,
            p_target_id: p.id,
            p_payment: chosen,
            p_points_cost: pointsCost,
          })
          if (rpcErr) {
            failures.push({ title: p.title, reason: rpcErr.message })
          } else if ((data as any)?.ok) {
            okCount++
            quota[chosen]--
          } else {
            const reason = (data as any)?.reason ?? "unknown"
            failures.push({
              title: p.title,
              reason: reasonMap[reason] ?? reason,
            })
          }
        } catch (e: any) {
          failures.push({ title: p.title, reason: e?.message ?? "오류" })
        }
      }
      setProgress({ done: i + 1, total: posts.length })
      if (i < posts.length - 1) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    setBumping(false)
    setResult({ ok: okCount, failures })
    onCompleted?.()
  }

  function close() {
    if (bumping) return
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="arrow-up-circle" size={20} color={lightColors.primary} />
            <Text style={styles.title}>{posts.length}개 일괄 올리기</Text>
            <Pressable
              onPress={close}
              disabled={bumping}
              hitSlop={8}
              style={{ marginLeft: "auto", opacity: bumping ? 0.4 : 1 }}
            >
              <Ionicons name="close" size={20} color={lightColors.ink500} />
            </Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 16, alignItems: "center", gap: 10 }}>
              <Ionicons name="alert-circle-outline" size={32} color="#ef4444" />
              <Text style={{ fontSize: 13, color: lightColors.ink700 }}>{error}</Text>
            </View>
          ) : result ? (
            <View style={{ gap: 10 }}>
              <View style={styles.resultRow}>
                <Ionicons
                  name={result.failures.length === 0 ? "checkmark-circle" : "alert-circle"}
                  size={22}
                  color={result.failures.length === 0 ? "#10b981" : "#f59e0b"}
                />
                <Text style={styles.resultTitle}>
                  {result.failures.length === 0
                    ? `${result.ok}개 모두 올렸어요!`
                    : `성공 ${result.ok}개 · 실패 ${result.failures.length}개`}
                </Text>
              </View>
              {result.failures.length > 0 && (
                <ScrollView style={{ maxHeight: 160 }}>
                  {result.failures.slice(0, 10).map((f, i) => (
                    <Text key={i} style={styles.failItem} numberOfLines={1}>
                      · {f.title.slice(0, 20)} — {f.reason}
                    </Text>
                  ))}
                  {result.failures.length > 10 && (
                    <Text style={styles.failItem}>
                      · 외 {result.failures.length - 10}개 …
                    </Text>
                  )}
                </ScrollView>
              )}
              <Pressable style={styles.startBtn} onPress={onClose}>
                <Text style={styles.startBtnText}>확인</Text>
              </Pressable>
            </View>
          ) : bumping ? (
            <View style={{ gap: 12, paddingVertical: 12 }}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(
                        (progress.done / Math.max(1, progress.total)) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {progress.done} / {progress.total} 처리 중...
              </Text>
              <Text style={styles.hint}>1초 간격으로 순차 처리 중입니다.</Text>
            </View>
          ) : (
            <>
              <View style={styles.subRow}>
                <Text style={styles.sub}>
                  각 자원에 사용할 개수를 입력하세요. ↑↓ 로 우선순위 조정 시 자동 분배.
                </Text>
                {manuallyEdited.size > 0 && (
                  <Pressable onPress={resetAuto} hitSlop={6}>
                    <Text style={styles.resetText}>자동 분배로 되돌리기</Text>
                  </Pressable>
                )}
              </View>

              {/* 자원 행 */}
              <View style={{ gap: 6, marginTop: 4 }}>
                {order.map((r, idx) => (
                  <ResourceRow
                    key={r}
                    resource={r}
                    index={idx}
                    isFirst={idx === 0}
                    isLast={idx === order.length - 1}
                    available={availableOf(r)}
                    count={counts[r]}
                    onChange={(t) => onChangeCount(r, t)}
                    onUp={() => moveUp(idx)}
                    onDown={() => moveDown(idx)}
                    detail={resourceDetail(r, perCategory, ticketBalance, pointBalance, posts)}
                  />
                ))}
              </View>

              {/* 합계 / 부족 표시 */}
              <View
                style={[
                  styles.summary,
                  simulation.shortfall === 0
                    ? styles.summaryOk
                    : styles.summaryWarn,
                ]}
              >
                <Ionicons
                  name={simulation.shortfall === 0 ? "checkmark-circle" : "alert-circle"}
                  size={16}
                  color={simulation.shortfall === 0 ? "#059669" : "#d97706"}
                />
                <Text style={styles.summaryText}>
                  {simulation.shortfall === 0
                    ? `${posts.length}개 모두 처리 가능`
                    : `${simulation.processable}개 처리 · ${simulation.shortfall}개 부족`}
                </Text>
              </View>

              {/* 시작 버튼 */}
              <Pressable
                onPress={start}
                disabled={simulation.processable === 0}
                style={[
                  styles.startBtn,
                  simulation.processable === 0 && styles.startBtnDisabled,
                ]}
              >
                <Ionicons name="arrow-up" size={16} color="#ffffff" />
                <Text style={styles.startBtnText}>
                  {simulation.processable > 0
                    ? `${simulation.processable}개 일괄 올리기 시작`
                    : "사용할 개수를 입력하세요"}
                </Text>
              </Pressable>

              {/* 올리기권 충전하기 */}
              <Pressable
                onPress={() => {
                  onClose()
                  setTimeout(() => router.push("/bump-tickets" as any), 100)
                }}
                style={{ alignItems: "center", paddingTop: 8 }}
              >
                <Text style={{ fontSize: 12, color: lightColors.ink500 }}>
                  🎫 올리기권 충전하기 →
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function resourceDetail(
  r: Resource,
  perCategory: Record<string, CategorySetting>,
  tickets: number,
  points: number,
  posts: BulkBumpPost[],
): string {
  if (r === "free") {
    // 🆕 전체 통합 무료 잔여 — 모든 카테고리에 동일 값 (이미 GLOBAL_FREE_PER_DAY/totalFreeUsed 로 채워짐)
    const first = Object.values(perCategory)[0]
    const totalAvail = first ? Math.max(0, first.freePerDay - first.freeUsed) : 0
    return `${totalAvail}회 사용 가능`
  }
  if (r === "ticket") return `${tickets}장 보유`
  if (r === "points") {
    const totalCost = posts.reduce(
      (acc, p) => acc + (perCategory[p.targetType]?.pointsCost ?? 0),
      0,
    )
    return `${points}P 보유 · 전체 ${totalCost}P 필요`
  }
  return ""
}

function ResourceRow({
  resource,
  index,
  isFirst,
  isLast,
  available,
  count,
  onChange,
  onUp,
  onDown,
  detail,
}: {
  resource: Resource
  index: number
  isFirst: boolean
  isLast: boolean
  available: number
  count: number
  onChange: (text: string) => void
  onUp: () => void
  onDown: () => void
  detail: string
}) {
  return (
    <View style={styles.row}>
      {/* 좌측 — 우선순위 ↑↓ + 번호 배지 (사용자 요청: 화살표 왼쪽) */}
      <View style={styles.arrows}>
        <Pressable
          onPress={onUp}
          disabled={isFirst}
          hitSlop={4}
          style={[styles.arrowBtn, isFirst && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-up" size={14} color={lightColors.ink700} />
        </Pressable>
        <Pressable
          onPress={onDown}
          disabled={isLast}
          hitSlop={4}
          style={[styles.arrowBtn, isLast && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-down" size={14} color={lightColors.ink700} />
        </Pressable>
      </View>
      <View style={styles.priorityBadge}>
        <Text style={styles.priorityBadgeText}>{index + 1}</Text>
      </View>
      <Ionicons
        name={RESOURCE_ICON[resource]}
        size={16}
        color={lightColors.ink700}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{RESOURCE_LABEL[resource]}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <TextInput
        value={String(count)}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={3}
        editable={available > 0}
        selectTextOnFocus
        style={[
          styles.input,
          available === 0 && styles.inputDisabled,
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: lightColors.ink900,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sub: {
    flex: 1,
    fontSize: 12,
    color: lightColors.ink500,
    lineHeight: 18,
  },
  resetText: {
    fontSize: 11,
    color: lightColors.primary,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
  },
  priorityBadge: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  rowLabel: { fontSize: 13, fontWeight: "700", color: lightColors.ink900 },
  rowDetail: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
  input: {
    width: 56,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "#ffffff",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
    paddingVertical: 0,
  },
  inputDisabled: {
    backgroundColor: "#f1f5f9",
    color: lightColors.ink500,
  },
  arrows: { flexDirection: "column", gap: 2 },
  arrowBtn: {
    width: 22,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  summaryOk: { backgroundColor: "#ecfdf5" },
  summaryWarn: { backgroundColor: "#fffbeb" },
  summaryText: { fontSize: 12, fontWeight: "700", color: lightColors.ink900 },

  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    marginTop: 6,
  },
  startBtnDisabled: { backgroundColor: "#94a3b8" },
  startBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },

  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: lightColors.primary },
  progressText: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
    textAlign: "center",
  },
  hint: {
    fontSize: 11,
    color: lightColors.ink500,
    textAlign: "center",
  },

  resultRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultTitle: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  failItem: { fontSize: 11, color: lightColors.ink500, paddingVertical: 2 },
})
