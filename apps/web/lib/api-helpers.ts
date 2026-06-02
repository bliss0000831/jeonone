/**
 * API 라우트 공통 헬퍼 — 인증 · 뮤테이션 보일러플레이트 제거.
 *
 * 1) apiAuthRequired  — 인증 체크 (Phase 2 H9)
 * 2) prepareMutation  — 인증 + 레이트리밋 + 소유권/관리자 + writer 한 번에 (Phase 3 H11)
 *
 * Before (PATCH/DELETE 마다 ~40줄 반복):
 *   const auth = await apiAuthRequired(request)
 *   if (auth.error) return auth.error
 *   const limited = await enforceRateLimit(request, 'mutate', user.id)
 *   if (limited) return limited
 *   const { checkAdminAuth, canAccessPlaza } = await import(...)
 *   const adminAuth = await checkAdminAuth(supabase, user.id)
 *   // ... fetch resource, check ownership, get admin writer ...
 *
 * After:
 *   const m = await prepareMutation(request, { table: "secondhand_posts", id })
 *   if (m.error) return m.error
 *   const { writer, resource, isOwner, isAdmin, plaza } = m
 */
import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit, type LimitName } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// ── apiAuthRequired ──────────────────────────────────────

type AuthSuccess = {
  error: null
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; [key: string]: unknown }
  tokenSource: "cookie" | "bearer"
}

type AuthFailure = {
  error: NextResponse
  supabase?: undefined
  user?: undefined
  tokenSource?: undefined
}

/**
 * API 라우트 인증 필수 체크.
 * 성공 시 supabase client + user + tokenSource 반환.
 * 실패 시 바로 return 가능한 401 NextResponse 반환.
 */
export async function apiAuthRequired(
  request: NextRequest | Request,
): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "로그인이 필요합니다" },
        { status: 401 },
      ),
    }
  }

  return {
    error: null,
    supabase,
    user,
    tokenSource: tokenSource as "cookie" | "bearer",
  }
}

// ── prepareMutation ──────────────────────────────────────

interface MutationOptions {
  /** Supabase 테이블 이름 */
  table: string
  /** 리소스 ID (params.id) */
  id: string
  /** 소유권 체크에 필요한 컬럼 (기본: "user_id, plaza_id") */
  selectCols?: string
  /** 레이트리밋 카테고리 (기본: "mutate") */
  rateKey?: LimitName
  /** 소유권 체크 없이 관리자만 허용 (admin-only 라우트) */
  adminOnly?: boolean
}

interface MutationSuccess {
  error: null
  /** RLS 통과하는 writer — 본인 글이면 supabase, 관리자/bearer 면 service_role */
  writer: SupabaseClient
  /** 원본 supabase client (조회용) */
  supabase: SupabaseClient
  user: { id: string; [key: string]: unknown }
  tokenSource: "cookie" | "bearer"
  /** .select(selectCols) 결과 — user_id, plaza_id 등 포함 */
  resource: Record<string, unknown>
  isOwner: boolean
  isAdmin: boolean
  plaza: string | null
}

interface MutationFailure {
  error: NextResponse
}

/**
 * PATCH/DELETE 뮤테이션 공통 전처리 — 한 번에 다 해결.
 *
 * 1. 인증 (apiAuthRequired)
 * 2. 레이트리밋 (enforceRateLimit)
 * 3. 광장 컨텍스트 (getCurrentPlaza)
 * 4. 리소스 존재 확인 + 광장 격리
 * 5. 소유권 / 관리자 권한 검사
 * 6. 필요 시 service_role writer 생성
 *
 * @example
 * export async function PATCH(request, { params }) {
 *   const { id } = await params
 *   const m = await prepareMutation(request, { table: "secondhand_posts", id })
 *   if (m.error) return m.error
 *
 *   const body = await request.json()
 *   const { error } = await m.writer
 *     .from("secondhand_posts")
 *     .update({ title: body.title })
 *     .eq("id", id)
 *   if (error) return NextResponse.json({ error: "실패" }, { status: 500 })
 *   return NextResponse.json({ success: true })
 * }
 */
export async function prepareMutation(
  request: NextRequest | Request,
  opts: MutationOptions,
): Promise<MutationSuccess | MutationFailure> {
  // 1) 인증
  const auth = await apiAuthRequired(request)
  if (auth.error) return { error: auth.error }
  const { supabase, user, tokenSource } = auth

  // 1.5) 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return { error: banRes as unknown as NextResponse }

  // 2) 레이트리밋
  const limited = await enforceRateLimit(
    request as NextRequest,
    opts.rateKey ?? "mutate",
    user.id,
  )
  if (limited) return { error: limited }

  // 3) 광장
  const plaza = await getCurrentPlaza()

  // 4) 리소스 조회 + 광장 격리
  // 동적 테이블명이라 DB 제네릭 추론 불가 → any 캐스트 (호출부가 테이블명 보장)
  const cols = opts.selectCols ?? "user_id, plaza_id"
  let fetchQ: any = supabase.from(opts.table as any).select(cols).eq("id", opts.id)
  if (plaza) fetchQ = fetchQ.eq("plaza_id", plaza)
  const { data: resource } = await fetchQ.maybeSingle()
  if (!resource) {
    return {
      error: NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 }),
    }
  }

  // 5) 소유권 / 관리자
  const { checkAdminAuth, canAccessPlaza } = await import(
    "@/lib/services/admin-auth"
  )
  const adminAuth = await checkAdminAuth(supabase, user.id)
  const row = resource as unknown as Record<string, unknown>
  const resourcePlaza = (row.plaza_id as string) ?? null
  const isAdmin =
    adminAuth.isLegacySuper ||
    (adminAuth.isLegacyAdmin && canAccessPlaza(adminAuth, resourcePlaza)) ||
    canAccessPlaza(adminAuth, resourcePlaza)
  const isOwner = row.user_id === user.id

  if (!isOwner && !isAdmin) {
    return {
      error: NextResponse.json({ error: "권한이 없습니다" }, { status: 403 }),
    }
  }

  if (opts.adminOnly && !isAdmin) {
    return {
      error: NextResponse.json({ error: "관리자만 가능합니다" }, { status: 403 }),
    }
  }

  // 6) service_role writer (admin 이 타인 글 수정 또는 bearer 토큰)
  let writer: SupabaseClient = supabase
  if ((!isOwner && isAdmin) || tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      return {
        error: NextResponse.json(
          { error: "서버 설정 오류 (service_role 키 누락)" },
          { status: 500 },
        ),
      }
    }
    writer = wc as SupabaseClient
  }

  return {
    error: null,
    writer,
    supabase,
    user,
    tokenSource,
    resource: row,
    isOwner,
    isAdmin,
    plaza,
  }
}

/**
 * admin 이 타인 글 삭제/수정 시 감사 로그.
 * prepareMutation 결과와 함께 사용.
 */
export async function logAdminMutation(
  adminId: string,
  action: "update" | "delete",
  table: string,
  targetId: string,
  resource: Record<string, unknown>,
): Promise<void> {
  const { logAdminAction } = await import("@/lib/services/admin-auth")
  void logAdminAction({
    adminId,
    action,
    targetTable: table,
    targetId,
    targetUserId: resource.user_id as string,
    plazaId: (resource.plaza_id as string) ?? null,
    beforeData: resource,
  })
}

/**
 * next/cache revalidation — try/catch 래핑.
 */
export async function safeRevalidate(...paths: string[]): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache")
    for (const p of paths) revalidatePath(p)
  } catch {}
}
