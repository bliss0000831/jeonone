import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth } from "@/lib/services/admin-auth"

export const dynamic = "force-dynamic"

/** PUT /api/admin/users/[id]/memo — 메모 저장 (upsert) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const body = await request.json()
  const memo = (body.memo || "").trim()

  if (!memo) {
    // 메모가 비어있으면 삭제
    await (supabase as any)
      .from("admin_user_memos")
      .delete()
      .eq("user_id", id)
      .eq("plaza_id", plaza || "")
    return NextResponse.json({ ok: true, memo: null })
  }

  // upsert
  const { error } = await (supabase as any)
    .from("admin_user_memos")
    .upsert(
      {
        user_id: id,
        admin_id: user.id,
        plaza_id: plaza || null,
        memo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plaza_id" },
    )

  if (error) {
    console.error("[admin/users/memo] upsert error:", error)
    return NextResponse.json({ error: "저장 실패" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, memo })
}
