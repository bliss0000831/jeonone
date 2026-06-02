export type SearchCategory =
  | "properties"
  | "board"
  | "sharing"
  | "clubs"
  | "group_buying"
  | "local_food"
  | "services"
  | "new_store"
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
