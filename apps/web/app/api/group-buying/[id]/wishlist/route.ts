import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NextResponse } from "next/server"
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  // Bearer 토큰(모바일) → RLS 차단 → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.error("[group-buying-wishlist] admin client unavailable", e)
    }
  }

  // Plaza isolation — verify the post belongs to the current plaza
  const plaza = await getCurrentPlaza()
  if (plaza) {
    const { data: post } = await supabase
      .from("group_buying_posts")
      .select("plaza_id")
      .eq("id", id)
      .maybeSingle()
    if (!post || post.plaza_id !== plaza) {
      return NextResponse.json({ error: "해당 광장의 게시글이 아닙니다" }, { status: 404 })
    }
  }

  // Check if already wishlisted
  const { data: existing } = await writer
    .from("group_buying_wishlist")
    .select("id")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .single()

  if (existing) {
    // Remove from wishlist
    await writer
      .from("group_buying_wishlist")
      .delete()
      .eq("post_id", id)
      .eq("user_id", user.id)

    return NextResponse.json({ wishlisted: false })
  }

  // Add to wishlist
  const { error } = await writer
    .from("group_buying_wishlist")
    .insert({
      post_id: id,
      user_id: user.id
    })

  if (error) {
    return NextResponse.json({ error: "찜하기에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ wishlisted: true })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ wishlisted: false })
  }

  const { data } = await supabase
    .from("group_buying_wishlist")
    .select("id")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .single()

  return NextResponse.json({ wishlisted: !!data })
}
