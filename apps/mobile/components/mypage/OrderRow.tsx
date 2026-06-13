/**
 * OrderRow — 주문 내역 한 줄 (구매/판매 공통).
 */

import { Image, Pressable, StyleSheet, Text, View, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { OrderEntry } from "@gwangjang/features/profile"

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending_payment: { label: "결제 대기", tone: "amber" },
  reserved: { label: "결제 대기", tone: "amber" }, // 레거시
  paid: { label: "결제 완료", tone: "primary" },
  confirmed: { label: "결제 완료", tone: "primary" }, // 레거시
  shipped: { label: "배송중", tone: "primary" },
  received: { label: "수령 완료", tone: "emerald" }, // 레거시
  completed: { label: "수령 완료", tone: "emerald" },
  cancelled: { label: "취소됨", tone: "muted" },
  refunded: { label: "환불 완료", tone: "muted" },
}

// 택배사 코드 → 추적 URL (대표 4개)
const TRACKING_URL: Record<string, string> = {
  CJ: "https://trace.cjlogistics.com/web/detail.jsp?slipno=",
  cj: "https://trace.cjlogistics.com/web/detail.jsp?slipno=",
  롯데: "https://www.lotteglogis.com/home/reservation/tracking/index?invno=",
  한진: "https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=",
  우체국: "https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=",
}

const TONE_BG: Record<string, string> = {
  primary: "#dbeafe",
  amber: "#fef3c7",
  emerald: "#d1fae5",
  muted: lightColors.muted,
}
const TONE_FG: Record<string, string> = {
  primary: lightColors.primary,
  amber: "#b45309",
  emerald: "#047857",
  muted: lightColors.ink500,
}

interface OrderRowProps {
  order: OrderEntry
  /** 구매자 화면이면 "수령 완료" 버튼 노출 */
  role?: "buyer" | "seller"
  /** 수령 완료 버튼 콜백 (status='shipped' 일 때만) */
  onConfirmReceived?: (order: OrderEntry) => void
  /** 후기 작성 콜백 (구매자·수령완료·미작성일 때만) */
  onWriteReview?: (order: OrderEntry) => void
}

export function OrderRow({ order, role = "buyer", onConfirmReceived, onWriteReview }: OrderRowProps) {
  const status = STATUS_LABEL[order.status] ?? { label: order.status, tone: "muted" }
  const canConfirm =
    role === "buyer" && order.status === "shipped" && !!onConfirmReceived
  const canReview =
    role === "buyer" && order.status === "completed" && !!onWriteReview

  function openTracking() {
    if (!order.tracking_number) return
    const carrier = order.tracking_carrier ?? "CJ"
    const base = TRACKING_URL[carrier] ?? TRACKING_URL.CJ
    Linking.openURL(`${base}${order.tracking_number}`).catch(() => {})
  }

  return (
    <View style={styles.row}>
      {order.product_image ? (
        <Image source={{ uri: order.product_image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons
            name="bag-handle-outline"
            size={24}
            color={lightColors.ink500}
          />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.statusRow}>
          <View
            style={[styles.badge, { backgroundColor: TONE_BG[status.tone] }]}
          >
            <Text
              style={[styles.badgeText, { color: TONE_FG[status.tone] }]}
            >
              {status.label}
            </Text>
          </View>
          <Text style={styles.domain}>
            {order.domain === "local_food" ? "로컬푸드" : "공동구매"}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {order.product_name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.qty}>
            수량 {order.quantity} · {order.amount.toLocaleString()}원
          </Text>
        </View>
        {order.tracking_number && (
          <Pressable onPress={openTracking} hitSlop={4} style={styles.trackingBtn}>
            <Ionicons name="cube-outline" size={12} color={lightColors.primary} />
            <Text style={styles.trackingText}>
              {order.tracking_carrier ?? "택배"} {order.tracking_number} · 추적하기
            </Text>
          </Pressable>
        )}
        <View style={styles.bottomRow}>
          <Text style={styles.date}>{formatDate(order.created_at)}</Text>
          {canConfirm && (
            <Pressable
              onPress={() => onConfirmReceived?.(order)}
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#ffffff" />
              <Text style={styles.confirmBtnText}>수령 완료</Text>
            </Pressable>
          )}
          {canReview && (
            <Pressable
              onPress={() => onWriteReview?.(order)}
              style={({ pressed }) => [styles.reviewBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="star" size={14} color="#ffffff" />
              <Text style={styles.confirmBtnText}>후기 작성</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")}`
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: lightColors.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    gap: spacing[3],
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 2 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  badgeText: { fontSize: 10, fontWeight: "600" },
  domain: { fontSize: fontSize.xs, color: lightColors.ink500 },
  title: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  qty: { fontSize: fontSize.xs, color: lightColors.ink700 },
  tracking: { fontSize: fontSize.xs, color: lightColors.ink500 },
  trackingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(59,130,246,0.08)",
    alignSelf: "flex-start",
  },
  trackingText: {
    fontSize: 11,
    color: lightColors.primary,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  date: { fontSize: 11, color: lightColors.ink500 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#10b981",
  },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#225a39",
  },
  reviewedText: {
    fontSize: 12,
    color: lightColors.ink500,
    fontWeight: "600",
  },
  confirmBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
})
