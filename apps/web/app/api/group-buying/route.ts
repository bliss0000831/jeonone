import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { z } from "zod"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

// 입력 검증 — 가격/수량/날짜 등 모든 숫자 필드에 안전 상한
const GroupBuyingPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  product_name: z.string().trim().min(1).max(200),
  original_price: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  group_price: z.number().int().positive().max(100_000_000),
  min_participants: z.number().int().min(2).max(10000).nullable().optional(),
  max_participants: z.number().int().min(2).max(10000).nullable().optional(),
  deadline: z.string().datetime().or(z.string().min(1)).nullable().optional(),
  images: z.array(z.string().url()).max(20).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  delivery_mode: z.enum(['pickup', 'delivery', 'both']).optional(),
  delivery_fee: z.number().int().nonnegative().max(1_000_000).optional(),
  delivery_fee_mode: z.enum(['separate', 'included', 'split', 'free']).optional(),
  pickup_location: z.string().max(500).nullable().optional(),
  pickup_time: z.string().max(100).nullable().optional(),
  account_info: z.string().max(500).nullable().optional(),
  visibility: z.enum(['plaza', 'national']).optional(),
  payment_required: z.boolean().optional(),
  sub_region: z.string().max(100).nullable().optional(),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // 페이지네이션 — 정수 검증 + 상한 100건 (DoS 방어)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "20") || 20, 100))
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0") || 0)
  const status = searchParams.get("status")

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let query = supabase
    .from("group_buying_posts")
    .select("id, user_id, plaza_id, title, description, product_name, original_price, group_price, min_participants, max_participants, current_participants, deadline, images, status, location, visibility, delivery_fee, delivery_fee_mode, views, created_at, bumped_at, effective_at")
    .order("effective_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // 광장 글 + 전국 공개 글 같이 노출 (전국 공개는 모든 광장에서 보임)
  // 허브 도메인(plaza=null)에서는 전국 공개 글만 보여줌
  if (plaza) {
    query = query.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  } else {
    query = query.eq("visibility", "national")
  }
  if (status) {
    query = query.eq("status", status)
  }

  const { data: posts, error } = await query

  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 프로필 정보 별도로 가져오기
  if (posts && posts.length > 0) {
    const userIds = [...new Set(posts.map(p => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
    
    const postsWithProfiles = posts.map(post => ({
      ...post,
      profiles: profileMap.get(post.user_id) || null
    }))

    return NextResponse.json({ posts: postsWithProfiles })
  }

  return NextResponse.json({ posts: posts || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 유저당 10분 10개
  const limited = await enforceRateLimit(request, 'post', user.id)
  if (limited) return limited

  const rawBody = await request.json()
  const parsed = GroupBuyingPostSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: '입력값이 올바르지 않습니다',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }
  const body = parsed.data

  // 비즈니스 룰: min ≤ max
  if (body.min_participants && body.max_participants && body.min_participants > body.max_participants) {
    return NextResponse.json(
      { error: '최소 참여 인원은 최대 인원보다 클 수 없습니다' },
      { status: 400 },
    )
  }
  // 비즈니스 룰: group_price ≤ original_price (제공된 경우)
  if (body.original_price != null && body.group_price > body.original_price) {
    return NextResponse.json(
      { error: '공동구매 가격은 정가보다 높을 수 없습니다' },
      { status: 400 },
    )
  }

  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 작성해주세요" }, { status: 400 })
  }

  // plaza_profiles 가 없으면 자동 가입 — RLS 가 user_in_plaza() 를 요구하기 때문
  // (카카오 가입자 중 plaza_profiles 가 누락된 케이스 대비)
  // service_role 로 우회 — 본인 신원은 위에서 이미 검증 완료
  try {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const admin = await getAdminWriteClient()
    if (admin) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle()
      const { error: ppErr } = await admin
        .from("plaza_profiles")
        .upsert(
          {
            user_id: user.id,
            plaza_id: plaza,
            nickname: (prof as any)?.nickname ?? null,
            is_active: true,
          },
          { onConflict: "user_id,plaza_id" },
        )
      if (ppErr) console.error("[group-buying POST] plaza_profiles upsert error:", ppErr)
    } else {
      console.warn("[group-buying POST] admin client 없음 — plaza_profiles ensure skip")
    }
  } catch (e) {
    console.error("[group-buying POST] plaza_profiles ensure failed:", e)
  }

  // Bearer 토큰(모바일) 경로에선 supabase client 가 anonymous 로 실행되어
  // RLS auth.uid() = user_id 가 null=uuid 비교로 실패 → service_role writer 사용.
  // 호출자 신원은 getAuthedUser 로 이미 검증.
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      console.error("[group-buying POST] service_role unavailable for bearer auth")
      return NextResponse.json(
        { error: "서버 설정 오류 (service_role 키 누락)" },
        { status: 500 },
      )
    }
    writer = wc
  }

  const { data, error } = await writer
    .from("group_buying_posts")
    .insert({
      plaza_id: plaza,
      user_id: user.id,
      title: body.title,
      description: body.description,
      product_name: body.product_name,
      original_price: body.original_price ?? null,
      group_price: body.group_price,
      min_participants: body.min_participants ?? 2,
      // max 가 비어있으면 큰 값(사실상 무제한)로 — DB 컬럼이 NOT NULL 일 수 있어 null 회피
      max_participants: body.max_participants ?? 9999,
      deadline: body.deadline ?? null,
      images: body.images ?? [],
      location: body.location ?? null,
      delivery_mode: body.delivery_mode ?? 'both',
      delivery_fee: body.delivery_fee ?? 0,
      delivery_fee_mode: body.delivery_fee_mode ?? 'separate',
      pickup_location: body.pickup_location ?? null,
      pickup_time: body.pickup_time ?? null,
      account_info: body.account_info ?? null,
      visibility: body.visibility ?? 'plaza',
      payment_required: body.payment_required ?? false,
      sub_region: body.sub_region ?? null,
      status: 'recruiting'
    })
    .select()
    .single()

  if (error) {
    console.error("[group-buying POST] insert error:", error)
    return NextResponse.json(
      { error: "등록에 실패했습니다" },
      { status: 500 },
    )
  }

  const { awardPoints } = await import("@/lib/services/billing/award-helper")
  awardPoints({
    userId: user.id,
    plazaId: plaza,
    ruleId: "group_buying.create",
    sourceId: data.id,
    qualityData: {
      length: (body.description || "").length,
      has_image: Array.isArray(body.images) && body.images.length > 0,
    },
  })

  return NextResponse.json({ post: data })
}
