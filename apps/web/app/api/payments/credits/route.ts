import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { getProduct, IS_BETA_FREE } from "@/lib/ai-video/pricing"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const runtime = "nodejs"

/**
 * 크레딧 구매 — Phase B 스텁
 *
 * 현재 동작:
 *   · BETA 기간 → 결제 흐름을 타지 않고 "무료 지급" 으로 처리
 *   · order_id 생성 + credit_purchases 에 status=paid 로 기록
 *   · grant_video_credits RPC 로 즉시 지급
 *
 * Phase C 에서 할 일:
 *   · provider=toss → Toss Payments confirm API 호출 → status=paid 로 업데이트
 *   · provider=kakaopay → KakaoPay approve 호출
 *   · 웹훅으로 상태 동기화
 *
 * 요청:
 *   POST { productCode: 'credit_1' | 'credit_5' | 'credit_10', provider: 'toss' | 'kakaopay' }
 *
 * 응답:
 *   { orderId, productCode, creditsGranted, newBalance, betaFree: true }
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
    }

    const { productCode, provider } = (await request.json().catch(() => ({}))) as {
      productCode?: string
      provider?: string
    }

    const product = getProduct(productCode as any)
    if (!product) {
      return NextResponse.json({ error: "잘못된 상품입니다" }, { status: 400 })
    }
    if (provider !== "toss" && provider !== "kakaopay") {
      return NextResponse.json({ error: "지원하지 않는 결제수단" }, { status: 400 })
    }

    // 공인중개사만
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single()
    if (profile?.account_type !== "agent") {
      return NextResponse.json(
        { error: "공인중개사 계정만 구매 가능합니다" },
        { status: 403 },
      )
    }

    // service_role 클라이언트 (RPC 호출 및 RLS 우회 INSERT용)
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    if (!serviceKey || !supaUrl) {
      return NextResponse.json(
        { error: "서버 설정 오류 (service role key)" },
        { status: 500 },
      )
    }
    const admin = createAdmin(supaUrl, serviceKey, {
      auth: { persistSession: false },
    })

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // ── BETA: 결제 스킵 → 즉시 무료 지급 ──
    if (IS_BETA_FREE) {
      // Rate limit — 무한 자가 발급 방어 (전용 버킷, 일별 cap 으로 사용)
      const limited = await enforceRateLimit(request, 'account_upgrade', user.id)
      if (limited) return limited

      // Race-safe BETA grant 카운트:
      //   1) credit_purchases 에 status=pending + pre_count metadata 로 먼저 insert
      //      → UNIQUE(order_id) 가 race 직렬화 역할.
      //   2) insert 직후 count 재확인. 24h 안에 이미 3회 이상이면 status=cancelled 로
      //      되돌리고 429 반환 (자신 row 포함).
      //   3) 통과 시 status=paid 로 승격 후 grant_video_credits 호출.
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { error: insErr } = await admin.from("credit_purchases").insert({
        user_id: user.id,
        product_code: product.code,
        amount_krw: 0, // BETA = 무료
        credits_granted: product.points,
        provider: "beta_grant",
        order_id: orderId,
        status: "pending",
        raw_response: { betaFree: true, originalProvider: provider, originalPrice: product.priceKrw },
      })
      if (insErr) {
        return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
      }

      // post-insert count check — 자신 row 포함. 3 초과면 race 로 들어온 중복.
      const { count: recentGrants } = await admin
        .from('credit_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider', 'beta_grant')
        .in('status', ['pending', 'paid'])
        .gte('created_at', oneDayAgo)

      if ((recentGrants ?? 0) > 3) {
        // 자신 row 를 cancelled 로 되돌려 race 패배자 표시
        await admin
          .from('credit_purchases')
          .update({ status: 'cancelled' })
          .eq('order_id', orderId)
        return NextResponse.json(
          { error: "BETA 무료 크레딧은 24시간에 3회까지만 지급됩니다" },
          { status: 429 },
        )
      }

      // 승격 — status=paid
      const { error: payErr } = await admin
        .from('credit_purchases')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('status', 'pending')
      if (payErr) {
        return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
      }

      const { data: newBalance, error: rpcErr } = await admin.rpc(
        "grant_video_credits",
        { p_user_id: user.id, p_points: product.points },
      )
      if (rpcErr) {
        return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
      }

      return NextResponse.json({
        orderId,
        productCode: product.code,
        creditsGranted: product.points,
        newBalance,
        betaFree: true,
      })
    }

    // ── Phase C: 실결제 플로우 ──
    // 1) credit_purchases 에 status=pending 기록
    // 2) Toss/KakaoPay 결제창 URL 반환 → 클라이언트 리다이렉트
    // 3) /api/payments/confirm 에서 결제 승인 + grant_video_credits 호출
    return NextResponse.json(
      { error: "결제 시스템 준비 중입니다 (Phase C)" },
      { status: 501 },
    )
  } catch (e: any) {
    console.error("[payments/credits] error:", e)
    return NextResponse.json(
      { error: "결제 중 오류가 발생했습니다" },
      { status: 500 },
    )
  }
}
