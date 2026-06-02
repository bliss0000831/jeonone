/**
 * 인증 헬퍼 — 쿠키(웹) + Authorization Bearer(모바일/네이티브) 둘 다 인식.
 *
 * 배경:
 *   Supabase SSR createServerClient 는 쿠키만 읽음. 모바일 앱(RN)은 fetch 에 쿠키
 *   안 실으므로 Authorization: Bearer <jwt> 헤더로 인증함. 두 경로 모두 지원하려면
 *   API 라우트에서 Bearer 도 명시적으로 처리해야 함.
 *
 * 사용:
 *   const supabase = await createClient()
 *   const { user } = await getAuthedUser(supabase, request)
 *   if (!user) return 401
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Bearer 로 검증된 mutation 에서 사용할 writer 가 필요한지 판별용.
 *
 * 배경: createServerClient 는 쿠키 기반이라 Bearer 토큰을 받아도
 *   supabase.from(...).delete() 같은 쿼리는 anonymous 로 실행 → RLS 차단.
 *   Bearer 케이스에선 호출자 신원을 이미 검증했으므로 service_role 사용 OK.
 */

// 일부 라우트는 NextRequest 가 아니라 표준 Request 타입을 받음 (둘 다 .headers 있음).
export async function getAuthedUser(
  supabase: SupabaseClient,
  request: Request | { headers: Headers },
): Promise<{ user: any | null; tokenSource: "cookie" | "bearer" | "none" }> {
  // 1) Authorization: Bearer <jwt> 가 있으면 우선 (모바일 경로)
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization")
  if (authHeader) {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
    const token = m?.[1]
    if (token) {
      const { data, error } = await supabase.auth.getUser(token)
      if (!error && data?.user) {
        return { user: data.user, tokenSource: "bearer" }
      }
    }
  }
  // 2) 쿠키 기반 (웹 SSR 경로)
  const { data } = await supabase.auth.getUser()
  if (data?.user) return { user: data.user, tokenSource: "cookie" }
  return { user: null, tokenSource: "none" }
}
