/**
 * 서비스 요청 상세 — 매물 요청 상세(requests/[id]/index.tsx) 미러.
 *
 * service_requests + service_request_responses 직접 Supabase 쿼리.
 * 전문가 응답 강조, 서비스 유형별 전문가 제한, 소유자 상태 변경.
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useIsAdmin } from "@/lib/useIsAdmin"
import { PostActionsMenu } from "@/components/PostActionsMenu"

const EMERALD = "#10b981"

const SERVICE_TYPE_LABEL: Record<string, string> = {
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

const SERVICE_TYPE_COLOR: Record<string, string> = {
  interior: "#a855f7",
  moving: "#eab308",
  cleaning: "#38bdf8",
  repair: "#f97316",
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "모집중", color: "#15803d", bg: "rgba(16,185,129,0.15)" },
  matched: { label: "매칭됨", color: "#1d4ed8", bg: "rgba(59,130,246,0.15)" },
  closed: { label: "종료", color: lightColors.ink500, bg: lightColors.muted },
}

interface ServiceRequest {
  id: string
  user_id: string
  title: string
  content: string
  service_type: string | null
  region: string | null
  district: string | null
  dong: string | null
  budget_min: number | null
  budget_max: number | null
  desired_date: string | null
  status: string
  views: number
  created_at: string
  author_nickname?: string | null
  author_avatar?: string | null
  author_account_type?: string | null
}

interface ServiceResponse {
  id: string
  request_id: string
  user_id: string
  content: string
  created_at: string
  responder_nickname?: string | null
  responder_avatar?: string | null
  responder_account_type?: string | null
}

function formatBudget(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => {
    const eok = Math.floor(n / 100000000)
    const man = Math.floor((n % 100000000) / 10000)
    if (eok > 0) return man > 0 ? `${eok}억 ${man}만원` : `${eok}억원`
    return `${man}만원`
  }
  if (min != null && max != null) return `${fmt(min)} ~ ${fmt(max)}`
  if (max != null) return `최대 ${fmt(max)}`
  return `${fmt(min!)} ~`
}

/** 서비스 유형에 매칭되는 account_type 맵 */
const SERVICE_TYPE_ACCOUNT_MAP: Record<string, string> = {
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
}

export default function ServiceRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const plazaId = useCurrentPlaza()

  const [req, setReq] = useState<ServiceRequest | null>(null)
  const [responses, setResponses] = useState<ServiceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [responseText, setResponseText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const supabase = getSupabase()

      // 요청 본문
      let q: any = supabase.from("service_requests").select("*").eq("id", id)
      if (plazaId) q = q.eq("plaza_id", plazaId)
      const { data: r, error } = await q.maybeSingle()
      if (error || !r) {
        setReq(null)
        setResponses([])
        return
      }

      // 작성자 정보 + 응답 리스트 병렬 조회
      const [authorRes, authorPpRes, respsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url, account_type")
          .eq("id", r.user_id)
          .maybeSingle(),
        plazaId
          ? supabase
              .from("plaza_profiles")
              .select("nickname, avatar_url, account_type")
              .eq("user_id", r.user_id)
              .eq("plaza_id", plazaId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase
          .from("service_request_responses")
          .select("*")
          .eq("request_id", id)
          .order("created_at", { ascending: true }),
      ])

      const authorRaw: any = authorRes.data || {}
      const authorPp: any = authorPpRes?.data || {}
      const author = {
        ...authorRaw,
        nickname: authorPp.nickname ?? authorRaw.nickname,
        avatar_url: authorPp.avatar_url ?? authorRaw.avatar_url,
        account_type: authorPp.account_type ?? authorRaw.account_type,
      }

      // 응답자 프로필 일괄 조회
      const resps: any[] = (respsRes as any).data ?? []
      const responderIds = [...new Set(resps.map((x: any) => x.user_id))]
      const respProfiles: Record<string, any> = {}
      if (responderIds.length > 0) {
        const [rpRes, rpPpRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, nickname, full_name, avatar_url, account_type")
            .in("id", responderIds),
          plazaId
            ? supabase
                .from("plaza_profiles")
                .select("user_id, nickname, avatar_url, account_type")
                .in("user_id", responderIds)
                .eq("plaza_id", plazaId)
            : Promise.resolve({ data: null } as any),
        ])
        const ppMap: Record<string, any> = {}
        ;(rpPpRes?.data as any[] | null)?.forEach((p: any) => { ppMap[p.user_id] = p })
        ;(rpRes.data as any[] | null)?.forEach((p: any) => {
          const pp = ppMap[p.id] || {}
          respProfiles[p.id] = {
            ...p,
            nickname: pp.nickname ?? p.nickname,
            avatar_url: pp.avatar_url ?? p.avatar_url,
            account_type: pp.account_type ?? p.account_type,
          }
        })
      }

      // 조회수 증가
      supabase
        .rpc("increment_view_count", {
          p_table: "service_requests",
          p_id: id,
          p_column: "views",
        })
        .then(() => {}, () => {})

      setReq({
        ...r,
        author_nickname: author.nickname ?? null,
        author_avatar: author.avatar_url ?? null,
        author_account_type: author.account_type ?? null,
      })
      setResponses(
        resps.map((x: any) => ({
          ...x,
          responder_nickname: respProfiles[x.user_id]?.nickname ?? null,
          responder_avatar: respProfiles[x.user_id]?.avatar_url ?? null,
          responder_account_type: respProfiles[x.user_id]?.account_type ?? null,
        })),
      )
    } catch (e) {
      console.warn("[service-request detail] load failed", e)
      setReq(null)
      setResponses([])
    } finally {
      setLoading(false)
    }
  }, [id, plazaId])

  useEffect(() => {
    if (!user) {
      reload()
      return
    }
    // 본인 account_type 조회 (응답 권한 체크)
    const supabase = getSupabase()
    Promise.all([
      supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
      plazaId
        ? supabase.from("plaza_profiles").select("account_type")
            .eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]).then(([profRes, ppRes]) => {
      const pp: any = ppRes?.data
      setAccountType(pp?.account_type ?? (profRes.data as any)?.account_type ?? null)
    })
    reload()
  }, [user, reload])

  /** 응답 권한 체크: 서비스 유형과 매칭되는 account_type 또는 admin/superadmin */
  function canRespond(): boolean {
    if (!user || !req) return false
    if (isAdmin) return true
    if (accountType === "admin" || accountType === "superadmin") return true
    const requiredType = SERVICE_TYPE_ACCOUNT_MAP[req.service_type ?? ""]
    return !!requiredType && accountType === requiredType
  }

  async function handleSubmit() {
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (!responseText.trim()) return
    setSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from("service_request_responses")
        .insert({
          request_id: id,
          user_id: user.id,
          content: responseText.trim(),
        })
      if (error) {
        Alert.alert("응답 실패", error.message)
        return
      }
      setResponseText("")
      reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStatus(s: string) {
    if (!id) return
    const supabase = getSupabase()
    const { error } = await supabase
      .from("service_requests")
      .update({ status: s })
      .eq("id", id)
    if (error) {
      Alert.alert("상태 변경 실패", error.message)
      return
    }
    reload()
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={EMERALD} />
      </SafeAreaView>
    )
  }
  if (!req) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name="document-text-outline" size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          요청을 찾을 수 없습니다
        </Text>
      </SafeAreaView>
    )
  }

  const isOwner = !!user && user.id === req.user_id
  const statusInfo = STATUS_LABEL[req.status] ?? STATUS_LABEL.open
  const authorName = req.author_nickname || "익명"
  const region = [req.region, req.district, req.dong].filter(Boolean).join(" ")
  const serviceType = req.service_type ?? "repair"
  const serviceColor = SERVICE_TYPE_COLOR[serviceType] ?? "#6b7280"
  const serviceLabel = SERVICE_TYPE_LABEL[serviceType] ?? serviceType
  const budget = formatBudget(req.budget_min, req.budget_max)
  const respondAllowed = canRespond()

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>도와주세요</Text>
        <View style={styles.headerRight}>
          <PostActionsMenu
            kind="service-requests"
            postId={id!}
            authorId={req.user_id}
            editHref={`/service-requests/${id}/edit`}
            onDeleted={() => router.back()}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing[4], paddingBottom: 40 }}>
          {/* 요청 카드 */}
          <View style={styles.reqCard}>
            <View style={styles.chipRow}>
              {/* 서비스 유형 뱃지 (크게) */}
              <View style={[styles.serviceTypeBadge, { backgroundColor: serviceColor + "20", borderColor: serviceColor + "40" }]}>
                <Ionicons name="construct" size={12} color={serviceColor} />
                <Text style={[styles.serviceTypeBadgeText, { color: serviceColor }]}>
                  {serviceLabel}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: statusInfo.bg }]}>
                <Text style={[styles.chipText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>

            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.content}>{req.content}</Text>

            <View style={styles.metaGrid}>
              {!!region && (
                <View style={styles.metaCell}>
                  <Ionicons name="location-outline" size={14} color={EMERALD} />
                  <Text style={styles.metaText}>{region}</Text>
                </View>
              )}
              {!!budget && (
                <View style={styles.metaCell}>
                  <Ionicons name="wallet-outline" size={14} color={EMERALD} />
                  <Text style={[styles.metaText, { fontWeight: "600", color: lightColors.ink900 }]}>
                    {budget}
                  </Text>
                </View>
              )}
              {!!req.desired_date && (
                <View style={styles.metaCell}>
                  <Ionicons name="calendar-outline" size={14} color={EMERALD} />
                  <Text style={styles.metaText}>
                    {new Date(req.desired_date).toLocaleDateString("ko-KR")}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>{authorName}</Text>
              <Text style={styles.footerText}>
                조회 {req.views} · {new Date(req.created_at).toLocaleDateString("ko-KR")}
              </Text>
            </View>

            {/* 소유자 상태 변경 */}
            {isOwner && (
              <View style={styles.statusRow}>
                {(["open", "matched", "closed"] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => changeStatus(s)}
                    disabled={req.status === s}
                    style={[
                      styles.statusBtn,
                      req.status === s
                        ? { backgroundColor: EMERALD }
                        : { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        req.status === s
                          ? { color: "#ffffff" }
                          : { color: lightColors.ink500 },
                      ]}
                    >
                      {STATUS_LABEL[s].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* 응답 섹션 */}
          <View style={styles.responsesHead}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={EMERALD} />
            <Text style={styles.responsesTitle}>
              응답 <Text style={{ color: EMERALD }}>{responses.length}</Text>
            </Text>
          </View>

          {responses.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                아직 응답이 없어요. 전문가의 응답을 기다려주세요
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {responses.map((r) => {
                const rn = r.responder_nickname || "익명"
                const isExpert =
                  !!r.responder_account_type &&
                  r.responder_account_type === SERVICE_TYPE_ACCOUNT_MAP[serviceType]
                return (
                  <View
                    key={r.id}
                    style={[
                      styles.respCard,
                      isExpert && {
                        borderColor: EMERALD + "60",
                        backgroundColor: EMERALD + "0A",
                      },
                    ]}
                  >
                    <View style={styles.respHead}>
                      <View style={styles.respHeadLeft}>
                        <Text style={styles.respName}>{rn}</Text>
                        {isExpert && (
                          <View style={[styles.expertBadge, { backgroundColor: serviceColor }]}>
                            <Ionicons name="checkmark-circle" size={10} color="#ffffff" />
                            <Text style={styles.expertBadgeText}>
                              {serviceLabel} 전문가
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.respTime}>
                        {new Date(r.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </View>
                    <Text style={styles.respBody}>{r.content}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* 응답 작성 폼 */}
          {req.status === "open" && (
            <View style={styles.formBox}>
              {!user ? (
                <Pressable
                  onPress={() => router.push("/auth/login")}
                  style={{ paddingVertical: 12, alignItems: "center" }}
                >
                  <Text style={{ color: EMERALD, fontWeight: "600" }}>
                    로그인하고 응답하기
                  </Text>
                </Pressable>
              ) : !respondAllowed ? (
                <View style={styles.restrictedNote}>
                  <Ionicons name="lock-closed-outline" size={16} color={lightColors.ink500} />
                  <Text style={styles.restrictedNoteText}>
                    이 요청에는 {serviceLabel} 전문가만 응답할 수 있습니다
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.expertNote}>
                    <Ionicons name="checkmark-circle" size={14} color={EMERALD} />
                    <Text style={styles.expertNoteText}>
                      {serviceLabel} 전문가로 응답합니다
                    </Text>
                  </View>
                  <TextInput
                    value={responseText}
                    onChangeText={setResponseText}
                    placeholder="요청자에게 도움이 될 정보를 적어주세요"
                    placeholderTextColor={lightColors.ink500}
                    multiline
                    style={styles.textarea}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                    <Pressable
                      onPress={handleSubmit}
                      disabled={submitting || !responseText.trim()}
                      style={[
                        styles.submitBtn,
                        (submitting || !responseText.trim()) && { opacity: 0.5 },
                      ]}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons name="send" size={14} color="#ffffff" />
                      )}
                      <Text style={styles.submitBtnText}>응답 보내기</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginLeft: 4,
  },
  headerRight: { flexDirection: "row" },

  reqCard: {
    padding: spacing[4],
    borderRadius: radius.lg ?? 16,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    marginBottom: spacing[4],
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing[3] },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: "700" },
  serviceTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  serviceTypeBadgeText: { fontSize: 12, fontWeight: "700" },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[3],
  },
  content: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    lineHeight: 22,
    marginBottom: spacing[4],
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  metaCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: "48%",
  },
  metaText: { fontSize: 12, color: lightColors.ink500 },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  footerText: { fontSize: 11, color: lightColors.ink500 },

  statusRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: "center",
  },
  statusBtnText: { fontSize: 12, fontWeight: "600" },

  responsesHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing[3],
  },
  responsesTitle: { fontSize: fontSize.sm, fontWeight: "700", color: lightColors.ink900 },

  emptyBox: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    backgroundColor: lightColors.muted,
    alignItems: "center",
  },
  emptyText: { fontSize: 12, color: lightColors.ink500, textAlign: "center" },

  respCard: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  respHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  respHeadLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  respName: { fontSize: 12, fontWeight: "700", color: lightColors.ink900 },
  expertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  expertBadgeText: { fontSize: 9, fontWeight: "700", color: "#ffffff" },
  respTime: { fontSize: 10, color: lightColors.ink500 },
  respBody: { fontSize: 13, color: lightColors.ink900, lineHeight: 20 },

  formBox: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.lg ?? 16,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  restrictedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    justifyContent: "center",
  },
  restrictedNoteText: { fontSize: 13, color: lightColors.ink500 },
  expertNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  expertNoteText: { fontSize: 11, color: EMERALD },
  textarea: {
    minHeight: 80,
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    textAlignVertical: "top",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: EMERALD,
  },
  submitBtnText: { color: "#ffffff", fontSize: fontSize.sm, fontWeight: "600" },
})
