/**
 * PostActionsMenu — 게시글 우상단 액션 버튼 (모든 도메인 공용)
 *
 * 권한별 노출 (web ListingActionsMenu / report-button 정독):
 *   - 비작성자 + 비관리자: 사이렌 🚨 아이콘 → 신고 모달
 *   - 작성자 OR 관리자/슈퍼관리자: ⋮ 아이콘 → 메뉴
 *     · (bumpable) 올리기
 *     · 수정하기
 *     · 삭제하기
 *
 * 사용:
 *   <PostActionsMenu
 *     kind="properties"
 *     postId={id}
 *     authorId={post.user_id}
 *     editHref={`/property/${id}/edit`}
 *     bumpable
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

/**
 * 올리기(bump) 가 가능한 종류 — web bump-quick-menu.tsx BumpTarget 1:1
 * 지원: property, secondhand, interior, moving, cleaning, repair,
 *       group_buying, local_food, jobs, new_store
 * 미지원: sharing, clubs, board
 */
const BUMPABLE_KINDS = new Set<PostKind>([
  "properties",
  "secondhand",
  "interior",
  "moving",
  "cleaning",
  "repair",
  "group-buying",
  "local-food",
  "jobs",
  "new-store",
])

/** kind URL slug → /api/bump/use 의 targetType 매핑 (web BumpTargetType) */
const KIND_TO_BUMP_TARGET: Partial<Record<PostKind, string>> = {
  properties: "property",
  secondhand: "secondhand",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  "group-buying": "group_buying",
  "local-food": "local_food",
  jobs: "jobs",
  "new-store": "new_store",
}

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
  /**
   * 올리기 지원 — web bump-quick-menu 정독 기준 자동 결정.
   * 강제 비활성: bumpable={false}.
   * 강제 활성: bumpable={true} (커스텀 — 보통 불필요)
   */
  bumpable?: boolean
  /** 삭제 후 호출 — 보통 router.back() */
  onDeleted?: () => void
  /** 올리기 후 호출 (새로고침 등) */
  onAction?: () => void
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
  bumpable,
  onDeleted,
  onAction,
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
  // 올리기 모달 상태 (web bump-quick-menu.tsx 1:1)
  const [bumpOpen, setBumpOpen] = useState(false)
  const [bumpLoading, setBumpLoading] = useState(false)
  const [bumpStatus, setBumpStatus] = useState<{
    freeRemaining: number
    freeTotal: number
    pointsCost: number
    ticketBalance: number
    pointBalance: number
  } | null>(null)
  const [bumpError, setBumpError] = useState<string | null>(null)

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

  // 올리기 노출 규칙 (web 1:1):
  //  - 작성자만 노출 (관리자는 "남의 글 끌올" 방지 차원에서 미노출)
  //  - 종류 자체가 bumpable 해야 함 (sharing/clubs/board 미지원)
  //  - props.bumpable === false 면 강제 숨김
  const kindBumpable = BUMPABLE_KINDS.has(kind)
  const showBump =
    isOwner && kindBumpable && (bumpable === undefined ? true : bumpable)

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
              const { error } = await supabase
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

  // 메뉴에서 "올리기" 탭 → 메뉴 닫고 약간 후 BumpModal 오픈 (RN modal 충돌 회피)
  function handleBump() {
    const targetType = KIND_TO_BUMP_TARGET[kind]
    if (!targetType) {
      Alert.alert("알림", "올리기를 지원하지 않는 글입니다")
      return
    }
    setMenuOpen(false)
    // 메뉴 fade 애니메이션이 끝난 후 BumpModal 열기 (300ms — 안드/iOS 모두 안정적)
    setTimeout(() => openBumpModal(), 300)
  }

  // plaza subdomain 직접 호출 — host 기반 plaza 인식 (CORS / x-plaza 헤더 우회)
  async function bumpFetch(path: string, init?: RequestInit) {
    const plaza = getCachedPlaza().id || "www"
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const headers = new Headers(init?.headers ?? {})
    if (!headers.has("Content-Type") && init?.body) {
      headers.set("Content-Type", "application/json")
    }
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`)
    }
    return fetch(`https://${plaza}.gwangjang.app${path}`, { ...init, headers, cache: "no-store" } as any)
  }

  async function openBumpModal() {
    const targetType = KIND_TO_BUMP_TARGET[kind]
    if (!targetType) return
    setBumpOpen(true)
    setBumpLoading(true)
    setBumpStatus(null)
    setBumpError(null)
    try {
      // supabase 직접 쿼리 — web /api/bump/status 1:1 미러 (CORS 우회)
      const supabase = getSupabase()
      if (!user?.id) {
        setBumpError("로그인이 필요합니다")
        return
      }
      const plaza = getCachedPlaza().id
      if (!plaza) {
        setBumpError("광장 정보가 없습니다")
        return
      }

      // bump_settings
      const { data: setting } = await supabase
        .from("bump_settings")
        .select("*")
        .eq("target_type", targetType)
        .eq("enabled", true)
        .maybeSingle()
      if (!setting) {
        setBumpError("올리기 기능이 비활성화되어 있습니다")
        return
      }

      // 오늘 무료 사용량
      const todayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(new Date())
      const { data: daily } = await supabase
        .from("bump_daily")
        .select("free_used")
        .eq("user_id", user.id)
        .eq("plaza_id", plaza)
        .eq("target_type", targetType)
        .eq("date", todayStr)
        .maybeSingle()
      const freeUsed = (daily as any)?.free_used ?? 0
      const freePerDay = (setting as any).free_per_day ?? 2
      const freeRemaining = Math.max(0, freePerDay - freeUsed)

      // 올리기권 잔액
      const { data: ticket } = await supabase
        .from("bump_tickets")
        .select("balance")
        .eq("user_id", user.id)
        .eq("plaza_id", plaza)
        .maybeSingle()
      const ticketBalance = (ticket as any)?.balance ?? 0

      // 포인트 잔액 — 광장 격리 해제됨 (전 광장 공유)
      const { data: pts } = await supabase
        .from("user_points")
        .select("available")
        .eq("user_id", user.id)
        .maybeSingle()
      const pointBalance = (pts as any)?.available ?? 0

      setBumpStatus({
        freeRemaining,
        freeTotal: freePerDay,
        pointsCost: (setting as any).points_cost ?? 0,
        ticketBalance,
        pointBalance,
      })
    } catch (e: any) {
      setBumpError(e?.message || "잔여 조회 중 오류가 발생했습니다")
    } finally {
      setBumpLoading(false)
    }
  }

  async function submitBump(payment: "free" | "points" | "ticket") {
    const targetType = KIND_TO_BUMP_TARGET[kind]
    if (!targetType) return
    setBusy(true)
    try {
      // supabase RPC 직접 호출 — web /api/bump/use 1:1 (CORS 우회)
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
      const pointsCost = bumpStatus?.pointsCost ?? 0
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("bump_atomic", {
        p_user_id: user.id,
        p_plaza_id: plaza,
        p_target_type: targetType,
        p_target_id: postId,
        p_payment: payment,
        p_points_cost: pointsCost,
      })
      if (rpcErr) {
        Alert.alert("실패", rpcErr.message || "올리기에 실패했습니다")
        return
      }
      const r = rpcResult as { ok: boolean; reason?: string; bumped_at?: string }
      if (r?.ok) {
        setBumpOpen(false)
        Alert.alert("완료", "글을 다시 올렸어요")
        onAction?.()
      } else {
        const reason = r?.reason ?? "unknown"
        const reasonMap: Record<string, string> = {
          no_free_quota: "오늘 무료 잔여를 모두 사용했습니다",
          no_tickets: "올리기권이 부족합니다",
          insufficient_points: "포인트가 부족합니다",
          cooldown: "쿨다운 중입니다",
          account_too_young: "계정 가입 후 일정 기간이 지나야 가능합니다",
          not_found_or_not_owner: "본인의 글이 아닙니다",
        }
        Alert.alert("실패", reasonMap[reason] || reason)
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message || "요청 중 오류가 발생했습니다")
    } finally {
      setBusy(false)
    }
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
            {showBump && (
              <>
                <MenuItem
                  icon="arrow-up-outline"
                  label="올리기"
                  onPress={handleBump}
                  disabled={busy}
                />
                <View style={styles.menuSep} />
              </>
            )}
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

      {/* Bump Modal — web bump-quick-menu.tsx 1:1 */}
      <Modal
        visible={bumpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setBumpOpen(false)}
      >
        <Pressable
          style={styles.bumpBackdrop}
          onPress={() => !busy && setBumpOpen(false)}
        >
          <Pressable style={styles.bumpCard} onPress={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <View style={styles.bumpHeader}>
              <Ionicons name="arrow-up" size={18} color={lightColors.primary} />
              <Text style={styles.bumpTitle}>글 올리기</Text>
              <Pressable
                onPress={() => !busy && setBumpOpen(false)}
                hitSlop={8}
                accessibilityLabel="닫기"
                accessibilityRole="button"
                style={{ marginLeft: "auto" }}
              >
                <Ionicons name="close" size={20} color={lightColors.ink500} />
              </Pressable>
            </View>

            <Text style={styles.bumpSub}>
              내 글을 다시 최신순 맨 위로 올립니다. (다른 분이 글을 올리면 자연스럽게 밀려요)
            </Text>

            {bumpLoading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color={lightColors.primary} />
              </View>
            ) : bumpError ? (
              <View style={{ paddingVertical: 16, alignItems: "center", gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={32} color="#ef4444" />
                <Text style={{ fontSize: 13, color: lightColors.ink700, textAlign: "center" }}>
                  {bumpError}
                </Text>
                <Pressable
                  onPress={() => setBumpOpen(false)}
                  style={styles.bumpCloseBtn}
                >
                  <Text style={styles.bumpCloseBtnText}>닫기</Text>
                </Pressable>
              </View>
            ) : !bumpStatus ? null : (
              <>
                {/* 잔여 칩 */}
                <View style={styles.bumpStatRow}>
                  <View style={styles.bumpStatChip}>
                    <Ionicons name="arrow-up" size={12} color={lightColors.ink500} />
                    <Text style={styles.bumpStatLabel}>무료 잔여</Text>
                    <Text style={styles.bumpStatValue}>
                      {bumpStatus.freeRemaining}/{bumpStatus.freeTotal}
                    </Text>
                  </View>
                  <View style={styles.bumpStatChip}>
                    <Ionicons name="ticket-outline" size={12} color={lightColors.ink500} />
                    <Text style={styles.bumpStatLabel}>올리기권</Text>
                    <Text style={styles.bumpStatValue}>{bumpStatus.ticketBalance}장</Text>
                  </View>
                </View>

                {/* 무료로 올리기 */}
                <Pressable
                  onPress={() => bumpStatus.freeRemaining > 0 && submitBump("free")}
                  disabled={busy || bumpStatus.freeRemaining <= 0}
                  style={[
                    styles.bumpBtn,
                    bumpStatus.freeRemaining > 0
                      ? styles.bumpBtnPrimary
                      : styles.bumpBtnDisabled,
                  ]}
                >
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color={bumpStatus.freeRemaining > 0 ? "#ffffff" : "#94a3b8"}
                  />
                  <Text
                    style={[
                      styles.bumpBtnText,
                      bumpStatus.freeRemaining > 0
                        ? { color: "#ffffff" }
                        : { color: "#94a3b8" },
                    ]}
                  >
                    무료로 올리기
                  </Text>
                  <Text
                    style={[
                      styles.bumpBtnSub,
                      bumpStatus.freeRemaining > 0
                        ? { color: "rgba(255,255,255,0.85)" }
                        : { color: "#94a3b8" },
                    ]}
                  >
                    {bumpStatus.freeRemaining > 0
                      ? `잔여 ${bumpStatus.freeRemaining}회`
                      : "모두 사용함"}
                  </Text>
                </Pressable>

                {/* 포인트로 올리기 */}
                <Pressable
                  onPress={() =>
                    bumpStatus.pointsCost > 0 &&
                    bumpStatus.pointBalance >= bumpStatus.pointsCost &&
                    submitBump("points")
                  }
                  disabled={
                    busy ||
                    bumpStatus.pointsCost <= 0 ||
                    bumpStatus.pointBalance < bumpStatus.pointsCost
                  }
                  style={[styles.bumpBtn, styles.bumpBtnPoints]}
                >
                  <Ionicons name="sparkles-outline" size={16} color="#b45309" />
                  <Text style={[styles.bumpBtnText, { color: "#b45309" }]}>
                    포인트로 올리기
                  </Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#b45309" }}>
                      {bumpStatus.pointsCost}P
                    </Text>
                    <Text style={{ fontSize: 10, color: "#92400e" }}>
                      보유 {bumpStatus.pointBalance}P
                    </Text>
                  </View>
                </Pressable>

                {/* 올리기권으로 올리기 */}
                <Pressable
                  onPress={() =>
                    bumpStatus.ticketBalance > 0 && submitBump("ticket")
                  }
                  disabled={busy || bumpStatus.ticketBalance <= 0}
                  style={[styles.bumpBtn, styles.bumpBtnTicket]}
                >
                  <Ionicons name="ticket-outline" size={16} color={lightColors.ink900} />
                  <Text style={[styles.bumpBtnText, { color: lightColors.ink900 }]}>
                    올리기권으로 올리기
                  </Text>
                  <Text style={{ fontSize: 11, color: lightColors.ink500 }}>
                    보유 {bumpStatus.ticketBalance}장
                  </Text>
                </Pressable>

                {/* 올리기권 충전하기 */}
                <Pressable
                  onPress={() => {
                    setBumpOpen(false)
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

  // Bump Modal (web bump-quick-menu.tsx 1:1)
  bumpBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  bumpCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  bumpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bumpTitle: { fontSize: 16, fontWeight: "800", color: lightColors.ink900 },
  bumpSub: { fontSize: 12, color: lightColors.ink500, lineHeight: 17 },
  bumpStatRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  bumpStatChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bumpStatLabel: { fontSize: 11, color: lightColors.ink500, flex: 1 },
  bumpStatValue: { fontSize: 12, fontWeight: "700", color: lightColors.ink900 },
  bumpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bumpBtnPrimary: {
    backgroundColor: lightColors.primary,
  },
  bumpBtnDisabled: {
    backgroundColor: "#f1f5f9",
  },
  bumpBtnPoints: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
  },
  bumpBtnTicket: {
    backgroundColor: "#ffffff",
    borderColor: lightColors.border,
  },
  bumpBtnText: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  bumpBtnSub: { fontSize: 12 },
  bumpCloseBtn: {
    minWidth: 100,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  bumpCloseBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
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
