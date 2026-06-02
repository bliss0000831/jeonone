/**
 * 슈퍼 어드민 — 허브(gwangjang.app) 배경 이미지 설정.
 *
 * 저장: site_settings.hub_background = {
 *   image_url, overlay_opacity, overlay_color, position
 * }
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  verifySuperAdminToken,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import { getSiteSettings } from '@/lib/services/site-settings'
import { HubBackgroundEditor } from '@/components/super-admin/hub-background-editor'

export const dynamic = 'force-dynamic'

export default async function HubBackgroundPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect('/super-admin')

  const settings = await getSiteSettings()
  const initial = settings.hub_background ?? null

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">허브 배경 이미지</h1>
            <p className="text-sm text-muted-foreground mt-1">
              gwangjang.app (메인 허브) 의 배경 이미지를 설정합니다.
            </p>
          </div>
          <Link href="/super-admin" className="text-sm text-muted-foreground">
            ← 슈퍼 어드민
          </Link>
        </div>

        <HubBackgroundEditor initial={initial} />
      </div>
    </div>
  )
}
