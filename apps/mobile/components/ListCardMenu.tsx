/**
 * ListCardMenu — 리스트/카드 아이템 우측에 들어가는 작은 ⋮ 메뉴
 *
 * 역할별 메뉴:
 *   - 작성자: 올리기(bumpable 만) / 수정 / 삭제
 *   - 관리자/슈퍼관리자: 수정 / 삭제 (모든 글)
 *   - 그 외: 공유 / 숨기기 / 신고
 *
 * 위치:
 *   - placement="row" — 리스트 행 우측 (compact 28x28)
 *   - placement="thumb-overlay" — 그리드 카드 썸네일 우상단 absolute (반투명 흰 배경)
 *
 * 사용:
 *   <ListCardMenu
 *     kind="properties"
 *     postId={p.id}
 *     authorId={p.user_id}
 *     title={p.title}
 *     placement="thumb-overlay"
 *     onChanged={() => reload()}
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
import { useShareModal } from "./mypage/ShareModal"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, spacing } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { getCachedPlaza, buildShareUrl } from "@/lib/plaza"
import { useHiddenPosts } from "@/lib/hidden-posts"
import { BumpDialog } from "@/components/BumpDialog"

export type ListCardKind =
  | "properties"
  | "secondhand"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "group-buying"
  | "local-food"
  | "jobs"
  | "new-store"
  | "sharing"
  | "clubs"
  | "board"

const KIND_PATH: Record<ListCardKind, string> = {
  properties: "property",
  secondhand: "secondhand",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  "group-buying": "group-buying",
  "local-food": "local-food",
  jobs: "jobs",
  "new-store": "new-store",
  sharing: "sharing",
  clubs: "clubs",
  board: "board",
}

const KIND_DELETE_API: Partial<Record<ListCardKind, string>> = {
  properties: "/api/properties",
  secondhand: "/api/secondhand",
  interior: "/api/interior",
  moving: "/api/moving",
  cleaning: "/api/cleaning",
  repair: "/api/repair",
  "group-buying": "/api/group-buying",
  "local-food": "/api/local-food",
  jobs: "/api/jobs",
  "new-store": "/api/new-store",
  sharing: "/api/sharing",
  clubs: "/api/clubs",
}

const KIND_TABLE: Record<ListCardKind, string> = {
  properties: "properties",
  secondhand: "secondhand_posts",
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
  "group-buying": "group_buying_posts",
  "local-food": "local_food",
  jobs: "jobs_posts",
  "new-store": "new_store_posts",
  sharing: "sharing_posts",
  clubs: "clubs",
  board: "board_posts",
}

// 올리기 지원 카테고리
const BUMPABLE: Set<ListCardKind> = new Set([
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

const KIND_TO_BUMP_TARGET: Partial<Record<ListCardKind, string>> = {
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

const REPORT_REASONS = [
  { value: "commercial", label: "업자 의심" },
  { value: "spam", label: "스팸/광고" },
  { value: "fraud", label: "사기 의심" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other", label: "기타" },
]

interface Props {
  kind: ListCardKind
  postId: string
  authorId?: string | null
  title?: string
  /** "row" (리스트 행, 28x28) | "thumb-overlay" (썸네일 우상단 absolute) */
  placement?: "row" | "thumb-overlay"
  /** 메뉴 액션 후 리스트 새로고침 콜백 */
  onChanged?: () => void
}

export function ListCardMenu({
  kind,
  postId,
  authorId,
  title,
  placement = "row",
  onChanged,
}: Props) {
  const router = useRouter()
  const share = useShareModal()
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState("commercial")
  const [reportDetail, setReportDetail] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const { hide } = useHiddenPosts(kind)

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
      if (role === "superadmin") {
        setIsAdmin(true)
        return
      }
      // 현재 광장 admin 만 인정 (web canAccessPlaza 미러)
      const currentPlaza = getCachedPlaza().id
      let paQ: any = supabase
        .from("plaza_admins")
        .select("role, plaza_id")
        .eq("user_id", user.id)
      if (currentPlaza) paQ = paQ.eq("plaza_id", currentPlaza)
      const { data: pa } = await paQ.maybeSingle()
      const prole = (pa as any)?.role
      setIsAdmin(prole === "admin" || prole === "super")
    })()
  }, [user])

  const isOwner = !!user && !!authorId && user.id === authorId
  const showOwnerActions = isOwner || isAdmin
  const showBump = isOwner && BUMPABLE.has(kind)

  function handleEdit() {
    setMenuOpen(false)
    setTimeout(
      () => router.push(`/${KIND_PATH[kind]}/${postId}/edit` as any),
      80,
    )
  }

  function handleDelete() {
    setMenuOpen(false)
    Alert.alert("삭제 확인", "정말로 이 글을 삭제하시겠습니까?", [
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
              const res = await gwangjangFetch(`${apiPath}/${postId}`, {
                method: "DELETE",
              })
              ok = res.ok
              if (!ok) {
                const data = await res.json().catch(() => ({}))
                Alert.alert("실패", data?.error || "삭제에 실패했습니다")
              }
            } else {
              const supabase = getSupabase()
              const { error } = await supabase
                .from(KIND_TABLE[kind])
                .delete()
                .eq("id", postId)
              ok = !error
              if (!ok)
                Alert.alert("실패", error?.message || "삭제에 실패했습니다")
            }
            if (ok) onChanged?.()
          } catch {
            Alert.alert("오류", "삭제 중 오류가 발생했습니다")
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  // 올리기 — 메뉴 닫고 BumpDialog 열기 (즉시 처리 X, 사용자가 결제 방식 선택)
  function handleBump() {
    setMenuOpen(false)
    const targetType = KIND_TO_BUMP_TARGET[kind]
    if (!targetType || !user) return
    // setMenuOpen 이 unmount 하기 전 짧은 delay 후 BumpDialog 열기 (애니메이션 겹침 방지)
    setTimeout(() => setBumpOpen(true), 120)
  }

  async function handleShare() {
    try {
      const path = KIND_PATH[kind]
      const url = buildShareUrl(path, postId)
      share.open({ message: title ? `${title}\n${url}` : url,
        url,
        title: title ?? "전원일기" })
    } catch {}
  }

  function handleHide() {
    setMenuOpen(false)
    hide(postId)
    onChanged?.()
  }

  async function handleReportSubmit() {
    if (reportSubmitting) return
    setReportSubmitting(true)
    try {
      // web /api/reports TARGET_TABLE 키와 매핑 — properties→property, group-buying→group_buying, local-food→local_food
      const targetTypeMap: Record<string, string> = {
        properties: "property",
        "group-buying": "group_buying",
        "local-food": "local_food",
        "new-store": "new-store",
      }
      const targetType = targetTypeMap[kind] ?? kind
      const res = await gwangjangFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const btnStyle =
    placement === "thumb-overlay" ? styles.thumbBtn : styles.rowBtn
  const iconColor =
    placement === "thumb-overlay" ? lightColors.ink900 : lightColors.ink900

  return (
    <>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.()
          setMenuOpen(true)
        }}
        hitSlop={8}
        style={btnStyle}
        accessibilityLabel="더보기 메뉴"
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons name="ellipsis-vertical" size={20} color={iconColor} />
        )}
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.menu}
            onPress={(e) => e.stopPropagation()}
          >
            {showOwnerActions ? (
              <>
                {showBump && (
                  <>
                    <MenuRow
                      icon="arrow-up-outline"
                      label="올리기"
                      onPress={handleBump}
                    />
                    <View style={styles.sep} />
                  </>
                )}
                <MenuRow
                  icon="create-outline"
                  label="수정하기"
                  onPress={handleEdit}
                />
                <MenuRow
                  icon="trash-outline"
                  label="삭제하기"
                  onPress={handleDelete}
                  danger
                />
              </>
            ) : (
              <>
                <MenuRow
                  icon="share-social-outline"
                  label="공유하기"
                  onPress={() => {
                    setMenuOpen(false)
                    setTimeout(handleShare, 80)
                  }}
                />
                <MenuRow
                  icon="eye-off-outline"
                  label="숨기기"
                  onPress={handleHide}
                />
                <View style={styles.sep} />
                <MenuRow
                  icon="megaphone-outline"
                  label="신고하기"
                  danger
                  onPress={() => {
                    setMenuOpen(false)
                    if (!user) {
                      setTimeout(
                        () => router.push("/auth/login" as any),
                        80,
                      )
                      return
                    }
                    setTimeout(() => setReportOpen(true), 80)
                  }}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 신고 모달 */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !reportSubmitting && setReportOpen(false)}
      >
        <View style={styles.reportBackdrop}>
          <View style={styles.reportCard}>
            <Text style={styles.reportTitle}>게시글 신고</Text>
            <Text style={styles.reportSub}>
              신고 사유를 선택해주세요. 운영진이 확인 후 조치합니다.
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setReportReason(r.value)}
                  style={[
                    styles.reasonRow,
                    reportReason === r.value && styles.reasonRowActive,
                  ]}
                >
                  <Ionicons
                    name={
                      reportReason === r.value
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={18}
                    color={
                      reportReason === r.value
                        ? lightColors.primary
                        : lightColors.ink500
                    }
                  />
                  <Text style={styles.reasonText}>{r.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              value={reportDetail}
              onChangeText={setReportDetail}
              placeholder="상세 내용 (선택)"
              placeholderTextColor={lightColors.ink500}
              multiline
              style={styles.reportInput}
            />
            <View style={styles.reportBtnRow}>
              <Pressable
                onPress={() => !reportSubmitting && setReportOpen(false)}
                accessibilityLabel="취소"
                accessibilityRole="button"
                style={[styles.reportBtn, styles.reportCancelBtn]}
              >
                <Text style={styles.reportCancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleReportSubmit}
                disabled={reportSubmitting}
                accessibilityLabel="신고 접수"
                accessibilityRole="button"
                style={[styles.reportBtn, styles.reportSubmitBtn]}
              >
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.reportSubmitText}>신고 접수</Text>
                )}
              </Pressable>
            </View>
          </View>
          {share.element}
        </View>
      </Modal>

      {/* 올리기 모달 — PostActionsMenu 와 동일 UI */}
      {KIND_TO_BUMP_TARGET[kind] && (
        <BumpDialog
          visible={bumpOpen}
          onClose={() => setBumpOpen(false)}
          targetType={KIND_TO_BUMP_TARGET[kind]!}
          targetId={postId}
          onBumped={() => onChanged?.()}
        />
      )}
    </>
  )
}

function MenuRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: any
  label: string
  onPress: () => void
  danger?: boolean
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: lightColors.muted }]}>
      <Ionicons
        name={icon}
        size={18}
        color={danger ? "#dc2626" : lightColors.ink900}
      />
      <Text style={[styles.menuRowText, danger && { color: "#dc2626" }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.muted,
  },
  thumbBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    zIndex: 10,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menu: {
    width: 240,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  sep: { height: 1, backgroundColor: lightColors.border, marginVertical: 2 },

  // Report modal
  reportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  reportCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: lightColors.ink900,
  },
  reportSub: {
    fontSize: 12,
    color: lightColors.ink500,
    marginTop: 4,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reasonRowActive: {
    backgroundColor: lightColors.primary + "0F",
  },
  reasonText: { fontSize: 14, color: lightColors.ink900 },
  reportInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
    fontSize: 13,
    color: lightColors.ink900,
  },
  reportBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  reportBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCancelBtn: {
    backgroundColor: lightColors.muted,
  },
  reportCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  reportSubmitBtn: {
    backgroundColor: lightColors.primary,
  },
  reportSubmitText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
})
