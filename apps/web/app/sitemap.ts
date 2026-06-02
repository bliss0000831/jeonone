/**
 * sitemap.xml 동적 생성.
 *
 * 허브 (gwangjang.app) 의 sitemap 은 모든 plaza subdomain 의 entry point 를 포함.
 * 각 plaza subdomain 의 sitemap 은 그 광장의 detail page 들을 나열.
 *
 * Vercel build 시점에 한 번 + 24시간마다 revalidate.
 */
import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export const revalidate = 86400 // 24h

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gwangjang.app'

function plazaUrl(plazaId: string, path: string = ''): string {
  return `https://${plazaId}.gwangjang.app${path}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const host = h.get('host') || ''
  const isHub = !host.match(/^[a-z-]+\.gwangjang\.(app|kr)$/)

  const supabase = await createClient()

  if (isHub) {
    // ─── 허브 sitemap ───
    // 활성 광장 + 정적 페이지
    const { data: plazas } = await supabase
      .from('plazas')
      .select('id')
      .eq('is_active', true)

    const entries: MetadataRoute.Sitemap = [
      { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
      ...(plazas || []).map((p) => ({
        url: plazaUrl(p.id, '/'),
        changeFrequency: 'daily' as const,
        priority: 0.9,
      })),
    ]
    return entries
  }

  // ─── plaza subdomain sitemap ───
  const plazaMatch = host.match(/^([a-z-]+)\.gwangjang\.(app|kr)$/)
  const plazaId = plazaMatch?.[1]
  if (!plazaId) return []

  const baseUrl = plazaUrl(plazaId)
  const staticPaths = [
    '',
    '/properties',
    '/board',
    '/secondhand',
    '/jobs',
    '/sharing',
    '/group-buying',
    '/clubs',
    '/local-food',
    '/new-store',
    '/interior',
    '/moving',
    '/cleaning',
    '/repair',
    '/notice',
    '/faq',
  ]

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${baseUrl}${p}`,
    changeFrequency: 'daily',
    priority: p === '' ? 1.0 : 0.7,
  }))

  // detail page들 — 각 카테고리 최신 100개 정도만 (sitemap 너무 비대해지지 않게)
  const dynamicEntries: MetadataRoute.Sitemap = []
  const tableMap: Record<string, string> = {
    properties: 'property',
    secondhand_posts: 'secondhand',
    jobs_posts: 'jobs',
    sharing_posts: 'sharing',
    group_buying_posts: 'group-buying',
    clubs: 'clubs',
    board_posts: 'board',
    new_store_posts: 'new-store',
  }

  for (const [table, urlPrefix] of Object.entries(tableMap)) {
    try {
      const { data } = await (supabase as any)
        .from(table)
        .select('id, updated_at')
        .eq('plaza_id', plazaId)
        .order('updated_at', { ascending: false })
        .limit(200)
      ;(data || []).forEach((row: any) => {
        dynamicEntries.push({
          url: `${baseUrl}/${urlPrefix}/${row.id}`,
          lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      })
    } catch {
      // 일부 테이블 fail 해도 sitemap 생성은 계속
    }
  }

  return [...staticEntries, ...dynamicEntries]
}
