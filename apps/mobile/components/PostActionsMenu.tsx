/**
 * PostActionsMenu — 게시글 우상단 액션 버튼 (모든 도메인 공용)
 *
 * 권한별 노출 (web ListingActionsMenu / report-button 정독):
 *   - 비작성자 + 비관리자: 사이렌 🚨 아이콘 → 신고 모달
 *   - 작성자 OR 관리자/슈퍼관리자: ⋮ 아이콘 → 메뉴
 *     · 수정하기
 *     · 삭제하기
 *
 * 사용:
 *   <PostActionsMenu
 *     kind="properties"
 *     postId={id}
 *     authorId={post.user_id}
 *     editHref={`/property/${id}/edit`}
 *     onDeleted={() => router.back()}
 *   />
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
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
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { getCachedPlaza } from "@/lib/plaza"

export type PostKind =
  | "properties"
  | "sharing"
  | "secondhand"
  | "clubs"
  | "jobs"
  | "new-store"
  | "group-buying"
  | "local-food"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "board"
  | "service-requests"
  | "property-requests"

/** kind URL slug → 기본 detail 경로 prefix (편집 href fallback 용) */
const KIND_PATH: Record<PostKind, string> = {
  properties: "property",
  sharing: "sharing",
  secondhand: "secondhand",
  clubs: "clubs",
  jobs: "jobs",
  "new-store": "new-store",
  "group-buying": "group-buying",
  "local-food": "local-food",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  board: "board",
  "service-requests": "service-requests",
  "property-requests": "requests",
}

/** kind URL slug → DELETE API path (board 만 supabase 직접) */
const KIND_DELETE_API: Partial<Record<PostKind, string>> = {
  properties: "/api/properties",
  sharing: "/api/sharing",
  secondhand: "/api/secondhand",
  clubs: "/api/clubs",
  jobs: "/api/jobs",
  "new-store": "/api/new-store",
  "group-buying": "/api/group-buying",
  "local-food": "/api/local-food",
  interior: "/api/interior",
  moving: "/api/moving",
  cleaning: "/api/cleaning",
  repair: "/api/repair",
  "service-requests": "/api/service-requests",
  "property-requests": "/api/property-requests",
}

/** kind URL slug → supabase 테이블명 (board DELETE fallback 용) */
const KIND_TABLE: Record<PostKind, string> = {
  properties: "properties",
  sharing: "sharing_posts",
  secondhand: "secondhand_posts",
  clubs: "clubs",
  jobs: "jobs_posts",
  "new-store": "new_store_posts",
  "group-buying": "group_buying_posts",
  "local-food": "local_food",
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
  board: "board_posts",
  "service-requests": "service_requests",
  "property-requests": "property_requests",
}

interface Props {
  kind: PostKind
  postId: string
  authorId?: string | null
  /** 수정 페이지 경로 (없으면 자동 추론: `/{KIND_PATH[kind]}/{postId}/edit`) */
  editHref?: string
  /** 삭제 후 호출 — 보통 router.back() */
  onDeleted?: () => void
}

const REPORT_REASONS = [
  { value: "commercial", label: "업자 의심" },
  { value: "spam",       label: "스팸/광고" },
  { value: "fraud",      label: "사기 의심" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other",      label: "기타" },
]

export function PostActionsMenu({
  kind,
  postId,
  authorId,
  editHref,
  onDeleted,
}: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState("commercial")
  const [reportDetail, setReportDetail] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)

  // admin / superadmin 체크 — 현재 광장 scope 적용 (web canAccessPlaza 미러)
  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }
    ;(async () => {
      const supabase = getSupabase()
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const role = (profile as any)?.role
      // legacy super/admin role 은 무조건 통과 (웹 상세 페이지 정책과 동일)
      if (role === "superadmin" || role === "admin") {
        setIsAdmin(true)
        return
      }
      // plaza_admins 전체 row 확인 (super 면 모든 광장 접근, admin 은 자기 광장만)
      const currentPlaza = getCachedPlaza().id
      const { data: paAll } = await supabase
        .from("plaza_admins")
        .select("role, plaza_id")
        .eq("user_id", user.id)
      const rows = (paAll as any[]) ?? []
      // super 권한 row 가 하나라도 있으면 = 슈퍼 (cross-plaza)
      if (rows.some((r) => r?.role === "super")) {
        setIsAdmin(true)
        return
      }
      // 그 외엔 현재 광장에서의 admin role 만 인정
      const cur = rows.find((r) => r?.plaza_id === currentPlaza)
      setIsAdmin(cur?.role === "admin" || cur?.role === "super")
    })()
  }, [user])

  const isOwner = !!user && !!authorId && user.id === authorId
  const showOwnerActions = isOwner || isAdmin

  function go(route: string) {
    setMenuOpen(false)
    setTimeout(() => router.push(route as any), 50)
  }

  function handleEdit() {
    const href = editHref ?? `/${KIND_PATH[kind]}/${postId}/edit`
    go(href)
  }

  async function handleDelete() {
    setMenuOpen(false)
    // 참여자/주문 이력 사전 체크 — 도메인별 자식 테이블
    const supabase = getSupabase()
    let conflictMessage: string | null = null
    try {
      if (kind === "local-food") {
        const { count } = await supabase
          .from("local_food_order_items")
          .select("*", { count: "exact", head: true })
          .eq("local_food_id", postId)
        if (count && count > 0) {
          conflictMessage = `주문 이력 ${count}건이 있습니다. 삭제 시 주문 이력도 함께 사라져 문제가 발생할 수 있습니다.`
        }
      } else if (kind === "group-buying") {
        const { count } = await supabase
          .from("group_buying_participants")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId)
        if (count && count > 0) {
          conflictMessage = `현재 참여자 ${count}명이 있습니다. 삭제 시 참여 이력이 함께 사라져 문제가 발생할 수 있습니다.`
        }
      } else if (kind === "clubs") {
        const { count } = await supabase
          .from("club_members")
          .select("*", { count: "exact", head: true })
          .eq("club_id", postId)
        if (count && count > 1) {
          conflictMessage = `현재 멤버 ${count}명이 있습니다. 삭제 시 모임 이력과 채팅이 함께 사라져 문제가 발생할 수 있습니다.`
        }
      }
    } catch {
      // 권한/RLS 로 count 못 받아도 진행 — 삭제는 시도해봄
    }

    const baseMsg = "정말로 이 글을 삭제하시겠습니까?"
    const fullMsg = conflictMessage ? `${conflictMessage}\n\n${baseMsg}` : baseMsg
    const title = conflictMessage ? "⚠️ 삭제 경고" : "삭제 확인"

    Alert.alert(title, fullMsg, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setBusy(true)
          try {
            const apiPath = KIND_DELETE_API[kind]
            let ok = false
            if (apiPath) {
              // force=true 로 관리자/작성자가 FK 제약 무시하고 강제 삭제
              const res = await gwangjangFetch(
                `${apiPath}/${postId}?force=true`,
                { method: "DELETE" },
              )
              ok = res.ok
              if (!ok) {
                const data = await res.json().catch(() => ({}))
                Alert.alert("실패", data?.error || "삭제에 실패했습니다")
              }
            } else {
              // board 처럼 API 없음 — supabase 직접 (RLS 가 권한 체크)
              const supabase = getSupabase()
              const { error } = await (supabase as any)
                .from(KIND_TABLE[kind])
                .delete()
                .eq("id", postId)
              ok = !error
              if (!ok) Alert.alert("실패", error?.message || "삭제에 실패했습니다")
            }
            if (ok) {
              onDeleted?.()
              if (!onDeleted) router.back()
            }
          } catch {
            Alert.alert("오류", "삭제 중 오류가 발생했습니다")
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  async function handleReportSubmit() {
    if (reportSubmitting) return
    setReportSubmitting(true)
    try {
      // web /api/reports TARGET_TABLE 키와 매핑
      const targetTypeMap: Record<string, string> = {
        properties: "property",
        "group-buying": "group_buying",
        "local-food": "local_food",
      }
      const targetType = (targetTypeMap as any)[kind] ?? kind
      const res = await gwangjangFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType,
          targetId: postId,
          reason: reportReason,
          reasonDetail: reportDetail || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        Alert.alert("접수 완료", "신고가 접수되었습니다. 감사합니다.")
        setReportOpen(false)
        setReportDetail("")
      } else if (res.status === 409) {
        Alert.alert("알림", "이미 신고하신 글입니다")
        setReportOpen(false)
      } else if (res.status === 401) {
        Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      } else {
        Alert.alert("실패", data?.error || "신고에 실패했습니다")
      }
    } catch {
      Alert.alert("오류", "신고 요청 중 오류가 발생했습니다")
    } finally {
      setReportSubmitting(false)
    }
  }

  // 비로그인 / 비작성자 / 비관리자 → 사이렌 (신고)
  if (!showOwnerActions) {
    return (
      <>
        <Pressable
          onPress={() => {
            if (!user) {
              router.push("/auth/login" as any)
              return
            }
            setReportOpen(true)
          }}
          hitSlop={6}
          style={styles.iconBtn}
          accessibilityLabel="신고하기"
          accessibilityRole="button"
        >
          <Ionicons
            name="megaphone-outline"
            size={22}
            color={lightColors.ink900}
            style={{ transform: [{ translateY: -1 }] }}
          />
        </Pressable>
        <ReportModal
          visible={reportOpen}
          onClose={() => !reportSubmitting && setReportOpen(false)}
          reason={reportReason}
          setReason={setReportReason}
          detail={reportDetail}
          setDetail={setReportDetail}
          submitting={reportSubmitting}
          onSubmit={handleReportSubmit}
        />
      </>
    )
  }

  // 작성자 / 관리자 → ⋮ 메뉴
  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={6}
        style={styles.iconBtn}
        accessibilityLabel="더보기 메뉴"
        accessibilityRole="button"
      >
        <Ionicons name="ellipsis-vertical" size={22} color={lightColors.ink900} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <MenuItem icon="create-outline" label="수정하기" onPress={handleEdit} />
            <MenuItem
              icon="trash-outline"
              label="삭제하기"
              onPress={handleDelete}
              danger
              disabled={busy}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: any
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { backgroundColor: "rgba(0,0,0,0.05)" },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={18} color={danger ? "#dc2626" : lightColors.ink900} />
      <Text style={[styles.menuItemText, danger && { color: "#dc2626" }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function ReportModal({
  visible,
  onClose,
  reason,
  setReason,
  detail,
  setDetail,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  reason: string
  setReason: (v: string) => void
  detail: string
  setDetail: (v: string) => void
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.reportBackdrop} onPress={onClose}>
        <Pressable style={styles.reportSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.reportHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="megaphone" size={20} color="#dc2626" />
              <Text style={styles.reportTitle}>신고하기</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="닫기" accessibilityRole="button">
              <Ionicons name="close" size={18} color={lightColors.ink500} />
            </Pressable>
          </View>
          <Text style={styles.reportNotice}>
            허위 신고 시 서비스 이용이 제한될 수 있습니다.
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={styles.reportLabel}>사유</Text>
            <View style={{ gap: 6, marginBottom: 16 }}>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={[
                    styles.reasonRow,
                    reason === r.value && styles.reasonRowActive,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      reason === r.value && styles.radioActive,
                    ]}
                  >
                    {reason === r.value && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.reasonText}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.reportLabel}>
              상세 내용 <Text style={{ color: lightColors.ink500 }}>(선택)</Text>
            </Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              multiline
              numberOfLines={3}
              maxLength={500}
              placeholder="신고 사유를 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              style={styles.reportInput}
            />
            <Text style={styles.reportCount}>{detail.length}/500</Text>
          </ScrollView>

          <View style={styles.reportFooter}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              accessibilityLabel="취소"
              accessibilityRole="button"
              style={[styles.cancelBtn, submitting && { opacity: 0.5 }]}
            >
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              accessibilityLabel="신고하기"
              accessibilityRole="button"
              style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitText}>신고하기</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  // Action menu (작성자/관리자)
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 100,
    paddingHorizontal: 12,
  },
  menu: {
    width: 200,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  menuItemText: { fontSize: 14, fontWeight: "500", color: lightColors.ink900 },
  menuSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightColors.border,
    marginVertical: 4, marginHorizontal: 8,
  },

  // Report modal
  reportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  reportSheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28,
    maxHeight: "85%",
  },
  handleRow: { alignItems: "center", marginBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(15,23,42,0.18)" },
  reportHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  reportTitle: { fontSize: 16, fontWeight: "700", color: lightColors.ink900 },
  reportNotice: { fontSize: 11, color: lightColors.ink500, marginBottom: 16 },
  reportLabel: { fontSize: 13, fontWeight: "500", color: lightColors.ink900, marginBottom: 8 },
  reasonRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  reasonRowActive: {
    borderColor: "#dc2626",
    backgroundColor: "rgba(220,38,38,0.05)",
  },
  radio: {
    width: 16, height: 16, borderRadius: 999,
    borderWidth: 2, borderColor: lightColors.ink500,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: "#dc2626" },
  radioDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#dc2626" },
  reasonText: { fontSize: 13, color: lightColors.ink900 },
  reportInput: {
    borderWidth: 1, borderColor: lightColors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: lightColors.ink900,
    backgroundColor: "#ffffff",
    minHeight: 80, textAlignVertical: "top",
  },
  reportCount: { fontSize: 11, color: lightColors.ink500, textAlign: "right", marginTop: 4 },
  reportFooter: { flexDirection: "row", gap: 8, marginTop: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: lightColors.border,
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "500", color: lightColors.ink900 },
  submitBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    backgroundColor: "#dc2626",
    alignItems: "center",
  },
  submitText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
})
