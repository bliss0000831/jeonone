"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { useUserLocation } from "@/components/location-selector"
import type { User } from "@supabase/supabase-js"
import {
  MessageSquare, Camera, Gift, Lightbulb, Coins, HelpCircle,
  Plus, Search, Eye, Heart, TrendingUp, User as UserIcon, ImageIcon, Phone, ChevronRight,
} from "lucide-react"

const CATEGORIES = [
  { slug: "free", label: "마을 사랑방", icon: MessageSquare, desc: "자유롭게 이야기를 나눠요" },
  { slug: "daily", label: "농업 일기", icon: Camera, desc: "이웃과 일상을 나눠요" },
  { slug: "share", label: "무료 나눔", icon: Gift, desc: "필요한 물건을 나눠요" },
  { slug: "life", label: "살림 정보", icon: Lightbulb, desc: "살림 정보를 나눠요" },
  { slug: "subsidy", label: "정부 지원금", icon: Coins, desc: "이웃 건의한 정부 지원금 정보를 나눠요" },
  { slug: "qna", label: "궁금해요", icon: HelpCircle, desc: "궁금한 걸 물어보세요" },
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

/** 본문에서 사람이 읽을 발췌 텍스트만 추출 (【라벨】·URL·자동수집 안내 제거) */
function excerpt(content?: string) {
  if (!content) return ""
  return content
    .replace(/【[^】]*】/g, " ")
    .replace(/원문 보기:\s*\S+/g, "")
    .replace(/—\s*보조금24[^\n]*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export default function BoardCategoryPage() {
  const params = useParams()
  const slug = (typeof params.slug === "string" ? params.slug : params.slug?.[0]) || "free"
  const meta = CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0]
  const Icon = meta.icon

  const isSubsidy = slug === "subsidy"
  const { location } = useUserLocation()
  const mySigungu = location?.sigungu || null

  const [user, setUser] = useState<User | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [regionMode, setRegionMode] = useState<"mine" | "all">("mine")

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

  const filtered = posts.filter((p) => {
    if (!p.title?.toLowerCase().includes(search.toLowerCase())) return false
    // 정부지원금: 내 시군 글 + 전국(region NULL) 글만 (전체 보기 토글 시 해제)
    if (isSubsidy && regionMode === "mine" && mySigungu) {
      return !p.region || p.region === mySigungu
    }
    return true
  })

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

          {/* 정부지원금 — 내 지역 필터 안내 + 전체 보기 토글 */}
          {isSubsidy && (
            <div className="flex items-center justify-between gap-2 mb-5 px-1">
              {mySigungu ? (
                <>
                  <span className="text-sm md:text-base text-muted-foreground">
                    {regionMode === "mine" ? (
                      <>📍 <b className="text-foreground">{mySigungu}</b> + 전국 지원금만 모아봤어요</>
                    ) : (
                      <>🗺️ 강원 전체 지원금을 보고 있어요</>
                    )}
                  </span>
                  <button
                    onClick={() => setRegionMode((m) => (m === "mine" ? "all" : "mine"))}
                    className="flex-shrink-0 text-sm md:text-base font-bold text-primary hover:underline"
                  >
                    {regionMode === "mine" ? "전체 보기" : "내 지역만"}
                  </button>
                </>
              ) : (
                <span className="text-sm md:text-base text-muted-foreground">
                  💡 상단에서 <b className="text-foreground">동네 설정</b>을 하면 내 지역 지원금만 모아볼 수 있어요
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">
            {/* 목록 */}
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="text-center py-16 text-muted-foreground">로딩 중...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">아직 게시글이 없습니다</div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((post) => {
                    const thumb = post.thumbnail_url || post.images?.[0]
                    const ex = excerpt(post.content)
                    return (
                      <Link
                        key={post.id}
                        href={`/board/${post.id}`}
                        className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md hover:border-border transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          {isSubsidy && (
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-1 ${
                              post.region ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                            }`}>
                              {post.region ? `📍 ${post.region} 농가 대상` : "🌐 전국 어디나"}
                            </span>
                          )}
                          <h3 className="text-base sm:text-lg font-bold leading-snug line-clamp-1">{post.title}</h3>
                          {ex && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{ex}</p>}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 flex-wrap">
                            <span className="font-medium text-foreground/70">{post.author_name || "이웃"}</span>
                            <span>·</span><span>{fmtDate(post.created_at)}</span>
                            <span className="flex items-center gap-0.5 ml-1"><Eye className="w-3.5 h-3.5" />{post.view_count ?? 0}</span>
                            <span className="flex items-center gap-0.5 text-rose-500"><Heart className="w-3.5 h-3.5" />{post.like_count ?? 0}</span>
                          </div>
                        </div>
                        {thumb && (
                          <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                            <Image src={thumb} alt={post.title} fill className="object-cover" />
                          </div>
                        )}
                        <div className="flex flex-col items-center justify-center min-w-[44px] px-1">
                          <span className="text-xl font-extrabold text-foreground leading-none">{post.comment_count ?? 0}</span>
                          <span className="text-xs text-muted-foreground mt-1">댓글</span>
                        </div>
                      </Link>
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
          <Link href="/support" className="inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-4 font-extrabold text-white">
            <Phone className="w-6 h-6" />
            <span className="text-left leading-tight"><span className="block text-xs font-medium">궁금한 점이 있으신가요?</span><span className="text-2xl">고객센터 문의하기</span></span>
          </Link>
          <p className="text-sm text-white/60 mt-3">평일 09:00 ~ 18:00 · 이메일로 답변드립니다</p>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between gap-4 text-sm">
            <div>
              <p className="font-bold text-white">강원 전원일기</p>
              <p className="text-white/60 mt-1">강원도 춘천시 중앙로 1길 00</p>
            </div>
            <div className="flex gap-4 text-white/70">
              <Link href="/terms">이용약관</Link>
              <Link href="/privacy">개인정보처리방침</Link>
              <Link href="/faq">자주 묻는 질문</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
