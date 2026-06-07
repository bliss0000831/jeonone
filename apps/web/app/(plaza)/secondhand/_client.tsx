"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { UserLocation } from "@/components/location-selector"
import { Plus, Search, MapPin, Calendar, Tractor, Heart, Eye, Loader2, ChevronRight } from "lucide-react"
import { formatPriceKR, formatDateKR } from "@/lib/format-price"

// 농기구/자재 카테고리 (레퍼런스 동일)
const CATEGORIES = ["전체", "트랙터", "경운기", "이양기", "수확기", "관리기", "하우스자재", "부품", "기타"]
const PAGE_SIZE = 24
const FALLBACK_IMG = "/images/card-farm-equipment.jpg"

interface Post {
  id: string
  user_id: string
  title: string
  price: number
  category: string
  location?: string | null
  condition?: string | null
  model_year?: string | number | null
  images?: string[] | null
  likes?: number
  views?: number
  status?: string
  created_at?: string | null
}

function SecondhandContent() {
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(searchParams.get("category") ?? "전체")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("user-location")
      if (saved) setUserLocation(JSON.parse(saved))
    } catch {}
    createClient().auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const fetchPosts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("limit", String(PAGE_SIZE))
    params.set("offset", "0")
    params.set("status", "active")
    if (debounced.trim()) params.set("q", debounced.trim())
    if (category !== "전체") params.set("category", category)
    fetch(`/api/secondhand?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [debounced, category])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      <Header
        user={user}
        location={userLocation}
        onLocationChange={(loc) => { setUserLocation(loc); try { localStorage.setItem("user-location", JSON.stringify(loc)) } catch {} }}
      />

      {/* 히어로 */}
      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src={FALLBACK_IMG} alt="농기구/자재 장터" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <Tractor className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">농기구/자재 장터</h1>
            <p className="text-base md:text-xl mt-1.5">트랙터, 경운기, 하우스 자재 등</p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        {/* 대여 장터 진입 배너 */}
        <Link href="/rental" className="flex items-center justify-between gap-3 rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 mb-5 hover:bg-primary/15 transition-colors">
          <span className="flex items-center gap-2 font-bold text-primary">🚜 농기구 대여 장터</span>
          <span className="text-sm font-semibold text-primary inline-flex items-center gap-1">필요할 때 빌려쓰기 <ChevronRight className="w-4 h-4" /></span>
        </Link>

        {/* 검색 + 글쓰기 */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="트랙터, 경운기 이름으로 찾기"
              className="w-full pl-12 pr-4 py-3.5 text-base rounded-xl border-2 border-border bg-card focus:outline-none focus:border-primary"
            />
          </div>
          {user && (
            <Link href="/secondhand/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3.5 hover:bg-primary/90">
              <Plus className="w-5 h-5" /> 농기구 올리기
            </Link>
          )}
        </div>

        {/* 카테고리 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2.5 rounded-lg text-sm md:text-base font-bold border-2 transition-colors ${
                category === c ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Tractor className="w-10 h-10 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground">아직 등록된 농기구가 없어요</p>
            <p className="text-base text-muted-foreground mt-1">우리 동네 첫 이웃이 되어 올려보세요!</p>
            {user && (
              <Link href="/secondhand/register" className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-bold px-6 py-3 text-base">
                <Plus className="w-5 h-5" /> 농기구 올리기
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((item) => (
              <Link key={item.id} href={`/secondhand/${item.id}`} className="rounded-xl border-2 border-border overflow-hidden bg-card hover:shadow-lg transition-shadow group">
                <div className="relative h-56 bg-muted">
                  <Image src={item.images?.[0] || FALLBACK_IMG} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  <span className="absolute top-3 right-3 text-sm font-bold px-3 py-1 rounded-md bg-primary text-primary-foreground">{item.category || "기타"}</span>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xl font-black text-primary mb-2">{formatPriceKR(item.price)}</p>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {item.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        <span>{item.location}{item.created_at ? ` · ${formatDateKR(item.created_at)}` : ""}</span>
                      </div>
                    )}
                    {(item.model_year || item.condition) && (
                      <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{[item.model_year && `${item.model_year}년식`, item.condition && `상태 ${item.condition}`].filter(Boolean).join(" / ")}</div>
                    )}
                  </div>
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

export default function SecondhandPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <SecondhandContent />
    </Suspense>
  )
}
