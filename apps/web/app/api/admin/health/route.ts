import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from "next/server"
import { checkAdminAuth, getAdminWriteClient } from "@/lib/services/admin-auth"

export const dynamic = "force-dynamic"

type Probe = { status: "ok" | "fail"; ms: number; error?: string }

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; ms: number; error?: string }> {
  const t0 = Date.now()
  try {
    const result = await fn()
    return { result, ms: Date.now() - t0 }
  } catch (e: any) {
    return { result: null, ms: Date.now() - t0, error: String(e?.message || e) }
  }
}

async function probeDb(): Promise<Probe> {
  const { ms, error, result } = await timed(async () => {
    const admin = await getAdminWriteClient()
    if (!admin) throw new Error("admin key missing")
    // 가벼운 head count — 최소 라운드트립
    const { error: e } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1)
    if (e) throw e
    return true
  })
  return { status: result ? "ok" : "fail", ms, ...(error ? { error } : {}) }
}

async function probeStorage(): Promise<Probe> {
  const { ms, error, result } = await timed(async () => {
    const admin = await getAdminWriteClient()
    if (!admin) throw new Error("admin key missing")
    const { error: e } = await admin.storage.listBuckets()
    if (e) throw e
    return true
  })
  return { status: result ? "ok" : "fail", ms, ...(error ? { error } : {}) }
}

async function probeNaver(): Promise<Probe> {
  const { ms, error, result } = await timed(async () => {
    const id = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
    const secret = process.env.NAVER_MAP_CLIENT_SECRET
    if (!id || !secret) throw new Error("naver key missing")
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 2000)
    try {
      const r = await fetch(
        `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent("서울특별시 중구")}`,
        {
          headers: {
            "x-ncp-apigw-api-key-id": id,
            "x-ncp-apigw-api-key": secret,
          },
          signal: controller.signal,
        },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return true
    } finally {
      clearTimeout(tid)
    }
  })
  return { status: result ? "ok" : "fail", ms, ...(error ? { error } : {}) }
}

// GET /api/admin/health
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
  }
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const [db, storage, naver] = await Promise.all([probeDb(), probeStorage(), probeNaver()])

  return NextResponse.json({
    db,
    storage,
    naver,
    timestamp: new Date().toISOString(),
  })
}
