"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserLocation } from "@/components/location-selector"
import { Plus, Search, MapPin, Carrot, Heart, Eye, Loader2, ChevronRight } from "lucide-react"
import { ListSortRegionBar, usePlazaRegions, type ListSortKey } from "@/components/listing"

const DEFAULT_CATEGORIES = ["전체", "채소", "과일", "쌀/잡곡", "축산물", "수산물", "가공식품", "기타"]
const FALLBACK_IMG = "/images/card-local-food.jpg"

interface Post {
  id: string
  user_id: string
  title: string
  price: number
  unit?: string | null
  category: string
  location?: string | null
  images?: string[] | null
  likes?: number
  views?: number
}

function formatPrice(price: number) {
  if (!price) return "가격문의"
  if (price >= 10000) return `${(price / 10000).toLocaleString()}만원`
  return `${price.toLocaleString()}원`
}

function LocalFoodContent() {
  const [user, setUser] = useState<User | null>(null)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [canWrite, setCanWrite] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [category, setCategory] = useState("전체")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [sort, setSort] = useState<ListSortKey>("latest")
  const [region, setRegion] = useState("all")
  const regions = usePlazaRegions()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    try { const s = localStorage.getItem("user-location"); if (s) setUserLocation(JSON.parse(s)) } catch {}
    fetch("/api/categories?type=local_food")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length) setCategories(["전체", ...d.map((c: any) => c.name)]) })
      .catch(() => {})
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (!user) return
      Promise.all([
        supabase.from("profiles").select("account_type, role").eq("id", user.id).single(),
        supabase.from("plaza_admins").select("role").eq("user_id", user.id),
      ]).then(([{ data: profile }, { data: paRows }]) => {
        const r = (profile as any)?.role
        const isAdmin = r === "admin" || r === "superadmin" || ((paRows as any[]) ?? []).some((x) => x?.role === "super")
        setCanWrite((profile as any)?.account_type === "producer" || isAdmin)
      })
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: "50" })
    if (category !== "전체") params.set("category", category)
    if (debounced.trim()) params.set("q", debounced.trim())
    if (sort !== "latest") params.set("sort", sort)
    if (region !== "all") params.set("region", region)
    fetch(`/api/local-food?${params}`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [category, debounced, sort, region])

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      <Header
        user={user}
        location={userLocation}
        onLocationChange={(loc) => { setUserLocation(loc); try { localStorage.setItem("user-location", JSON.stringify(loc)) } catch {} }}
      />

      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src={FALLBACK_IMG} alt="강원 로컬푸드" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <div className="text-center text-white">
            <Carrot className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">강원 로컬푸드</h1>
            <p className="text-base md:text-xl mt-1.5">방금 수확한 신선한 농산물</p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="찾으시는 농산물을 검색하세요"
              className="w-full pl-12 pr-4 py-3.5 text-base rounded-xl border-2 border-border bg-card focus:outline-none focus:border-primary" />
          </div>
          {canWrite && (
            <Link href="/local-food/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3.5 hover:bg-primary/90">
              <Plus className="w-5 h-5" /> 농산물 올리기
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-4 py-2.5 rounded-lg text-sm md:text-base font-bold border-2 transition-colors ${category === c ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
              {c}
            </button>
          ))}
        </div>

        {/* 지역(시군) 필터 + 정렬 */}
        <ListSortRegionBar
          sort={sort}
          onSortChange={setSort}
          region={region}
          onRegionChange={setRegion}
          regions={regions}
          count={loading ? undefined : posts.length}
        />

        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Carrot className="w-10 h-10 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground">아직 등록된 로컬푸드가 없어요</p>
            <p className="text-base text-muted-foreground mt-1">우리 동네 첫 이웃이 되어 올려보세요!</p>
            {user && (
              <Link href="/local-food/register" className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-bold px-6 py-3 text-base">
                <Plus className="w-5 h-5" /> 첫 농산물 올리기
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((item) => (
              <Link key={item.id} href={`/local-food/${item.id}`} className="rounded-xl border-2 border-border overflow-hidden bg-card hover:shadow-lg transition-shadow group">
                <div className="relative h-56 bg-muted">
                  <Image src={item.images?.[0] || FALLBACK_IMG} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  <span className="absolute top-3 right-3 text-sm font-bold px-3 py-1 rounded-md bg-primary text-primary-foreground">{item.category || "기타"}</span>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xl font-black text-primary mb-2">{formatPrice(item.price)}{item.unit ? <span className="text-sm font-bold text-muted-foreground"> / {item.unit}</span> : null}</p>
                  {item.location && <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="w-4 h-4" />{item.location}</div>}
                  <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="w-4 h-4" />{item.likes ?? 0}</span>
                    <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{item.views ?? 0}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-primary font-bold">자세히 <ChevronRight className="w-4 h-4" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

export default function LocalFoodPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <LocalFoodContent />
    </Suspense>
  )
}
