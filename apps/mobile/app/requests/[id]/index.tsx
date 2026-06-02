/**
 * 매물 요청 상세 — 광장 web /requests/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 매물요청 + 호스트 메뉴)
 *   - 요청 카드: 상태 배지(모집중/매칭됨/종료) + 거래유형 + 매물유형 칩, 제목, 본문, 지역/예산/입주일 그리드, 푸터(작성자·조회·날짜)
 *   - 호스트 상태 변경 row (본인만): open/matched/closed 토글
 *   - 응답 섹션: 갯수 + 응답 카드 리스트 (공인중개사 강조 그라디언트)
 *   - 응답 작성 폼 (status==="open" 일 때만, agent 안내 라벨)
 *
 * 응답 form 은 RN 도 직접 작성 (광장 web 의 textarea + 보내기 버튼).
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
import {
  createRequestResponse,
  formatBudget,
  getPropertyRequest,
  setRequestStatus,
  type PropertyRequest,
  type RequestResponse,
  type RequestStatus,
} from "@gwangjang/features/requests"
import { useAuth } from "@/lib/auth-context"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { getCachedPlaza, useCurrentPlaza } from "@/lib/plaza"
import { PostActionsMenu } from "@/components/PostActionsMenu"

const ROSE = "#e11d48"

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "모집중", color: "#15803d", bg: "rgba(16,185,129,0.15)" },
  matched: { label: "매칭됨", color: "#1d4ed8", bg: "rgba(59,130,246,0.15)" },
  closed: { label: "종료", color: lightColors.ink500, bg: lightColors.muted },
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()

  const [req, setReq] = useState<PropertyRequest | null>(null)
  const [responses, setResponses] = useState<RequestResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [responseText, setResponseText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // plaza subdomain 직접 호출 — host 기반 plaza 인식 (x-plaza 헤더 의존 X)
  const fetcher = useCallback(
    async (input: string, init?: RequestInit) => {
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
      return fetch(`https://${plaza}.gwangjang.app${input}`, {
        ...init,
        headers,
        cache: "no-store",
      } as any)
    },
    [],
  )

  const plazaId = useCurrentPlaza()
  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      // supabase 직접 쿼리 — 브라우저 CORS / API 호출 우회 (web /api/property-requests/[id] 미러)
      const supabase = getSupabase()
      let q: any = supabase.from("property_requests").select("*").eq("id", id)
      if (plazaId) q = q.eq("plaza_id", plazaId)
      const { data: r, error } = await q.maybeSingle()
      if (error || !r) {
        setReq(null)
        setResponses([])
        return
      }
      // 작성자 정보 (plaza 격리) + 응답 리스트 — 서로 독립이라 같이 묶음.
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
          .from("property_request_responses")
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
      const resps = (respsRes as any).data
      const responderIds = [...new Set((resps ?? []).map((x: any) => x.user_id))]
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
      // 조회수 증가 — atomic RPC (race-free, web 와 동일)
      supabase
        .rpc("increment_view_count", {
          p_table: "property_requests",
          p_id: id,
          p_column: "views",
        })
        .then(() => {}, () => {})
      setReq({
        ...r,
        author_nickname: (author as any)?.nickname ?? null,
        author_avatar: (author as any)?.avatar_url ?? null,
        author_account_type: (author as any)?.account_type ?? null,
      } as any)
      setResponses(
        (resps ?? []).map((x: any) => ({
          ...x,
          responder_nickname: respProfiles[x.user_id]?.nickname ?? null,
          responder_avatar: respProfiles[x.user_id]?.avatar_url ?? null,
          responder_account_type: respProfiles[x.user_id]?.account_type ?? null,
        })),
      )
    } catch (e) {
      console.warn("[request detail] load failed", e)
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
    // 본인 account_type 조회 (응답 폼 안내용) — 🅲 광장 격리: plaza_profiles 우선
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

  async function handleSubmit() {
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (!responseText.trim()) return
    setSubmitting(true)
    try {
      const r = await createRequestResponse(fetcher, id!, responseText.trim())
      if (!r.ok) {
        Alert.alert("응답 실패", r.error ?? "")
        return
      }
      setResponseText("")
      reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStatus(s: RequestStatus) {
    if (!id) return
    try {
      const ok = await setRequestStatus(fetcher, id, s)
      if (ok) reload()
      else Alert.alert("상태 변경 실패", "다시 시도해 주세요.")
    } catch (e: any) {
      Alert.alert("상태 변경 실패", e?.message || "다시 시도해 주세요.")
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
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
  const authorName = req.author?.nickname || req.author?.full_name || "익명"
  const region = [req.region, req.district, req.dong].filter(Boolean).join(" ")

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>매물요청</Text>
        <View style={styles.headerRight}>
          <PostActionsMenu
            kind="property-requests"
            postId={id!}
            authorId={req.user_id}
            editHref={`/requests/${id}/edit`}
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
              <View style={[styles.chip, { backgroundColor: statusInfo.bg }]}>
                <Text style={[styles.chipText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
              {!!req.transaction_type && (
                <View style={[styles.chip, { backgroundColor: "rgba(225,29,72,0.1)" }]}>
                  <Text style={[styles.chipText, { color: "#be123c" }]}>
                    {req.transaction_type}
                  </Text>
                </View>
              )}
              {!!req.property_type && (
                <View style={[styles.chip, { backgroundColor: lightColors.muted }]}>
                  <Text style={[styles.chipText, { color: lightColors.ink500 }]}>
                    {req.property_type}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.title}>{req.title}</Text>
            <Text style={styles.content}>{req.content}</Text>

            <View style={styles.metaGrid}>
              {!!region && (
                <View style={styles.metaCell}>
                  <Ionicons name="location-outline" size={14} color={ROSE} />
                  <Text style={styles.metaText}>{region}</Text>
                </View>
              )}
              {(req.budget_min || req.budget_max) && (
                <View style={styles.metaCell}>
                  <Text style={styles.metaText}>💰</Text>
                  <Text style={[styles.metaText, { fontWeight: "600", color: lightColors.ink900 }]}>
                    {formatBudget(req.budget_min, req.budget_max)}
                  </Text>
                </View>
              )}
              {!!req.move_in_date && (
                <View style={styles.metaCell}>
                  <Ionicons name="calendar-outline" size={14} color={ROSE} />
                  <Text style={styles.metaText}>
                    {new Date(req.move_in_date).toLocaleDateString("ko-KR")}
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
                        ? { backgroundColor: ROSE }
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
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={ROSE} />
            <Text style={styles.responsesTitle}>
              응답 <Text style={{ color: ROSE }}>{responses.length}</Text>
            </Text>
          </View>

          {responses.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {accountType === "agent"
                  ? "아직 응답이 없어요. 첫 번째로 매물을 추천해보세요!"
                  : "아직 응답이 없어요. 공인중개사의 응답을 기다려주세요"}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {responses.map((r) => {
                const rn = r.author?.nickname || r.author?.full_name || "익명"
                const isAgent = r.author?.account_type === "agent"
                return (
                  <View
                    key={r.id}
                    style={[
                      styles.respCard,
                      isAgent && {
                        borderColor: "#bfdbfe",
                        backgroundColor: "#eff6ff",
                      },
                    ]}
                  >
                    <View style={styles.respHead}>
                      <View style={styles.respHeadLeft}>
                        <Text style={styles.respName}>{rn}</Text>
                        {isAgent && (
                          <View style={styles.agentBadge}>
                            <Ionicons name="briefcase" size={10} color="#ffffff" />
                            <Text style={styles.agentBadgeText}>공인중개사</Text>
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
                  <Text style={{ color: ROSE, fontWeight: "600" }}>
                    로그인하고 응답하기
                  </Text>
                </Pressable>
              ) : (
                <>
                  {accountType === "agent" && (
                    <View style={styles.agentNote}>
                      <Ionicons name="checkmark-circle" size={14} color="#1d4ed8" />
                      <Text style={styles.agentNoteText}>
                        공인중개사로 응답합니다 — 매물을 추천해보세요
                      </Text>
                    </View>
                  )}
                  <TextInput
                    value={responseText}
                    onChangeText={setResponseText}
                    placeholder={
                      accountType === "agent"
                        ? "추천하실 매물과 간단한 설명을 적어주세요"
                        : "요청자에게 남길 메시지"
                    }
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
  agentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#3b82f6",
  },
  agentBadgeText: { fontSize: 9, fontWeight: "700", color: "#ffffff" },
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
  agentNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  agentNoteText: { fontSize: 11, color: "#1d4ed8" },
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
    backgroundColor: ROSE,
  },
  submitBtnText: { color: "#ffffff", fontSize: fontSize.sm, fontWeight: "600" },
})
