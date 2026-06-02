import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { getAllLabelsWithMeta } from "@/lib/site-labels"
import { LabelsEditor } from "@/components/super-admin/labels-editor"

export const dynamic = "force-dynamic"

export default async function SuperAdminLabelsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect("/super-admin")

  const labels = await getAllLabelsWithMeta()

  return <LabelsEditor initial={labels} />
}
