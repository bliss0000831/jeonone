import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { prepareMutation, logAdminMutation, safeRevalidate } from "@/lib/api-helpers"

const TABLE = "board_posts"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("board_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post, error } = await q.single()

  if (error || !post) {
    return NextResponse.json(
      { error: "게시글을 찾을 수 없습니다" },
      { status: 404 },
    )
  }

  // 조회수 +1 — atomic RPC (race-free)
  void supabase.rpc("increment_view_count", {
    p_table: "board_posts",
    p_id: id,
    p_column: "view_count",
  })

  const [authorResult, { user }] = await Promise.all([
    post.user_id
      ? supabase
          .from("profiles")
          .select("id, nickname, avatar_url, account_type")
          .eq("id", post.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getAuthedUser(supabase, request),
  ])
  post.author = authorResult.data || null

  if (user) {
    const { data: like } = await supabase
      .from("board_post_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("post_id", id)
      .maybeSingle()

    post.user_liked = !!like
  }

  return NextResponse.json({ post })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, { table: TABLE, id })
  if (m.error) return m.error
  const { writer, isAdmin, plaza } = m

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  // images[0] → thumbnail_url (web/mobile edit 패턴과 동일)
  const images: string[] = Array.isArray(body.images) ? body.images : []
  const thumbnailUrl = images[0] ?? null

  let updQ: any = writer
    .from(TABLE)
    .update({
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      content: typeof body.content === "string" ? body.content.trim() : undefined,
      category_id: body.category_id ?? body.categoryId ?? undefined,
      region: body.region === undefined ? undefined : body.region,
      images,
      thumbnail_url: thumbnailUrl,
      sub_region: body.sub_region === undefined ? undefined : (body.sub_region || null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { data, error } = await updQ.select().single()

  if (error) {
    console.error("[board PUT]", error)
    return NextResponse.json(
      { error: "수정에 실패했습니다" },
      { status: 500 },
    )
  }

  await safeRevalidate(`/board/${id}`)
  return NextResponse.json({ post: data })
}

export { PUT as PATCH }

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, images",
  })
  if (m.error) return m.error
  const { writer, resource, isOwner, isAdmin, plaza } = m

  // force=true → cascade delete comments & likes before the post
  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"
  if (force) {
    // likes 먼저 삭제 (FK 없음), 그 다음 comments (post FK), 마지막 post
    // 순서 역전 시에도 안전하도록 에러 발생 시 중단
    const { error: likesErr } = await writer.from("board_post_likes").delete().eq("post_id", id)
    if (likesErr) {
      console.error("[board DELETE] likes cascade failed:", likesErr)
      return NextResponse.json({ error: "좋아요 삭제 실패" }, { status: 500 })
    }
    const { error: commentsErr } = await writer.from("board_comments").delete().eq("post_id", id)
    if (commentsErr) {
      console.error("[board DELETE] comments cascade failed:", commentsErr)
      return NextResponse.json({ error: "댓글 삭제 실패" }, { status: 500 })
    }
  }

  let delQ: any = writer.from(TABLE).delete().eq("id", id)
  if (plaza) delQ = delQ.eq("plaza_id", plaza)
  const { data: deleted, error } = await delQ.select("id")

  if (!force && error && (error as any)?.code === "23503") {
    // FK conflict → soft-hide fallback (status 컬럼 없으면 그냥 에러 응답)
    console.warn("[board DELETE] FK conflict — cannot soft-hide (no status column on board_posts)", { id })
    return NextResponse.json(
      { error: "댓글/좋아요가 있어 삭제할 수 없습니다. force=true 로 카스케이드 삭제 가능합니다." },
      { status: 409 },
    )
  }

  if (error) {
    console.error("[board DELETE] error:", error)
    return NextResponse.json(
      { error: "삭제에 실패했습니다" },
      { status: 500 },
    )
  }
  if (!deleted || deleted.length === 0) {
    console.error("[board DELETE] 0 rows affected — likely RLS block", { id, userId: m.user.id, isAdmin, isOwner })
    return NextResponse.json(
      { error: "삭제에 실패했습니다 (RLS 차단)" },
      { status: 500 },
    )
  }

  // admin 이 타인 글 삭제한 경우 audit log
  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, resource)
  }
  void deleteR2Urls(resource.images as string[] | null)

  await safeRevalidate(`/board/${id}`)
  return NextResponse.json({ success: true, deletedCount: deleted.length })
}
