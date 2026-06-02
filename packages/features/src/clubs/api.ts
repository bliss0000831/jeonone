/**
 * Clubs 도메인 — Supabase 호출. RN + 웹 공유.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Club, ClubFilter, ClubCreateInput } from './types'
import { getAuthorByPlaza } from '../profile/api'

export interface ClubPost {
  id: string
  user_id: string
  plaza_id: string
  title: string
  content: string | null
  description: string | null
  sport_type: string | null
  skill_level: string
  category: string | null
  max_members: number
  current_members: number
  status: 'recruiting' | 'full' | 'closed'
  meeting_date: string | null
  meeting_time: string | null
  location: string | null
  images: string[] | null
  view_count: number
  like_count: number
  created_at: string
  updated_at: string
  lat: number | null
  lng: number | null
}

export interface ClubProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
}

export async function listClubs(_supabase: SupabaseClient, _filter: ClubFilter): Promise<Club[]> {
  throw new Error('not implemented')
}

/** 모임 단건 + 작성자 + 조회수 증가 */
export async function getClubPost(
  supabase: SupabaseClient,
  id: string,
  plaza?: string | null,
): Promise<{ post: ClubPost | null; profile: ClubProfile | null }> {
  let q = supabase.from('clubs').select('*').eq('id', id)
  if (plaza) q = q.eq('plaza_id', plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, profile: null }
  // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
  const profile = await getAuthorByPlaza(
    supabase,
    (post as any).user_id,
    (post as any).plaza_id ?? plaza,
  )
  // 조회수 증가 — atomic RPC (다른 도메인과 동일 패턴, race condition 방지)
  void supabase.rpc('increment_view_count', {
    p_table: 'clubs',
    p_id: id,
    p_column: 'view_count',
  })
  return { post: post as ClubPost, profile: (profile as ClubProfile | null) ?? null }
}

export async function getClub(
  _supabase: SupabaseClient,
  _id: string,
  _plaza: string | null,
): Promise<Club | null> {
  throw new Error('not implemented')
}

export async function createClub(
  _supabase: SupabaseClient,
  _userId: string,
  _plaza: string,
  _input: ClubCreateInput,
): Promise<Club> {
  throw new Error('not implemented')
}

export async function isClubMember(
  supabase: SupabaseClient,
  clubId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('club_members')
    .select('user_id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function isClubLiked(
  supabase: SupabaseClient,
  clubId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('club_likes')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

/** 좋아요 토글 — like_count 증감 동기화 */
export async function toggleClubLike(
  supabase: SupabaseClient,
  args: { clubId: string; userId: string; isLiked: boolean; currentCount: number },
): Promise<{ liked: boolean; count: number }> {
  if (args.isLiked) {
    await Promise.all([
      supabase
        .from('club_likes')
        .delete()
        .eq('club_id', args.clubId)
        .eq('user_id', args.userId),
      supabase.rpc('change_like_count', {
        p_table: 'clubs',
        p_id: args.clubId,
        p_column: 'like_count',
        p_delta: -1,
      }),
    ])
    return { liked: false, count: Math.max(args.currentCount - 1, 0) }
  }
  await Promise.all([
    supabase
      .from('club_likes')
      .insert({ club_id: args.clubId, user_id: args.userId }),
    supabase.rpc('change_like_count', {
      p_table: 'clubs',
      p_id: args.clubId,
      p_column: 'like_count',
      p_delta: 1,
    }),
  ])
  return { liked: true, count: args.currentCount + 1 }
}

/** 모임 참여 — atomic RPC `club_join_atomic` */
export async function joinClubAtomic(
  supabase: SupabaseClient,
  clubId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; chatOpened?: boolean; current_members?: number; status?: string }> {
  const { data, error } = await supabase.rpc('club_join_atomic', {
    p_club_id: clubId,
    p_user_id: userId,
  })
  if (error) return { ok: false, error: error.message }
  const result = (data as any) ?? { ok: false, error: 'unknown' }
  if (!result.ok) return result
  const { data: refreshed } = await supabase
    .from('clubs')
    .select('current_members, status')
    .eq('id', clubId)
    .maybeSingle()
  const status = (refreshed as any)?.status
  return {
    ok: true,
    current_members: (refreshed as any)?.current_members,
    status,
    chatOpened: status === 'full',
  }
}

/** 모임 나가기 (모집중에만 — 모임장 제외) */
export async function leaveClub(
  supabase: SupabaseClient,
  clubId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  // 모임장 가드
  const { data: club } = await supabase
    .from('clubs')
    .select('user_id, current_members')
    .eq('id', clubId)
    .maybeSingle()
  if (!club) return { ok: false, error: '모임을 찾을 수 없습니다' }
  if ((club as any).user_id === userId) {
    return { ok: false, error: '모임장은 나갈 수 없습니다' }
  }
  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  // Atomic decrement via RPC — no CAS needed
  await supabase.rpc('change_like_count', {
    p_table: 'clubs',
    p_id: clubId,
    p_column: 'current_members',
    p_delta: -1,
  })
  return { ok: true }
}

/** 모임장: 강제 마감 — status=closed 로 전환 후 채팅방 오픈 */
export async function closeClub(
  supabase: SupabaseClient,
  clubId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('clubs')
    .update({ status: 'closed' })
    .eq('id', clubId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteClub(
  supabase: SupabaseClient,
  clubId: string,
): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', clubId)
  if (error) throw error
}

/**
 * 새 모임 생성 — 광장 web POST /api/clubs 와 동일.
 */
export interface ClubCreatePostInput {
  title: string
  description?: string | null
  content?: string | null
  category: string
  sport_type: string
  location?: string | null
  meeting_date?: string | null
  meeting_time?: string | null
  max_members: number
  skill_level: string
  images?: string[]
}

interface ClubsFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function createClubAtomic(
  fetcher: ClubsFetchAdapter,
  input: ClubCreatePostInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher('/api/clubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '처리에 실패했습니다' }
    return { ok: true, postId: data?.post?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

/** 모임 수정 — 광장 web PATCH /api/clubs/[id] 와 동일. */
export async function updateClub(
  fetcher: ClubsFetchAdapter,
  id: string,
  input: ClubCreatePostInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/clubs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '처리에 실패했습니다' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

export const CLUB_SPORT_TYPES = [
  '러닝', '배드민턴', '축구', '농구', '테니스',
  '등산', '수영', '자전거', '요가', '기타',
] as const

export const CLUB_SKILL_LEVELS = ['누구나', '초급', '중급', '고급'] as const
