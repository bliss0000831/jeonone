import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { dbToProperty, DbProperty } from "@/types/app"

export const dynamic = 'force-dynamic'
import Link from "next/link"
import { ArrowLeft, Heart } from "lucide-react"
import { PropertyCard } from "@/components/property-card"
import { BottomNav } from "@/components/bottom-nav"

// ── 부동산 외 찜 가능한 도메인 집계 설정 ───────────────────────────
type DomainCfg = {
  kind: string
  label: string
  likeTable: string
  col: string
  postTable: string
  href: string
  meta: (r: any) => string | null
}

const won = (n: any): string | null =>
  n != null && !Number.isNaN(Number(n)) ? Number(n).toLocaleString() : null

// 서비스(인테리어/이사/청소/수리) 공통 가격 표기
const serviceMeta = (r: any): string | null => {
  const unit = r?.price_unit || "만원"
  if (r?.min_price || r?.max_price) {
    return [won(r.min_price), won(r.max_price)].filter(Boolean).join("~") + unit
  }
  return "가격 문의"
}

const DOMAINS: DomainCfg[] = [
  { kind: "secondhand", label: "중고거래", likeTable: "secondhand_likes", col: "post_id", postTable: "secondhand_posts", href: "/secondhand", meta: (r) => (r?.price > 0 ? `${won(r.price)}원` : "가격 제안") },
  { kind: "sharing", label: "나눔", likeTable: "sharing_likes", col: "post_id", postTable: "sharing_posts", href: "/sharing", meta: () => "나눔" },
  { kind: "group-buying", label: "공동구매", likeTable: "group_buying_wishlist", col: "post_id", postTable: "group_buying_posts", href: "/group-buying", meta: (r) => (won(r?.price) ? `${won(r.price)}원` : null) },
  { kind: "clubs", label: "모임", likeTable: "club_likes", col: "club_id", postTable: "clubs", href: "/clubs", meta: () => "모임" },
  { kind: "local-food", label: "로컬푸드", likeTable: "local_food_likes", col: "local_food_id", postTable: "local_food", href: "/local-food", meta: (r) => (won(r?.price) ? `${won(r.price)}원` : null) },
  { kind: "board", label: "게시판", likeTable: "board_post_likes", col: "post_id", postTable: "board_posts", href: "/board", meta: () => "게시글" },
  { kind: "new-store", label: "신장개업", likeTable: "new_store_likes", col: "post_id", postTable: "new_store_posts", href: "/new-store", meta: () => "신장개업" },
  { kind: "interior", label: "인테리어", likeTable: "interior_favorites", col: "post_id", postTable: "interior_posts", href: "/interior", meta: serviceMeta },
  { kind: "moving", label: "이사", likeTable: "moving_favorites", col: "post_id", postTable: "moving_posts", href: "/moving", meta: serviceMeta },
  { kind: "cleaning", label: "청소", likeTable: "cleaning_favorites", col: "post_id", postTable: "cleaning_posts", href: "/cleaning", meta: serviceMeta },
  { kind: "repair", label: "수리", likeTable: "repair_favorites", col: "post_id", postTable: "repair_posts", href: "/repair", meta: serviceMeta },
]

function firstImage(r: any): string | null {
  const imgs = r?.images
  if (Array.isArray(imgs) && imgs.length > 0) {
    const f = imgs[0]
    if (typeof f === "string") return f
    if (f && typeof f === "object" && typeof f.url === "string") return f.url
  }
  if (typeof r?.thumbnail_url === "string" && r.thumbnail_url) return r.thumbnail_url
  if (typeof r?.image_url === "string" && r.image_url) return r.image_url
  return null
}

function titleOf(r: any): string {
  return r?.title || r?.store_name || r?.name || "(제목 없음)"
}

interface FavItem {
  key: string
  href: string
  label: string
  title: string
  image: string | null
  meta: string | null
  favedAt: string
}

export default async function FavoritesPage() {
  const supabase = await createClient()

  // 현재 사용자 확인
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login?redirect=/favorites")
  }

  // 찜 목록 가져오기 — 현재 광장의 매물 찜만
  const plaza = await getCurrentPlaza()
  const { data: favoritesRaw } = await supabase
    .from("favorites")
    .select(`
      property_id,
      properties:property_id (*)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)

  // 광장 필터: 매물이 현재 광장 소속인 것만 통과
  const favorites = (favoritesRaw ?? []).filter((f: any) => {
    if (!plaza) return true
    const p = f.properties as any
    return p && p.plaza_id === plaza
  })

  // 매물의 판매자 프로필 정보 별도로 가져오기
  const propertyUserIds = [...new Set(favorites?.map(f => (f.properties as unknown as DbProperty)?.user_id).filter(Boolean) ?? [])]
  let profilesMap: Record<string, { id: string; nickname: string | null; phone: string | null; avatar_url: string | null; location: string | null }> = {}

  if (propertyUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, phone, avatar_url, location")
      .in("id", propertyUserIds)

    profiles?.forEach(p => {
      profilesMap[p.id] = p
    })
  }

  // 찜 개수 — 이 사용자의 매물 ID 들만 필터링해서 가져오기 (2026-04 audit, #4).
  const myPropertyIds = favorites?.map(f => f.property_id).filter(Boolean) ?? []
  const favoriteCountMap: Record<string, number> = {}
  if (myPropertyIds.length > 0) {
    const { data: favoriteCounts } = await supabase
      .from("favorites")
      .select("property_id")
      .in("property_id", myPropertyIds)
    favoriteCounts?.forEach(f => {
      favoriteCountMap[f.property_id] = (favoriteCountMap[f.property_id] || 0) + 1
    })
  }

  // 매물 데이터 추출 및 변환 (프로필 정보 추가)
  const properties = favorites
    ?.map(f => f.properties)
    .filter(p => p !== null)
    .map(p => {
      const prop = p as unknown as DbProperty
      const propertyWithProfile = {
        ...prop,
        profiles: profilesMap[prop.user_id] || null
      }
      return dbToProperty(
        propertyWithProfile,
        favoriteCountMap[prop.id] || 0,
        true // 찜 목록이므로 모두 찜함
      )
    }) ?? []

  // ── 부동산 외 도메인 찜 집계 (광장 격리) ──────────────────────
  const otherFavs: FavItem[] = (
    await Promise.all(
      DOMAINS.map(async (d): Promise<FavItem[]> => {
        try {
          let lq: any = (supabase as any)
            .from(d.likeTable)
            .select(`${d.col}, created_at`)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50)
          if (plaza) lq = lq.eq("plaza_id", plaza)
          const { data: likes, error } = await lq
          if (error || !likes || likes.length === 0) return []

          const createdMap = new Map<string, string>()
          const ids: string[] = []
          for (const l of likes as any[]) {
            const id = l[d.col]
            if (id && !createdMap.has(id)) {
              createdMap.set(id, l.created_at)
              ids.push(id)
            }
          }
          if (ids.length === 0) return []

          const { data: rows } = await (supabase as any)
            .from(d.postTable)
            .select("*")
            .in("id", ids)

          return ((rows ?? []) as any[]).map((r) => ({
            key: `${d.kind}:${r.id}`,
            href: `${d.href}/${r.id}`,
            label: d.label,
            title: titleOf(r),
            image: firstImage(r),
            meta: d.meta(r),
            favedAt: createdMap.get(r.id) ?? "",
          }))
        } catch {
          // 테이블 없음/권한 등 — 해당 도메인만 건너뜀(다른 도메인 영향 없음)
          return []
        }
      }),
    )
  )
    .flat()
    .sort((a, b) => (a.favedAt < b.favedAt ? 1 : a.favedAt > b.favedAt ? -1 : 0))

  const hasAny = properties.length > 0 || otherFavs.length > 0

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <h1 className="font-semibold text-foreground">찜 목록</h1>
            <div className="w-9" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {hasAny ? (
          <div className="space-y-8">
            {/* 관심 매물 (부동산) */}
            {properties.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-foreground">
                    관심 매물 <span className="text-primary">{properties.length}</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {properties.map((property) => (
                    <PropertyCard key={property.id} property={property} currentUserId={user.id} />
                  ))}
                </div>
              </section>
            )}

            {/* 그 외 찜한 게시물 */}
            {otherFavs.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-foreground">
                    찜한 게시물 <span className="text-primary">{otherFavs.length}</span>
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {otherFavs.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="group block rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Heart className="w-6 h-6" />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-black/60 text-white">
                          {item.label}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{item.title}</p>
                        {item.meta && (
                          <p className="mt-1 text-sm font-semibold text-primary">{item.meta}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Heart className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              찜한 게시물이 없어요
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              마음에 드는 게시물에 하트를 눌러 저장해보세요
            </p>
            <Link
              href="/"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              둘러보기
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
