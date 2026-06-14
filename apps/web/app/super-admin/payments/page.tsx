/**
 * 슈퍼관리자 — 지역별 PortOne 결제 채널 / 사업자 정보
 *
 * gwangjang.app/admin/payments (rewrite via middleware)
 */
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { PaymentsConfig } from "@/components/super-admin/payments-config"

export const dynamic = "force-dynamic"

export default async function SuperAdminPaymentsPage() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect("/super-admin")

  return <PaymentsConfig />
}
