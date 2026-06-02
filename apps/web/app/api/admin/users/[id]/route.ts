import { createClient } from "@/lib/supabase/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { checkAdminAuth, canAccessPlaza } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdmin(url, key, { auth: { persistSession: false } })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
  }

  // legacy + plaza_admins 통합 권한 체크
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json()
  const { account_type, role, location } = body

  // 권한 변경은 슈퍼만 가능 (legacy superadmin 또는 plaza_admins super)
  if (role !== undefined && !auth.isGodMode) {
    return NextResponse.json({ error: "슈퍼관리자만 권한 변경 가능" }, { status: 403 })
  }
  // 자기 자신의 권한 변경 금지 (lockout 방지 + 자기 승격/강등 차단)
  if (role !== undefined && id === user.id) {
    return NextResponse.json(
      { error: "자기 자신의 권한은 변경할 수 없습니다" },
      { status: 400 },
    )
  }
  // role 값 화이트리스트
  if (role !== undefined && !['user', 'admin', 'superadmin'].includes(role)) {
    return NextResponse.json({ error: "허용되지 않은 role 값" }, { status: 400 })
  }
  // account_type 값 화이트리스트 (UI 분기 안전성)
  const ALLOWED_ACCOUNT_TYPES = ['user', 'individual', 'agent', 'business', 'producer', 'interior', 'moving', 'cleaning', 'repair']
  if (account_type !== undefined && !ALLOWED_ACCOUNT_TYPES.includes(account_type)) {
    return NextResponse.json({ error: "허용되지 않은 account_type 값" }, { status: 400 })
  }
  // 대상 회원 — profiles.plaza_id 컬럼은 없음. plaza_profiles 로 가입 광장 조회
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다' }, { status: 404 })
  }
  // legacy super 가 아니라면 cross-plaza 보호 — 대상이 본인 광장에 가입돼있어야
  if (!auth.isLegacySuper) {
    const { data: pp } = await supabase
      .from('plaza_profiles')
      .select('plaza_id')
      .eq('user_id', id)
    const targetPlazas = (pp || []).map((r: any) => r.plaza_id as string)
    const allowed = targetPlazas.length === 0
      ? false  // 어느 광장에도 가입 안 된 회원은 plaza_admin 이 건드릴 수 없음
      : targetPlazas.some((pz) => canAccessPlaza(auth, pz))
    if (!allowed) {
      return NextResponse.json(
        { error: '다른 광장의 회원은 수정할 수 없습니다' },
        { status: 403 },
      )
    }
  }

  // 마지막 superadmin 강등 방지
  if (role !== undefined && role !== 'superadmin') {
    if (target?.role === 'superadmin') {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'superadmin')
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: '마지막 슈퍼관리자는 강등할 수 없습니다' },
          { status: 400 },
        )
      }
    }
  }

  const updateData: Record<string, string> = {}
  if (account_type !== undefined) {
    if (typeof account_type !== 'string' || account_type.length > 50) {
      return NextResponse.json({ error: 'account_type 형식 오류' }, { status: 400 })
    }
    updateData.account_type = account_type
  }
  if (role !== undefined) {
    const ALLOWED_ROLES = new Set(['user', 'admin', 'superadmin', 'expert'])
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: '잘못된 role 값' }, { status: 400 })
    }
    updateData.role = role
  }
  if (location !== undefined) {
    if (typeof location !== 'string' || location.length > 200) {
      return NextResponse.json({ error: 'location 형식 오류' }, { status: 400 })
    }
    // 컨트롤 문자 + HTML 위험 문자만 차단 (한글/숫자/하이픈 등 정상 주소 글자는 유지)
    updateData.location = location.replace(/[<>"'\x00-\x1f]/g, '').trim()
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", id)

  if (error) {
    console.error("[admin/users PATCH]", error)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  // plaza_profiles.account_type 동기화
  if (account_type !== undefined) {
    const plaza = await getCurrentPlaza()
    if (plaza) {
      // 현재 광장의 plaza_profiles 에 account_type 업데이트
      await supabase
        .from("plaza_profiles")
        .update({ account_type })
        .eq("user_id", id)
        .eq("plaza_id", plaza)
        .then(({ error: ppErr }) => {
          if (ppErr) console.error("[admin/users PATCH] plaza_profiles sync:", ppErr)
        })
    } else {
      // 허브 도메인 — 모든 광장의 plaza_profiles 업데이트
      await supabase
        .from("plaza_profiles")
        .update({ account_type })
        .eq("user_id", id)
        .then(({ error: ppErr }) => {
          if (ppErr) console.error("[admin/users PATCH] plaza_profiles sync (hub):", ppErr)
        })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 })
  }

  // legacy + plaza_admins 통합 권한 체크 — 사용자 삭제는 super 만
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.isGodMode) {
    return NextResponse.json({ error: "슈퍼관리자만 가능" }, { status: 403 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  // 자기 자신은 삭제 불가
  if (id === user.id) {
    return NextResponse.json({ error: "자기 자신은 삭제할 수 없습니다" }, { status: 400 })
  }

  // 대상 회원 조회 — profiles.plaza_id 없음. plaza_profiles 로 cross-plaza 검증
  const { data: target } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', id)
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다' }, { status: 404 })
  }

  // legacy superadmin 은 전권. plaza super 는 자기 광장 회원만.
  if (!auth.isLegacySuper) {
    const { data: pp } = await supabase
      .from('plaza_profiles')
      .select('plaza_id')
      .eq('user_id', id)
    const targetPlazas = (pp || []).map((r: any) => r.plaza_id as string)
    const allowed = targetPlazas.length > 0
      && targetPlazas.some((pz) => canAccessPlaza(auth, pz))
    if (!allowed) {
      return NextResponse.json(
        { error: '다른 광장의 회원은 삭제할 수 없습니다' },
        { status: 403 },
      )
    }
  }

  // 마지막 superadmin 삭제 방지
  if ((target as any).role === 'superadmin') {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'superadmin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: '마지막 슈퍼관리자는 삭제할 수 없습니다' },
        { status: 400 },
      )
    }
  }

  // 1) auth.users 우선 삭제 — service_role 필요. 실패하면 즉시 중단 (좀비 계정 방지)
  const admin = getServiceRoleClient()
  if (!admin) {
    console.error("[admin/users delete] service-role client unavailable")
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }
  const { error: authErr } = await admin.auth.admin.deleteUser(id)
  if (authErr) {
    // 이미 auth.users 에 없는 경우(고아 profile)는 진행. 그 외는 실패.
    const msg = String(authErr.message || "").toLowerCase()
    if (!msg.includes("not found") && !msg.includes("user_not_found")) {
      console.error("[admin/users delete] auth delete failed:", authErr)
      return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
    }
  }

  // 2) public.profiles — auth.users CASCADE 로 자동 삭제됐을 수도 있으나 보험으로 한 번 더
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Profile delete error:", error)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
