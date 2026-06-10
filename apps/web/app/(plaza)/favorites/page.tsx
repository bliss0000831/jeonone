import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getCurrentPlaza } from "@/lib/plaza/server"

export const dynamic = 'force-dynamic'
import Link from "next/link"
import { ArrowLeft, Heart } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"

// ── 찜 가능한 도메인 집계 설정 ───────────────────────────
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

const DOMAINS: DomainCfg[] = [
  { kind: "secondhand", label: "중고거래", likeTable: "secondhand_likes", col: "post_id", postTable: "secondhand_posts", href: "/secondhand", meta: (r) => (r?.price > 0 ? `${won(r.price)}원` : "가격 제안") },
  { kind: "sharing", label: "나눔", likeTable: "sharing_likes", col: "post_id", postTable: "sharing_posts", href: "/sharing", meta: () => "나눔" },
  { kind: "local-food", label: "로컬푸드", likeTable: "local_food_likes", col: "local_food_id", postTable: "local_food", href: "/local-food", meta: (r) => (won(r?.price) ? `${won(r.price)}원` : null) },
  { kind: "board", label: "소식통", likeTable: "board_post_likes", col: "post_id", postTable: "board_posts", href: "/board", meta: () => "게시글" },
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

  const plaza = await getCurrentPlaza()

  // ── 도메인 찜 집계 (광장 격리) ──────────────────────
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

  const hasAny = otherFavs.length > 0

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
            {/* 찜한 게시물 */}
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
