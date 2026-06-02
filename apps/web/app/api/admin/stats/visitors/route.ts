import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/stats/visitors
 *
 * 접속자 통계 — service role 로 RLS 우회.
 * 웹 + 앱 모든 visitor_logs 를 광장별로 집계.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const limited = await enforceRateLimit(request as any, "default", user.id)
  if (limited) return limited

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: "광장 컨텍스트 필요" }, { status: 400 })

  const admin = await getAdminWriteClient()
  if (!admin) return NextResponse.json({ error: "Service role key 미설정" }, { status: 500 })

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

  try {
    // 병렬 쿼리 — 모두 plaza_id 필터링
    const [
      todayRes,
      yesterdayRes,
      weekRes,
      monthRes,
      totalRes,
      onlineRes,
      pageViewsRes,
      todayRowsRes,
    ] = await Promise.all([
      // 오늘 고유 세션
      admin.from("visitor_logs").select("session_id", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", todayStart),
      // 어제
      admin.from("visitor_logs").select("session_id", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", yesterdayStart).lt("visited_at", todayStart),
      // 이번 주
      admin.from("visitor_logs").select("session_id", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", weekStart),
      // 이번 달
      admin.from("visitor_logs").select("session_id", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", monthStart),
      // 전체
      admin.from("visitor_logs").select("*", { count: "exact", head: true })
        .eq("plaza_id", plaza),
      // 현재 온라인 (5분 내)
      admin.from("visitor_logs").select("session_id", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", fiveMinAgo),
      // 오늘 페이지뷰
      admin.from("visitor_logs").select("*", { count: "exact", head: true })
        .eq("plaza_id", plaza).gte("visited_at", todayStart),
      // 오늘 상세 rows (device, browser, hour, source 집계용)
      admin.from("visitor_logs")
        .select("device_type, browser, os, visited_at, user_agent")
        .eq("plaza_id", plaza)
        .gte("visited_at", todayStart)
        .limit(5000),
    ])

    // 기기별 집계
    const devices = { desktop: 0, mobile: 0, tablet: 0 }
    const browsers: Record<string, number> = {}
    const osList: Record<string, number> = {}
    const hourly: Record<number, number> = {}
    let appVisits = 0
    let webVisits = 0

    for (const r of todayRowsRes.data ?? []) {
      // 기기
      if (r.device_type === "desktop") devices.desktop++
      else if (r.device_type === "mobile") devices.mobile++
      else if (r.device_type === "tablet") devices.tablet++

      // 브라우저
      const b = r.browser || "unknown"
      browsers[b] = (browsers[b] || 0) + 1

      // OS
      const o = r.os || "unknown"
      osList[o] = (osList[o] || 0) + 1

      // 시간대
      if (r.visited_at) {
        const hour = new Date(r.visited_at).getHours()
        hourly[hour] = (hourly[hour] || 0) + 1
      }

      // 앱 vs 웹 구분 (user_agent에 앱 식별자 포함 여부)
      const ua = (r.user_agent || "").toLowerCase()
      if (ua.includes("gwangjang-app") || ua.includes("expo") || ua.includes("react-native")) {
        appVisits++
      } else {
        webVisits++
      }
    }

    const hourlyArray = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourly[i] || 0,
    }))

    // 브라우저 상위 8개
    const topBrowsers = Object.entries(browsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }))

    // OS 상위 6개
    const topOS = Object.entries(osList)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }))

    const today = todayRes.count || 0
    const yesterday = yesterdayRes.count || 0

    return NextResponse.json({
      stats: {
        today,
        yesterday,
        thisWeek: weekRes.count || 0,
        thisMonth: monthRes.count || 0,
        total: totalRes.count || 0,
        currentOnline: onlineRes.count || 0,
        todayPageViews: pageViewsRes.count || 0,
        maxDaily: Math.max(today, yesterday),
        maxDailyDate: today >= yesterday ? "오늘" : "어제",
      },
      devices,
      hourly: hourlyArray,
      topBrowsers,
      topOS,
      source: { app: appVisits, web: webVisits },
    })
  } catch (e: any) {
    console.error("[admin/stats/visitors]", e)
    return NextResponse.json({ error: e.message || "집계 실패" }, { status: 500 })
  }
}
