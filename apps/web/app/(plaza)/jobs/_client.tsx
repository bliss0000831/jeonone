"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserLocation } from "@/components/location-selector"
import { Plus, Search, MapPin, Users, Clock, Loader2, ChevronRight } from "lucide-react"
import { ListSortRegionBar, usePlazaRegions, LoadMoreButton, type ListSortKey } from "@/components/listing"

const KINDS = [
  { value: "all", label: "전체" },
  { value: "hiring", label: "구인" },
  { value: "seeking", label: "구직" },
]
const FALLBACK_IMG = "/images/card-workers.jpg"

interface Post {
  id: string
  user_id: string
  title: string
  kind?: string
  hourly_wage?: number | null
  work_type?: string | null
  work_days?: string | null
  location?: string | null
  category?: string | null
}

function formatWage(wage?: number | null) {
  if (!wage || wage <= 0) return "협의"
  if (wage >= 10000) return `시급 ${(wage / 10000).toFixed(wage % 10000 ? 1 : 0)}만원`
  return `시급 ${wage.toLocaleString()}원`
}

function JobsContent() {
  const [user, setUser] = useState<User | null>(null)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [kind, setKind] = useState("all")
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
    createClient().auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const fetchPosts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: "50", offset: "0" })
    if (sort !== "latest") params.set("sort", sort)
    if (region !== "all") params.set("region", region)
    fetch(`/api/jobs?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { const list = d.posts || []; setPosts(list); setHasMore(list.length >= 50) })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [sort, region])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const params = new URLSearchParams({ limit: "50", offset: String(posts.length) })
    if (sort !== "latest") params.set("sort", sort)
    if (region !== "all") params.set("region", region)
    try {
      const r = await fetch(`/api/jobs?${params.toString()}`)
      const d = await r.json()
      const more = d.posts || []
      setPosts((prev) => [...prev, ...more])
      setHasMore(more.length >= 50)
    } catch { /* keep current list */ } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, posts.length, sort, region])

  const filtered = posts.filter((p) => {
    const mk = kind === "all" || p.kind === kind
    const ms = !debounced.trim() || p.title?.toLowerCase().includes(debounced.trim().toLowerCase())
    return mk && ms
  })

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      <Header
        user={user}
        location={userLocation}
        onLocationChange={(loc) => { setUserLocation(loc); try { localStorage.setItem("user-location", JSON.stringify(loc)) } catch {} }}
      />

      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src={FALLBACK_IMG} alt="일손 찾기" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <Users className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">일손 찾기</h1>
            <p className="text-base md:text-xl mt-1.5">품앗이 · 구인 · 구직</p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색어를 입력하세요"
              className="w-full pl-12 pr-4 py-3.5 text-base rounded-xl border-2 border-border bg-card focus:outline-none focus:border-primary" />
          </div>
          {user && (
            <Link href="/jobs/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3.5 hover:bg-primary/90">
              <Plus className="w-5 h-5" /> 일손 등록
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {KINDS.map((k) => (
            <button key={k.value} onClick={() => setKind(k.value)}
              className={`px-5 py-2.5 rounded-lg text-sm md:text-base font-bold border-2 transition-colors ${kind === k.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
              {k.label}
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
          count={loading ? undefined : filtered.length}
        />

        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground">아직 등록된 일손 글이 없어요</p>
            <p className="text-base text-muted-foreground mt-1">우리 동네 첫 이웃이 되어 올려보세요!</p>
            {user && (
              <Link href="/jobs/register" className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-bold px-6 py-3 text-base">
                <Plus className="w-5 h-5" /> 첫 일손 글 올리기
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((item) => (
              <Link key={item.id} href={`/jobs/${item.id}`} className="rounded-xl border-2 border-border bg-card p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${item.kind === "seeking" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
                    {item.kind === "seeking" ? "구직" : "구인"}
                  </span>
                  {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                </div>
                <h3 className="text-lg font-bold mb-2 line-clamp-1">{item.title}</h3>
                <p className="text-lg font-black text-primary mb-2">{formatWage(item.hourly_wage)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {item.work_type && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{item.work_type}</span>}
                  {item.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{item.location}</span>}
                  <span className="ml-auto inline-flex items-center gap-1 text-primary font-bold">자세히 <ChevronRight className="w-4 h-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
      </main>

      <BottomNav />
    </div>
  )
}

export default function JobsPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <JobsContent />
    </Suspense>
  )
}
