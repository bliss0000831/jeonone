import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { dbToProperty, DbProperty } from "@/types/app"
import Link from "next/link"
import { ArrowLeft, Home, Plus } from "lucide-react"
import { PropertyManageCard } from "@/components/property-manage-card"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"

export default async function MyPropertiesPage() {
  const supabase = await createClient()
  
  // 현재 사용자 확인
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/auth/login?redirect=/my-properties")
  }

  // 내 매물 목록 가져오기 (현재 광장 한정)
  const plaza = await getCurrentPlaza()
  let propertiesQuery = supabase
    .from("properties")
    .select("*")
    .eq("user_id", user.id)
    // 올리기 반영 — effective_at(= COALESCE(bumped_at, created_at)) 정렬
    .order("effective_at", { ascending: false })
  if (plaza) propertiesQuery = propertiesQuery.eq("plaza_id", plaza)
  const { data: properties } = await propertiesQuery
  
  // 내 프로필 정보 가져오기
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id, nickname, phone, avatar_url, location")
    .eq("id", user.id)
    .single()
  
  // properties에 profiles 정보 매핑
  const propertiesWithProfiles = properties?.map(p => ({
    ...p,
    profiles: myProfile || null
  })) ?? []

  // 찜 개수 가져오기 (내 매물에 대해서만)
  const propertyIds = properties?.map(p => p.id) ?? []
  const favoriteCountMap: Record<string, number> = {}
  if (propertyIds.length > 0) {
    const { data: favoriteCounts } = await supabase
      .from("favorites")
      .select("property_id")
      .in("property_id", propertyIds)

    // 찜 개수 집계
    favoriteCounts?.forEach(f => {
      favoriteCountMap[f.property_id] = (favoriteCountMap[f.property_id] || 0) + 1
    })
  }

  // 매물 데이터 변환
  const convertedProperties = (propertiesWithProfiles as DbProperty[] | null)?.map(p => 
    dbToProperty(p, favoriteCountMap[p.id] || 0, false)
  ) ?? []

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <h1 className="font-semibold text-foreground">내 매물</h1>
            <Link href="/register">
              <Button variant="ghost" size="icon">
                <Plus className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {convertedProperties.length > 0 ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                등록한 매물 <span className="text-primary">{convertedProperties.length}</span>
              </h2>
            </div>
            <div className="space-y-3">
              {convertedProperties.map((property) => (
                <PropertyManageCard key={property.id} property={property} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Home className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              등록한 매물이 없어요
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              부동산을 직접 등록하고 판매해보세요
            </p>
            <Link 
              href="/register" 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              매물 등록하기
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
