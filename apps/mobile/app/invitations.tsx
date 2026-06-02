/**
 * 초대 요청 — 광장 web /invitations 1:1 매핑.
 *
 * 5종 전문가(공인중개사/인테리어/이사/청소/수리) 만 진입.
 * 받은 초대 요청을 대기/처리 섹션으로 보여주고 수락 시 채팅방으로 이동.
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { getCachedPlaza } from "@/lib/plaza"

interface Inviter {
  id: string
  nickname: string | null
  full_name: string | null
  avatar_url: string | null
}
interface Property {
  id: string
  title: string
  address: string
  images: string[] | null
}
interface Invitation {
  id: string
  status: "pending" | "accepted" | "rejected" | string
  message: string | null
  created_at: string
  inviter_id: string
  chat_room_id: string
  property_id: string | null
  inviter: Inviter | null
  property: Property | null
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return "방금 전"
  if (m < 60) return `${m}분 전`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(diff / 86400000)
  if (d < 7) return `${d}일 전`
  return new Date(t).toLocaleDateString("ko-KR")
}

export default function InvitationsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [list, setList] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const fetchInvitations = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from("expert_invitations")
        .select(
          `
          id, status, message, created_at, inviter_id, chat_room_id, property_id,
          inviter:inviter_id ( id, nickname, full_name, avatar_url ),
          property:property_id ( id, title, address, images )
        `,
        )
        .eq("expert_id", user.id)
        .order("created_at", { ascending: false })
      setList((data as any) ?? [])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  async function respond(inv: Invitation, response: "accepted" | "rejected") {
    if (!user) return
    setBusy(inv.id)
    try {
      const supabase = getSupabase()

      // 1) invitations row 업데이트 — expert_id=user.id (RLS) 매칭 시 통과
      const { error: upErr } = await supabase
        .from("expert_invitations")
        .update({
          status: response,
          responded_at: new Date().toISOString(),
        })
        .eq("id", inv.id)
        .eq("expert_id", user.id)
        .eq("status", "pending")
      if (upErr) {
        Alert.alert("응답 실패", upErr.message ?? "처리 중 오류")
        return
      }

      // 2) 수락이면 시스템 메시지 + 알림
      if (response === "accepted") {
        // 🅲 현재 광장 plaza_profiles 우선 (nickname/account_type)
        const plazaId = getCachedPlaza()?.id
        const [profRes, ppRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("nickname, full_name, account_type")
            .eq("id", user.id)
            .maybeSingle(),
          plazaId
            ? supabase
                .from("plaza_profiles")
                .select("nickname, account_type")
                .eq("user_id", user.id)
                .eq("plaza_id", plazaId)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        const prof: any = profRes?.data || {}
        const pp: any = (ppRes as any)?.data || {}
        const labelMap: Record<string, string> = {
          agent: "공인중개사",
          interior: "인테리어 전문가",
          moving: "이사 전문가",
          cleaning: "청소 전문가",
          repair: "수리 전문가",
        }
        const name = pp.nickname || prof.nickname || prof.full_name || "전문가"
        const label = labelMap[(pp.account_type ?? prof.account_type) as string] || "전문가"
        await supabase.from("messages").insert({
          chat_room_id: inv.chat_room_id,
          sender_id: user.id,
          content: `${name}(${label})님이 채팅방에 참여했습니다.`,
          is_system: true,
        }).then(() => {}, () => {})
      }

      // 3) 초대자에게 알림 (RLS notifications_insert_as_actor 정책)
      try {
        // 🅲 현재 광장 plaza_profiles 우선 (nickname)
        const plazaId = getCachedPlaza()?.id
        const [rpRes, rppRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("nickname, full_name")
            .eq("id", user.id)
            .maybeSingle(),
          plazaId
            ? supabase
                .from("plaza_profiles")
                .select("nickname")
                .eq("user_id", user.id)
                .eq("plaza_id", plazaId)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        const rp: any = rpRes?.data || {}
        const rpp: any = (rppRes as any)?.data || {}
        const rname = rpp.nickname || rp.nickname || rp.full_name || "전문가"
        await supabase.from("notifications").insert({
          user_id: inv.inviter_id,
          type: "expert_invitation_response",
          title: response === "accepted" ? "전문가 초대 수락" : "전문가 초대 거절",
          message:
            response === "accepted"
              ? `${rname}님이 초대를 수락했습니다`
              : `${rname}님이 초대를 거절했습니다`,
          link:
            response === "accepted"
              ? `/chat/${inv.chat_room_id}`
              : "/invitations",
          property_id: inv.property_id || null,
          actor_id: user.id,
        })
      } catch {}

      if (response === "accepted") {
        router.push(`/chat/${inv.chat_room_id}` as any)
      } else {
        fetchInvitations()
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "네트워크 오류")
    } finally {
      setBusy(null)
    }
  }

  async function deleteInv(inv: Invitation) {
    if (!user) return
    setBusy(inv.id)
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from("expert_invitations")
        .delete()
        .eq("id", inv.id)
        .eq("expert_id", user.id)
      if (error) {
        Alert.alert("삭제 실패", error.message ?? "")
        return
      }
      setList((arr) => arr.filter((x) => x.id !== inv.id))
    } finally {
      setBusy(null)
    }
  }

  const pending = list.filter((x) => x.status === "pending")
  const processed = list.filter((x) => x.status !== "pending")

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>초대 요청</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="mail-open-outline" size={56} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>받은 초대 요청이 없습니다</Text>
          <Text style={styles.emptyHint}>
            고객이 전문가 초대를 보내면 여기에 표시됩니다.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(pending.length > 0
              ? [{ kind: "section", label: `대기 중 (${pending.length})` } as any, ...pending]
              : []),
            ...(processed.length > 0
              ? [{ kind: "section", label: "처리 완료" } as any, ...processed]
              : []),
          ]}
          keyExtractor={(it: any, i) => it.kind === "section" ? `s-${i}` : it.id}
          renderItem={({ item }: any) => {
            if (item.kind === "section") {
              return (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>{item.label}</Text>
                </View>
              )
            }
            const inv = item as Invitation
            const inviterName = inv.inviter?.nickname ?? inv.inviter?.full_name ?? "사용자"
            return (
              <View style={styles.card}>
                {/* 초대자 */}
                <View style={styles.inviterRow}>
                  {inv.inviter?.avatar_url ? (
                    <Image
                      source={{ uri: inv.inviter.avatar_url }} cachePolicy="memory-disk"
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>
                        {(inviterName ?? "?").charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inviterName} numberOfLines={1}>
                      {inviterName}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={11} color={lightColors.ink500} />
                      <Text style={styles.metaText}>{timeAgo(inv.created_at)}</Text>
                    </View>
                  </View>
                  {inv.status === "pending" && (
                    <View style={[styles.statusPill, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
                      <Text style={[styles.statusText, { color: lightColors.primary }]}>대기</Text>
                    </View>
                  )}
                  {inv.status === "accepted" && (
                    <View style={[styles.statusPill, { backgroundColor: "rgba(34,197,94,0.1)" }]}>
                      <Text style={[styles.statusText, { color: "#16a34a" }]}>수락됨</Text>
                    </View>
                  )}
                  {inv.status === "rejected" && (
                    <View style={[styles.statusPill, { backgroundColor: "rgba(239,68,68,0.1)" }]}>
                      <Text style={[styles.statusText, { color: "#dc2626" }]}>거절됨</Text>
                    </View>
                  )}
                </View>

                {/* 매물 */}
                {inv.property && (
                  <View style={styles.propertyRow}>
                    {inv.property.images?.[0] && (
                      <Image
                        source={{ uri: inv.property.images[0] }} cachePolicy="memory-disk"
                        style={styles.propertyImg}
                      />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.propertyTitle} numberOfLines={1}>
                        {inv.property.title}
                      </Text>
                      <View style={styles.metaRow}>
                        <Ionicons
                          name="location-outline"
                          size={11}
                          color={lightColors.ink500}
                        />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {inv.property.address}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* 메시지 */}
                {inv.message && <Text style={styles.message}>{inv.message}</Text>}

                {/* 버튼 */}
                {inv.status === "pending" ? (
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() =>
                        Alert.alert("초대 거절", "이 초대를 거절하시겠습니까?", [
                          { text: "취소", style: "cancel" },
                          { text: "거절", style: "destructive", onPress: () => respond(inv, "rejected") },
                        ])
                      }
                      disabled={busy === inv.id}
                      style={({ pressed }) => [
                        styles.btnGhost,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons name="close" size={14} color={lightColors.ink700} />
                      <Text style={styles.btnGhostText}>거절</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => respond(inv, "accepted")}
                      disabled={busy === inv.id}
                      style={({ pressed }) => [
                        styles.btnPrimary,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      {busy === inv.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                          <Text style={styles.btnPrimaryText}>수락하고 채팅</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() =>
                        Alert.alert("초대 삭제", "이 초대를 삭제하시겠습니까?", [
                          { text: "취소", style: "cancel" },
                          { text: "삭제", style: "destructive", onPress: () => deleteInv(inv) },
                        ])
                      }
                      disabled={busy === inv.id}
                      style={({ pressed }) => [
                        styles.btnGhost,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={14} color={lightColors.ink500} />
                      <Text style={styles.btnGhostText}>삭제</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )
          }}
          contentContainerStyle={{ paddingBottom: spacing[6] }}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6, alignItems: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginTop: spacing[3],
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: "#f8fafc",
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: lightColors.ink700,
  },
  card: {
    backgroundColor: lightColors.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    gap: spacing[3],
  },
  inviterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#e2e8f0" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 16, fontWeight: "700", color: "#64748b" },
  inviterName: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  metaText: { fontSize: 11, color: lightColors.ink500, flexShrink: 1 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  propertyImg: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#e2e8f0" },
  propertyTitle: { fontSize: 13, fontWeight: "600", color: lightColors.ink900 },
  message: { fontSize: 13, color: lightColors.ink700, lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 8 },
  btnGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  btnGhostText: { color: lightColors.ink700, fontSize: 13, fontWeight: "600" },
  btnPrimary: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
  },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
})
