"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { MediaThumbnail } from "@/components/media-thumbnail"
import { formatPropertyPrice } from "@/lib/features/property"
import { DbProperty, Property, dbToProperty } from "@/types/app"
import { cn, stripRegionPrefix } from "@/lib/utils"
import { Loader2, ArrowLeft, Building2, Eye, Heart, BarChart2 } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"

interface CompareRow {
  label: string
  render: (p: Property) => React.ReactNode
}

const COMPARE_ROWS: CompareRow[] = [
  {
    label: "이미지",
    render: (p) =>
      p.images && p.images.length > 0 ? (
        <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted">
          <MediaThumbnail src={p.images[0]} alt={p.title} className="object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-[4/3] rounded-lg bg-muted flex items-center justify-center">
          <Building2 className="w-8 h-8 text-muted-foreground/30" />
        </div>
      ),
  },
  {
    label: "제목",
    render: (p) => (
      <Link href={`/property/${p.id}`} className="text-sm font-semibold hover:text-primary transition-colors line-clamp-2">
        {p.title}
      </Link>
    ),
  },
  {
    label: "가격",
    render: (p) => <span className="text-base font-extrabold tracking-tight">{formatPropertyPrice(p)}</span>,
  },
  {
    label: "거래유형",
    render: (p) => (
      <span
        className={cn(
          "inline-block px-2.5 py-1 text-xs font-bold rounded-lg",
          p.transactionType === "매매" && "bg-primary text-primary-foreground",
          p.transactionType === "전세" && "bg-amber-500 text-white",
          p.transactionType === "월세" && "bg-rose-500 text-white",
        )}
      >
        {p.transactionType}
      </span>
    ),
  },
  {
    label: "면적",
    render: (p) => <span className="text-sm">{p.area}m² ({(p.area * 0.3025).toFixed(1)}평)</span>,
  },
  {
    label: "위치",
    render: (p) => <span className="text-sm text-muted-foreground">{stripRegionPrefix(p.district)}</span>,
  },
  {
    label: "조회수",
    render: (p) => (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Eye className="w-3.5 h-3.5" /> {p.views}
      </span>
    ),
  },
  {
    label: "찜",
    render: (p) => (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Heart className="w-3.5 h-3.5" /> {p.likes}
      </span>
    ),
  },
]

function ComparePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let alive = true
    const idsParam = searchParams?.get("ids") ?? ""
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)

    if (ids.length === 0) {
      setLoading(false)
      return
    }

    ;(async () => {
      const supabase = createClient()
      const plaza = getCurrentPlazaClient()

      const [{ data: { user } }, propsRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("properties")
          .select(
            "id, user_id, title, property_type, transaction_type, price, monthly_rent, maintenance_fee, area_sqm, floor_info, total_floors, rooms, bathrooms, address, lat, lng, description, images, features, move_in_date, direction, parking, elevator, pet_allowed, views, status, seller_type, is_featured, created_at, updated_at, bumped_at, effective_at, profiles:user_id(id, nickname, phone, avatar_url, account_type, location)"
          )
          .in("id", ids),
      ])

      if (!alive) return
      setUser(user)

      if (propsRes.error || !propsRes.data) {
        console.error("Error fetching compare properties:", propsRes.error)
        setLoading(false)
        return
      }

      // Favorite counts
      const favoriteCountMap: Record<string, number> = {}
      const propertyIds = propsRes.data.map((p: any) => p.id)
      if (propertyIds.length > 0) {
        const { data: counts } = await supabase.rpc("get_property_favorite_counts", {
          p_plaza_id: plaza ?? "",
          p_property_ids: propertyIds,
        })
        if (!alive) return
        if (Array.isArray(counts)) {
          for (const row of counts as any[]) {
            favoriteCountMap[row.property_id] = Number(row.favorite_count ?? 0)
          }
        }
      }

      // User favorites
      let favIds: string[] = []
      if (user) {
        let favQ: any = supabase.from("favorites").select("property_id").eq("user_id", user.id)
        if (plaza) favQ = favQ.eq("plaza_id", plaza)
        const { data: favorites } = await favQ
        if (!alive) return
        favIds = favorites?.map((f: any) => f.property_id) ?? []
      }

      const profilesMap: Record<string, any> = {}
      propsRes.data.forEach((p: any) => {
        if (p.profiles) profilesMap[p.user_id] = p.profiles
      })

      const withProfiles = propsRes.data.map((p: any) => ({
        ...p,
        profiles: profilesMap[p.user_id] || null,
      }))

      const converted = (withProfiles as DbProperty[]).map((p) =>
        dbToProperty(p, favoriteCountMap[p.id] || 0, favIds.includes(p.id))
      )

      // Preserve original order from ids param
      const ordered = ids
        .map((id) => converted.find((p) => p.id === id))
        .filter(Boolean) as Property[]

      if (!alive) return
      setProperties(ordered)
      setLoading(false)
    })()

    return () => {
      alive = false
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">매물 비교</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium text-foreground mb-1">비교할 매물이 없습니다</h3>
            <p className="text-xs text-muted-foreground">매물 목록에서 비교할 매물을 선택해주세요</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <colgroup>
                  <col className="w-24" />
                  {properties.map((p) => (
                    <col key={p.id} />
                  ))}
                </colgroup>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground bg-muted/30 whitespace-nowrap align-middle">
                        {row.label}
                      </td>
                      {properties.map((p) => (
                        <td key={p.id} className="px-4 py-3 align-middle">
                          {row.render(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ComparePageContent />
    </Suspense>
  )
}
