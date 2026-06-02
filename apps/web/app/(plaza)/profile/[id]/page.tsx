/**
 * 프로필 페이지 — 광장별 격리.
 *
 * 프로필 주인이 현재 광장에 가입(plaza_profiles) 안 돼있으면 404.
 * 슈퍼 admin 은 plaza_admins 의 super 로 모든 광장 노출.
 */
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { PublicProfileClient } from './client'

export const dynamic = 'force-dynamic'

interface ProfilePageProps {
  params: Promise<{ id: string }>
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { id } = await params
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    // 허브 도메인에선 프로필 직접 노출 X
    notFound()
  }

  const supabase = await createClient()

  // 프로필 주인이 이 광장 가입자(plaza_profiles) 인지 확인.
  // 슈퍼 admin 이라도 그 광장에 가입 안 했으면 프로필 노출 X (광장별 격리).
  const { data: pp } = await supabase
    .from('plaza_profiles')
    .select('plaza_id')
    .eq('user_id', id)
    .eq('plaza_id', plaza)
    .maybeSingle()

  if (!pp) {
    // 이 광장에 가입 안 한 사용자 → 404
    notFound()
  }

  return <PublicProfileClient userId={id} />
}
