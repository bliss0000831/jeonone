export type SearchCategory =
  | "secondhand"
  | "local_food"
  | "sharing"
  | "jobs"
  | "board"
  | "profiles"

export type SearchSort = "latest" | "popular"

export interface SearchHit {
  id: string
  category: SearchCategory
  title: string
  summary: string | null
  thumbnail: string | null
  location: string | null
  status: string | null
  href: string
  createdAt: string | null
  meta: Record<string, any>
}
