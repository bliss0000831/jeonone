/**
 * Clubs 도메인 타입.
 */

export type ClubStatus = 'recruiting' | 'full' | 'closed'

export type ClubSkillLevel = '누구나' | '초급' | '중급' | '고급'

export interface Club {
  id: string
  user_id: string
  plaza_id: string
  title: string
  description: string | null
  sport_type: string
  skill_level: ClubSkillLevel
  category: string | null
  max_members: number
  current_members: number
  status: ClubStatus
  meeting_date: string | null
  location: string | null
  images: string[] | null
  created_at: string
  updated_at: string
}

export interface ClubCreateInput {
  title: string
  description?: string | null
  sport_type: string
  skill_level: ClubSkillLevel
  category?: string | null
  max_members: number
  meeting_date?: string | null
  location?: string | null
  images?: string[]
}

export interface ClubMember {
  club_id: string
  user_id: string
  joined_at: string
  last_read_at?: string | null
}

export interface ClubFilter {
  plaza?: string
  sport_type?: string
  skill_level?: ClubSkillLevel
  status?: ClubStatus
}
