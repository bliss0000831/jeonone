/**
 * BumpDialog — 글 올리기 선택 모달 (web bump-quick-menu.tsx 1:1).
 *
 * PostActionsMenu(상세) 와 ListCardMenu(리스트/카드) 둘 다 동일한 UI 사용.
 *
 * Props:
 *   - visible: 모달 open 여부
 *   - onClose: 닫기 콜백
 *   - targetType: 'property' | 'secondhand' | 'group_buying' | ... (DB 카테고리)
 *   - targetId: post.id
 *   - onBumped?: 올리기 성공 후 호출 (리스트 새로고침 등)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { getCachedPlaza } from "@/lib/plaza"

interface BumpStatus {
  freeRemaining: number
  freeTotal: number
  pointsCost: number
  ticketBalance: number
  pointBalance: number
}

interface Props {
  visible: boolean
  onClose: () => void
  targetType: string
  targetId: string
  onBumped?: () => void
}

export function BumpDialog({
  visible,
  onClose,
  targetType,
  targetId,
  onBumped,
}: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [status, setStatus] = useState<BumpStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 모달이 열릴 때마다 status fetch
  useEffect(() => {
    if (!visible) return
    let alive = true
    ;(async () => {
      setLoading(true)
      setStatus(null)
      setError(null)
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

        const { data: setting } = await supabase
          .from("bump_settings")
          .select("*")
          .eq("target_type", targetType)
          .eq("enabled", true)
          .maybeSingle()
        if (!setting) {
          if (alive) setError("올리기 기능이 비활성화되어 있습니다")
          return
        }

        const todayStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date())
        // 🆕 전체 도메인 합산 — 사용자 단위 통합 일일 무료 2개
        const GLOBAL_FREE_PER_DAY = 2
        const { data: dailyAll } = await supabase
          .from("bump_daily")
          .select("free_used")
          .eq("user_id", user.id)
          .eq("plaza_id", plaza)
          .eq("date", todayStr)
        const freeUsed = (dailyAll ?? []).reduce(
          (sum, r: any) => sum + (r.free_used ?? 0),
          0,
        )
        const freePerDay = GLOBAL_FREE_PER_DAY
        const freeRemaining = Math.max(0, freePerDay - freeUsed)

        const { data: ticket } = await supabase
          .from("bump_tickets")
          .select("balance")
          .eq("user_id", user.id)
          .eq("plaza_id", plaza)
          .maybeSingle()
        const ticketBalance = (ticket as any)?.balance ?? 0

        const { data: pts } = await supabase
          .from("user_points")
          .select("available")
          .eq("user_id", user.id)
          .maybeSingle()
        const pointBalance = (pts as any)?.available ?? 0

        if (alive)
          setStatus({
            freeRemaining,
            freeTotal: freePerDay,
            pointsCost: (setting as any).points_cost ?? 0,
            ticketBalance,
            pointBalance,
          })
      } catch (e: any) {
        if (alive) setError(e?.message || "조회 중 오류")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [visible, targetType, user?.id])

  async function submit(payment: "free" | "points" | "ticket") {
    setBusy(true)
    try {
      const supabase = getSupabase()
      if (!user?.id) {
        Alert.alert("로그인 필요", "로그인 후 이용해주세요")
        return
      }
      const plaza = getCachedPlaza().id
      if (!plaza) {
        Alert.alert("오류", "광장 정보가 없습니다")
        return
      }
      const pointsCost = status?.pointsCost ?? 0
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "bump_atomic",
        {
          p_user_id: user.id,
          p_plaza_id: plaza,
          p_target_type: targetType,
          p_target_id: targetId,
          p_payment: payment,
          p_points_cost: pointsCost,
        },
      )
      if (rpcErr) {
        Alert.alert("실패", rpcErr.message || "올리기에 실패했습니다")
        return
      }
      const r = rpcResult as { ok: boolean; reason?: string }
      if (r?.ok) {
        onClose()
        Alert.alert("완료", "글을 다시 올렸어요")
        onBumped?.()
      } else {
        const reasonMap: Record<string, string> = {
          no_free_quota: "오늘 무료 잔여를 모두 사용했습니다",
          no_tickets: "올리기권이 부족합니다",
          insufficient_points: "포인트가 부족합니다",
          cooldown: "쿨다운 중입니다",
          account_too_young: "계정 가입 후 일정 기간이 지나야 가능합니다",
          not_found_or_not_owner: "본인의 글이 아닙니다",
        }
        Alert.alert("실패", reasonMap[r?.reason ?? ""] || r?.reason || "실패")
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message || "오류가 발생했습니다")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !busy && onClose()}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => !busy && onClose()}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Ionicons name="arrow-up" size={18} color={lightColors.primary} />
            <Text style={styles.title}>글 올리기</Text>
            <Pressable
              onPress={() => !busy && onClose()}
              hitSlop={8}
              style={{ marginLeft: "auto" }}
            >
              <Ionicons name="close" size={20} color={lightColors.ink500} />
            </Pressable>
          </View>

          <Text style={styles.sub}>
            내 글을 다시 최신순 맨 위로 올립니다. (다른 분이 글을 올리면 자연스럽게 밀려요)
          </Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 16, alignItems: "center", gap: 10 }}>
              <Ionicons name="alert-circle-outline" size={32} color="#ef4444" />
              <Text style={{ fontSize: 13, color: lightColors.ink700, textAlign: "center" }}>
                {error}
              </Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>닫기</Text>
              </Pressable>
            </View>
          ) : !status ? null : (
            <>
              {/* 잔여 칩 */}
              <View style={styles.statRow}>
                <View style={styles.statChip}>
                  <Ionicons name="arrow-up" size={12} color={lightColors.ink500} />
                  <Text style={styles.statLabel}>무료 잔여</Text>
                  <Text style={styles.statValue}>
                    {status.freeRemaining}/{status.freeTotal}
                  </Text>
                </View>
                <View style={styles.statChip}>
                  <Ionicons name="ticket-outline" size={12} color={lightColors.ink500} />
                  <Text style={styles.statLabel}>올리기권</Text>
                  <Text style={styles.statValue}>{status.ticketBalance}장</Text>
                </View>
              </View>

              {/* 무료로 올리기 */}
              <Pressable
                onPress={() => status.freeRemaining > 0 && submit("free")}
                disabled={busy || status.freeRemaining <= 0}
                style={[
                  styles.btn,
                  status.freeRemaining > 0 ? styles.btnPrimary : styles.btnDisabled,
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={16}
                  color={status.freeRemaining > 0 ? "#ffffff" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.btnText,
                    status.freeRemaining > 0 ? { color: "#ffffff" } : { color: "#94a3b8" },
                  ]}
                >
                  무료로 올리기
                </Text>
                <Text
                  style={[
                    styles.btnSub,
                    status.freeRemaining > 0
                      ? { color: "rgba(255,255,255,0.85)" }
                      : { color: "#94a3b8" },
                  ]}
                >
                  {status.freeRemaining > 0
                    ? `잔여 ${status.freeRemaining}회`
                    : "모두 사용함"}
                </Text>
              </Pressable>

              {/* 포인트로 올리기 */}
              <Pressable
                onPress={() =>
                  status.pointsCost > 0 &&
                  status.pointBalance >= status.pointsCost &&
                  submit("points")
                }
                disabled={
                  busy ||
                  status.pointsCost <= 0 ||
                  status.pointBalance < status.pointsCost
                }
                style={[styles.btn, styles.btnPoints]}
              >
                <Ionicons name="sparkles-outline" size={16} color="#b45309" />
                <Text style={[styles.btnText, { color: "#b45309" }]}>포인트로 올리기</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#b45309" }}>
                    {status.pointsCost}P
                  </Text>
                  <Text style={{ fontSize: 10, color: "#92400e" }}>
                    보유 {status.pointBalance}P
                  </Text>
                </View>
              </Pressable>

              {/* 올리기권으로 올리기 */}
              <Pressable
                onPress={() => status.ticketBalance > 0 && submit("ticket")}
                disabled={busy || status.ticketBalance <= 0}
                style={[styles.btn, styles.btnTicket]}
              >
                <Ionicons name="ticket-outline" size={16} color={lightColors.ink900} />
                <Text style={[styles.btnText, { color: lightColors.ink900 }]}>
                  올리기권으로 올리기
                </Text>
                <Text style={{ fontSize: 11, color: lightColors.ink500 }}>
                  보유 {status.ticketBalance}장
                </Text>
              </Pressable>

              {/* 올리기권 충전하기 — mobile bump-tickets 페이지 */}
              <Pressable
                onPress={() => {
                  onClose()
                  setTimeout(() => router.push("/bump-tickets" as any), 100)
                }}
                style={{ alignItems: "center", paddingTop: 12 }}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
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
  sub: {
    fontSize: 12,
    color: lightColors.ink500,
    lineHeight: 18,
  },
  statRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  statChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  statLabel: { fontSize: 11, color: lightColors.ink500 },
  statValue: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  btnPrimary: { backgroundColor: lightColors.primary },
  btnDisabled: { backgroundColor: "#e2e8f0" },
  btnPoints: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  btnTicket: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  btnText: { fontSize: 14, fontWeight: "700" },
  btnSub: { marginLeft: "auto", fontSize: 11 },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    marginTop: 4,
  },
  closeBtnText: { fontSize: 13, color: lightColors.ink700 },
})
