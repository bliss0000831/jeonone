import { createClient } from "@/lib/supabase/server"

/**
 * 사용자 차단 상태 확인.
 * user_bans 테이블 (활성 차단: lifted_at IS NULL + expires_at 미만료)
 * 또는 profiles.status = 'banned'/'suspended' 체크.
 * @returns { banned: boolean, reason?: string, until?: string }
 */
export async function checkUserBan(
  userId: string,
): Promise<{ banned: boolean; reason?: string; until?: string }> {
  const supabase = await createClient()

  // 1. user_bans 테이블에서 활성 차단 확인
  //    활성 = lifted_at IS NULL (해제되지 않음)
  const { data: ban } = await supabase
    .from("user_bans")
    .select("reason, expires_at, scope")
    .eq("user_id", userId)
    .is("lifted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ban) {
    // 기간 만료 체크
    if (ban.expires_at && new Date(ban.expires_at) < new Date()) {
      // 만료된 차단 — 별도 처리 없이 통과 (admin DELETE 로 정리)
      return { banned: false }
    }
    return {
      banned: true,
      reason: ban.reason ?? undefined,
      until: ban.expires_at ?? undefined,
    }
  }

  // 2. profiles.status 체크 (legacy / 직접 status 변경한 경우)
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle()

  if ((profile as any)?.status === "banned" || (profile as any)?.status === "suspended") {
    return {
      banned: true,
      reason: `계정이 ${(profile as any).status === "banned" ? "차단" : "정지"}되었습니다.`,
    }
  }

  return { banned: false }
}

/**
 * API route에서 사용할 간편 가드.
 * 차단된 사용자면 403 Response 반환, 아니면 null.
 */
export async function banGuardResponse(
  userId: string,
): Promise<Response | null> {
  const { banned, reason, until } = await checkUserBan(userId)
  if (!banned) return null

  const message = until
    ? `${reason || "차단된 계정입니다."} (${new Date(until).toLocaleDateString("ko-KR")}까지)`
    : reason || "차단된 계정입니다."

  return Response.json({ error: message }, { status: 403 })
}
