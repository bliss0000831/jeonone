import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"

// 회원 탈퇴 — auth.users 까지 완전 삭제
//   profiles row → cascade로 매물·채팅 등 정리
//   auth.users → service-role 로 삭제
//
// 보안: rate limit + 최근 재로그인 검증 (last_sign_in_at 5분 이내).
// 탈취된 탭으로 무차별 탈퇴 방지.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // Rate limit — 분당 1건, 일일 3건 (탈퇴 시도 자체가 드물어야 함)
  const limited = await enforceRateLimit(request, "account_delete", user.id)
  if (limited) return limited

  // 최근 재로그인 확인 — 30분 이내 로그인했는지
  // (last_sign_in_at 은 토큰 갱신 시 안 바뀌므로 진짜 로그인 시점 기준)
  const lastSignIn = (user as any).last_sign_in_at
    ? new Date((user as any).last_sign_in_at).getTime()
    : 0
  const THIRTY_MIN = 30 * 60 * 1000
  if (!lastSignIn || Date.now() - lastSignIn > THIRTY_MIN) {
    return NextResponse.json(
      {
        error: "보안을 위해 최근 30분 내 로그인이 필요합니다. 다시 로그인 후 시도해주세요.",
        code: "reauth_required",
      },
      { status: 403 },
    )
  }

  const admin = createAdminClient()

  // 0) 사용자가 업로드한 R2 이미지 URL 수집 — profiles 삭제 전에 (cascade 후엔 row 가 사라짐)
  // PIPA/GDPR 우편삭제 권리 — DB 외에 객체 스토리지도 정리해야 완전 삭제
  const r2Urls: string[] = []
  try {
    const tablesWithImages: Array<{ table: string; col: string }> = [
      { table: "properties", col: "images" },
      { table: "secondhand_posts", col: "images" },
      { table: "sharing_posts", col: "images" },
      { table: "group_buying_posts", col: "images" },
      { table: "local_food", col: "images" },
      { table: "jobs_posts", col: "images" },
      { table: "interior_posts", col: "images" },
      { table: "moving_posts", col: "images" },
      { table: "cleaning_posts", col: "images" },
      { table: "repair_posts", col: "images" },
      { table: "new_store_posts", col: "images" },
      { table: "board_posts", col: "images" },
    ]
    // 병렬 실행 — 12개 순차 쿼리(12 RTT) → 1 RTT
    const results = await Promise.all(
      tablesWithImages.map((t) =>
        (admin as any).from(t.table).select(t.col).eq("user_id", user.id),
      ),
    )
    for (let i = 0; i < results.length; i++) {
      const { data } = results[i]
      if (Array.isArray(data)) {
        const col = tablesWithImages[i].col
        for (const row of data as any[]) {
          const arr = (row as any)[col]
          if (Array.isArray(arr)) {
            for (const u of arr) if (typeof u === "string") r2Urls.push(u)
          }
        }
      }
    }
    // 아바타·커버 이미지
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url, cover_url")
      .eq("id", user.id)
      .maybeSingle()
    if (profile?.avatar_url) r2Urls.push(profile.avatar_url)
    if (profile?.cover_url) r2Urls.push(profile.cover_url)
  } catch (e) {
    console.warn("[account-delete] R2 url collection 일부 실패:", (e as any)?.message)
  }

  // 1) auth.users 삭제 — admin API (먼저! profiles 삭제 후 auth 실패 시 데이터 유실+세션 잔류 방지)
  const { error: aErr } = await admin.auth.admin.deleteUser(user.id)
  if (aErr) {
    console.error("[account-delete] auth user delete failed:", aErr)
    return NextResponse.json(
      { error: "계정 삭제에 실패했습니다. 다시 시도해주세요." },
      { status: 500 },
    )
  }

  console.info(`[audit] account-delete: userId=${user.id} email=${user.email} at=${new Date().toISOString()}`)

  // 2) profiles row 삭제 — cascade FK 가 매물/채팅/즐겨찾기 등을 정리
  //    auth 삭제 성공 후 실행 → 실패해도 세션 유지 문제 없음
  const { error: pErr } = await admin.from("profiles").delete().eq("id", user.id)
  if (pErr) {
    console.error("[account-delete] profiles delete failed (auth already deleted):", pErr)
    // auth 삭제는 이미 성공했으므로 사용자에게는 성공 응답 + 관리자 알림
    // 잔여 프로필 데이터는 추후 배치 정리
  }

  // 3) R2 이미지 정리 — fire-and-forget (사용자 응답 차단 X)
  // 내부 함수 직접 호출 — fetch 자기참조 라우트는 cookie/host 누락 / 콜드스타트로 401 가능.
  // URL 들은 위에서 admin.from(...).eq('user_id', user.id) 로 본인 row 만 모았으므로 권한 OK.
  if (r2Urls.length > 0) {
    void deleteR2Urls(r2Urls).catch((e) =>
      console.warn("[account-delete] R2 cleanup 실패:", (e as any)?.message),
    )
  }

  // 클라이언트의 세션은 클라이언트가 signOut() 으로 정리
  return NextResponse.json({ success: true, r2_cleanup_count: r2Urls.length })
}
