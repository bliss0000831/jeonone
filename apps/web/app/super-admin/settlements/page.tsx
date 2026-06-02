/**
 * 슈퍼관리자 — 정산 관리
 * gwangjang.app/admin/settlements
 */
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { SettlementsManager } from "@/components/super-admin/settlements-manager"

export const dynamic = "force-dynamic"

export default async function SuperAdminSettlementsPage() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect("/super-admin")

  return <SettlementsManager />
}
