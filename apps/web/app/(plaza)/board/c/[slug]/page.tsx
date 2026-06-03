"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import type { User } from "@supabase/supabase-js"
import {
  MessageSquare, Camera, Gift, Lightbulb, Coins, HelpCircle,
  Plus, Search, Eye, Heart, MessageCircle, TrendingUp, User as UserIcon, ImageIcon, Phone, ChevronRight,
} from "lucide-react"

const CATEGORIES = [
  { slug: "free", label: "자유게시판", icon: MessageSquare, desc: "자유롭게 이야기를 나눠요" },
  { slug: "daily", label: "일상 공유", icon: Camera, desc: "이웃과 일상을 나눠요" },
  { slug: "share", label: "무료 나눔", icon: Gift, desc: "필요한 물건을 나눠요" },
  { slug: "life", label: "생활 정보", icon: Lightbulb, desc: "생활 정보를 나눠요" },
  { slug: "subsidy", label: "정부 지원금", icon: Coins, desc: "이웃 건의한 정부 지원금 정보를 나눠요" },
  { slug: "qna", label: "질문 답변", icon: HelpCircle, desc: "궁금한 걸 물어보세요" },
]

interface Post {
  id: string
  title: string
  content?: string
  author_name?: string
  view_count?: number
  like_count?: number
  comment_count?: number
  images?: string[] | null
  thumbnail_url?: string | null
  created_at: string
  region?: string | null
}

function fmtDate(s: string) {
  const d = new Date(s)
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()]
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`
}

export default function BoardCategoryPage() {
  const params = useParams()
  const slug = (typeof params.slug === "string" ? params.slug : params.slug?.[0]) || "free"
  const meta = CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0]
  const Icon = meta.icon

  const [user, setUser] = useState<User | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    try {
      let catQ = supabase.from("board_categories").select("id").eq("slug", slug)
      if (plaza) catQ = catQ.eq("plaza_id", plaza)
      const { data: cat } = await catQ.limit(1).maybeSingle()
      if (!cat) { setPosts([]); setLoading(false); return }
      let q = supabase.from("board_posts").select("*").eq("category_id", (cat as any).id).order("created_at", { ascending: false }).limit(60)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q
      setPosts(((data as any[]) || []).filter((p) => p.status !== "hidden"))
    } catch {
      setPosts([])
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const filtered = posts.filter((p) => p.title?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header user={user} />

      {/* 녹색 카테고리 탭바 */}
      <nav className="bg-primary sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 py-2">
            {CATEGORIES.map((c) => {
              const CIcon = c.icon
              const active = c.slug === slug
              return (
                <Link key={c.slug} href={`/board/c/${c.slug}`}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${active ? "bg-white text-primary shadow" : "text-primary-foreground hover:bg-white/10"}`}>
                  <CIcon className="w-4 h-4" />{c.label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* 제목 + 글쓰기 */}
          <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2"><Icon className="w-7 h-7 text-primary" />{meta.label}</h1>
              <p className="text-muted-foreground mt-1 text-sm">{meta.desc}</p>
            </div>
            <Link href={`/board/create?category=${slug}`} className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3 hover:bg-primary/90">
              <Plus className="w-5 h-5" /> 글쓰기
            </Link>
          </div>

          {/* 검색 */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="게시글 검색..."
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-border bg-card text-base focus:outline-none focus:border-primary" />
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* 목록 */}
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="text-center py-16 text-muted-foreground">로딩 중...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">아직 게시글이 없습니다</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((post) => {
                    const thumb = post.thumbnail_url || post.images?.[0]
                    return (
                      <div key={post.id} className="bg-card border rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                        <Link href={`/board/${post.id}`} className="block">
                          <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                            {thumb ? <Image src={thumb} alt={post.title} fill className="object-cover" /> : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5"><Icon className="w-12 h-12 text-primary/30" /></div>
                            )}
                          </div>
                        </Link>
                        <div className="p-3">
                          <Link href={`/board/${post.id}`}><h3 className="text-base font-bold hover:text-primary line-clamp-2 leading-tight h-[2.5rem]">{post.title}</h3></Link>
                          <div className="border-t my-2" />
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <span className="font-medium text-foreground/80">{post.author_name || "이웃"}</span><span>·</span><span>{fmtDate(post.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Eye className="w-3.5 h-3.5" />{post.view_count ?? 0}</span>
                            <span className="flex items-center gap-0.5 text-rose-500"><Heart className="w-3.5 h-3.5" />{post.like_count ?? 0}</span>
                            <span className="flex items-center gap-0.5"><MessageCircle className="w-3.5 h-3.5" />{post.comment_count ?? 0}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 사이드바 */}
            <aside className="w-full lg:w-72 flex-shrink-0 space-y-4">
              <div className="rounded-2xl border bg-card p-5 text-center">
                <div className="flex items-center justify-center gap-1.5 font-bold mb-4"><TrendingUp className="w-4 h-4 text-primary" />우리 마을 활동왕</div>
                <UserIcon className="w-9 h-9 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">활동 데이터가 없습니다</p>
              </div>
              <div className="rounded-2xl border bg-card p-5 text-center">
                <div className="flex items-center justify-center gap-1.5 font-bold mb-4"><Heart className="w-4 h-4 text-rose-500" />주간 인기 BEST 3</div>
                <ImageIcon className="w-9 h-9 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">아직 인기 게시글이 없습니다</p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* 고객센터 푸터 */}
      <footer className="bg-[#2b2118] text-white/90 mt-8">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <h3 className="font-bold mb-4">고객센터</h3>
          <a href="tel:080-000-0000" className="inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-4 font-extrabold text-white">
            <Phone className="w-6 h-6" />
            <span className="text-left leading-tight"><span className="block text-xs font-medium">바로 전화걸기</span><span className="text-2xl">080-000-0000</span></span>
          </a>
          <p className="text-sm text-white/60 mt-3">평일 09:00 ~ 18:00 (무료 전화)</p>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between gap-4 text-sm">
            <div>
              <p className="font-bold text-white">강원 전원일기</p>
              <p className="text-white/60 mt-1">강원도 춘천시 중앙로 1길 00</p>
            </div>
            <div className="flex gap-4 text-white/70">
              <Link href="/help">이용약관</Link>
              <Link href="/help">개인정보처리방침</Link>
              <Link href="/faq">자주 묻는 질문</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
