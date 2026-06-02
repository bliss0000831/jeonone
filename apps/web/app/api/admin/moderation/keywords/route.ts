import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, canAccessPlaza } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = 'force-dynamic'

async function ensureAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isAdmin: false, auth: null as any }
  const auth = await checkAdminAuth(supabase, user.id)
  return { supabase, user, isAdmin: auth.ok, auth }
}

// 현재 광장에 대한 쓰기 권한 — legacy super 또는 그 광장 admin
async function ensureWriteForCurrentPlaza() {
  const ctx = await ensureAdmin()
  if (!ctx.user) return { ...ctx, ok: false as const, error: "로그인 필요", status: 401 as const }
  if (!ctx.isAdmin) return { ...ctx, ok: false as const, error: "관리자 전용", status: 403 as const }
  const plaza = await getCurrentPlaza()
  if (!ctx.auth!.isLegacySuper && !canAccessPlaza(ctx.auth!, plaza)) {
    return { ...ctx, ok: false as const, error: "이 광장에 대한 권한이 없습니다", status: 403 as const }
  }
  return { ...ctx, ok: true as const, plaza }
}
void ensureWriteForCurrentPlaza

// 키워드 목록
export async function GET(request: Request) {
  const { supabase, user, isAdmin } = await ensureAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 })
  }
  const limited = await enforceRateLimit(request as any, 'search', user?.id)
  if (limited) return limited
  const plaza = await getCurrentPlaza()
  let q: any = supabase
    .from("moderation_keywords")
    .select("id, keyword, scope, action, note, plaza_id, created_by, created_at")
    .order("created_at", { ascending: false })
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ keywords: data || [] })
}

// 키워드 추가
export async function POST(request: Request) {
  const ctx = await ensureWriteForCurrentPlaza()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { supabase, user } = ctx
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited
  const body = await request.json()
  const { keyword, scope, action, note } = body
  if (!keyword || typeof keyword !== "string") {
    return NextResponse.json({ error: "키워드 필요" }, { status: 400 })
  }
  const validScope = ["all", "secondhand", "jobs"].includes(scope) ? scope : "all"
  const validAction = ["flag", "block", "warn"].includes(action) ? action : "flag"
  const plaza = await getCurrentPlaza()

  const { data, error } = await supabase
    .from("moderation_keywords")
    .insert({
      keyword: keyword.trim(),
      scope: validScope,
      action: validAction,
      note: note || null,
      created_by: user.id,
      ...(plaza ? { plaza_id: plaza } : {}),
    })
    .select()
    .single()
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 등록된 키워드입니다" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ keyword: data }, { status: 201 })
}

// 키워드 삭제
export async function DELETE(request: Request) {
  const ctx = await ensureWriteForCurrentPlaza()
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { supabase, user } = ctx
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited
  const id = new URL(request.url).searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 })
  }
  const plaza = await getCurrentPlaza()
  let delQ: any = supabase.from("moderation_keywords").delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { error } = await delQ
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
