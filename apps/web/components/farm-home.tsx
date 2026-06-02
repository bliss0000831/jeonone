"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import {
  Search, Mic, Camera, Phone, MessageSquare, Gift, Lightbulb, Coins,
  HelpCircle, Tractor, Carrot, Gavel, Users, ChevronRight, Sprout,
  CalendarDays, BookOpen, Megaphone, Sun, Headphones,
} from "lucide-react"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import { UserLocation } from "@/components/location-selector"
import { cn } from "@/lib/utils"

/** 강릉시 공지 등 — 서버에서 내려주는 공지 항목 */
export interface NoticeItem {
  id: string
  title: string
  category?: string | null
  created_at?: string | null
  is_new?: boolean
}

interface FarmHomeProps {
  user: User | null
  userRole?: string | null
  userAccountType?: string | null
  /** 광장 전체 이름 — 예: "강원 전원일기" */
  plazaName: string
  /** 지역명 — 예: "강원" */
  plazaCity: string
  notices?: NoticeItem[]
}

const LOCATION_STORAGE_KEY = "user-location"

export function FarmHome({
  user, userRole, userAccountType, plazaName, plazaCity, notices = [],
}: FarmHomeProps) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [weather, setWeather] = useState<{ temp?: number; sky?: string; humidity?: number } | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
      if (saved) setUserLocation(JSON.parse(saved))
    } catch {}
  }, [])

  // 날씨 — 실패해도 위젯은 "농사하기 좋은 날씨" 폴백 표시
  useEffect(() => {
    let alive = true
    fetch("/api/weather")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return
        setWeather({
          temp: d.temp ?? d.temperature ?? d.tmp,
          sky: d.sky ?? d.condition ?? d.weather,
          humidity: d.humidity ?? d.reh,
        })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const handleLocationChange = (loc: UserLocation) => {
    setUserLocation(loc)
    try { localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc)) } catch {}
  }

  const cityLabel = userLocation?.sido || `${plazaCity}`

  return (
    <PullToRefreshWrapper>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-emerald-50/40 dark:from-slate-950 dark:to-slate-900 pb-24 md:pb-10">
        <Header
          user={user}
          location={userLocation}
          onLocationChange={handleLocationChange}
          userRole={userRole}
          userAccountType={userAccountType}
        />

        <main className="max-w-3xl mx-auto px-4">
          {/* ── 히어로 ───────────────────────────── */}
          <section className="pt-6 pb-4 text-center">
            <div className="mx-auto w-28 h-28 rounded-full bg-emerald-100 dark:bg-emerald-900/30 grid place-items-center ring-4 ring-emerald-600/20 mb-4">
              <Sprout className="w-12 h-12 text-emerald-700 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-300">{plazaName}</h1>
            <p className="mt-1 text-sm font-semibold text-emerald-700/80 dark:text-emerald-400/80">
              {plazaCity} 농업인을 위한 따뜻한 마을 장터
            </p>
          </section>

          {/* ── 날씨 ───────────────────────────── */}
          <section className="flex flex-wrap items-center justify-center gap-2 pb-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-sm px-3 py-1.5 text-sm">
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="font-semibold">{cityLabel}</span>
              {weather?.temp != null && <span>{Math.round(weather.temp)}°</span>}
              {weather?.sky && <span className="text-muted-foreground">{weather.sky}</span>}
              {weather?.humidity != null && <span className="text-sky-600">💧 {weather.humidity}%</span>}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <Sprout className="w-4 h-4" /> 농사하기 좋은 날씨
            </div>
          </section>

          {/* ── 검색 ───────────────────────────── */}
          <section className="pb-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) window.location.href = `/search?q=${encodeURIComponent(query.trim())}`
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 px-4 py-3"
            >
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="무엇을 도와드릴까요?"
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
              />
              <Link href="/search" aria-label="음성 검색" className="shrink-0 text-emerald-600">
                <Mic className="w-5 h-5" />
              </Link>
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              농기구, 로컬푸드, 지원금 등 원하시는 정보를 검색하세요
            </p>
          </section>

          {/* ── 퀵 액션 ───────────────────────────── */}
          <section className="grid grid-cols-3 gap-3 py-3">
            <QuickAction href="/secondhand/register" icon={<Camera className="w-6 h-6" />} label={"사진으로\n올리기"} />
            <QuickAction href="/search" icon={<Mic className="w-6 h-6" />} label={"음성으로\n검색"} />
            <QuickAction href="/support" icon={<Phone className="w-6 h-6" />} label={"전화\n문의"} tint="rose" />
          </section>

          {/* ── 소통과 나눔 ───────────────────────────── */}
          <SectionTitle>소통과 나눔</SectionTitle>
          <section className="grid grid-cols-3 gap-3 pb-2">
            <TileCard href="/board" icon={<MessageSquare className="w-7 h-7" />} label="자유게시판" />
            <TileCard href="/board" icon={<Camera className="w-7 h-7" />} label="일상 공유" />
            <TileCard href="/sharing" icon={<Gift className="w-7 h-7" />} label="무료 나눔" />
          </section>

          {/* ── 정보와 혜택 ───────────────────────────── */}
          <SectionTitle>정보와 혜택</SectionTitle>
          <section className="grid grid-cols-3 gap-3 pb-4">
            <TileCard href="/notice" icon={<Lightbulb className="w-7 h-7" />} label="생활 정보" />
            <TileCard href="/notice" icon={<Coins className="w-7 h-7" />} label="정부 지원금" />
            <TileCard href="/faq" icon={<HelpCircle className="w-7 h-7" />} label="질문 답변" />
          </section>

          {/* ── 대형 기능 카드 ───────────────────────────── */}
          <section className="space-y-4 py-2">
            <FeatureCard
              href="/secondhand"
              icon={<Tractor className="w-8 h-8" />}
              title="농기구/자재"
              subtitle="사고팔기"
              desc="트랙터, 경운기, 하우스 자재 등"
              from="from-amber-900/90" to="to-stone-800/80"
            />
            <FeatureCard
              href="/local-food"
              icon={<Carrot className="w-8 h-8" />}
              title={`${plazaCity} 로컬푸드`}
              subtitle="직거래 장터"
              desc="방금 수확한 신선한 농산물"
              from="from-emerald-800/90" to="to-green-700/80"
            />
            <FeatureCard
              href="/auction"
              icon={<Gavel className="w-8 h-8" />}
              title="만물 경매장"
              subtitle="경매 / 즉시 거래"
              desc="농산물·농기구 경매 거래소"
              from="from-stone-900/90" to="to-amber-950/80"
            />
            <FeatureCard
              href="/jobs"
              icon={<Users className="w-8 h-8" />}
              title="일손 찾기"
              subtitle="품앗이 / 인력"
              desc="구인·구직, 품앗이 게시판"
              from="from-green-900/90" to="to-emerald-800/80"
            />
            <FeatureCard
              href="/board"
              icon={<MessageSquare className="w-8 h-8" />}
              title="마을 커뮤니티"
              subtitle="전원 소식통"
              desc="이웃들의 동네 소식"
              from="from-slate-800/90" to="to-emerald-900/80"
              compact
            />
          </section>

          {/* ── 공지사항 ───────────────────────────── */}
          <section className="my-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold">{cityLabel} 공지사항</h3>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {notices.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">등록된 공지가 없습니다.</li>
              )}
              {notices.slice(0, 3).map((n) => (
                <li key={n.id} className="py-3 flex items-center gap-2">
                  {n.category && (
                    <span className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-700 text-white">
                      {n.category}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm">{n.title}</span>
                  {n.is_new && <span className="shrink-0 text-[10px] font-bold text-rose-600">NEW</span>}
                </li>
              ))}
            </ul>
            <Link href="/notice" className="mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-emerald-700">
              더보기 <ChevronRight className="w-4 h-4" />
            </Link>
          </section>

          {/* ── 오늘의 농사 일지 ───────────────────────────── */}
          <section className="my-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sprout className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold">오늘의 농사 일지</h3>
            </div>
            <div className="space-y-3">
              <DiaryItem icon={<Sprout className="w-4 h-4" />} title="제철 농사 팁" desc="파종·수확 적기와 작물 관리 정보를 확인하세요." />
              <DiaryItem icon={<CalendarDays className="w-4 h-4" />} title="이달의 농사 일정" desc="모종 정식, 웃거름, 적과 작업 등 일정 안내." />
              <DiaryItem icon={<BookOpen className="w-4 h-4" />} title="이번 달 교육" desc="스마트팜·친환경 인증 교육 일정." />
            </div>
          </section>

          {/* ── 고객센터 ───────────────────────────── */}
          <section className="my-4 text-center">
            <h3 className="font-bold mb-3">고객센터</h3>
            <a
              href="tel:"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5"
            >
              <Headphones className="w-5 h-5" /> 바로 전화걸기
            </a>
          </section>
        </main>

        <BottomNav />
      </div>
    </PullToRefreshWrapper>
  )
}

/* ── 하위 컴포넌트 ─────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-center font-bold text-slate-700 dark:text-slate-200 pt-3 pb-2">{children}</h2>
}

function QuickAction({ href, icon, label, tint }: { href: string; icon: React.ReactNode; label: string; tint?: "rose" }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white dark:bg-slate-800 shadow-sm py-4 hover:shadow-md transition-shadow"
    >
      <span className={cn(
        "grid place-items-center w-11 h-11 rounded-full",
        tint === "rose" ? "bg-rose-100 text-rose-500" : "bg-emerald-100 text-emerald-600",
      )}>{icon}</span>
      <span className="text-xs font-medium text-center whitespace-pre-line leading-tight">{label}</span>
    </Link>
  )
}

function TileCard({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white py-5 shadow-sm transition-colors"
    >
      {icon}
      <span className="text-sm font-bold">{label}</span>
    </Link>
  )
}

function FeatureCard({
  href, icon, title, subtitle, desc, from, to, compact,
}: {
  href: string; icon: React.ReactNode; title: string; subtitle: string
  desc: string; from: string; to: string; compact?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative block overflow-hidden rounded-3xl shadow-md bg-gradient-to-br text-white group",
        from, to,
        compact ? "p-5" : "p-6 pb-7",
      )}
    >
      <div className="flex flex-col items-center text-center gap-1">
        <span className="grid place-items-center w-14 h-14 rounded-full bg-white/15 mb-1">{icon}</span>
        <h3 className="text-xl font-extrabold drop-shadow">{title}</h3>
        <p className="text-base font-bold">{subtitle}</p>
        {!compact && <p className="text-sm text-white/85 mt-0.5">{desc}</p>}
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white text-emerald-800 font-bold text-sm px-5 py-2 group-hover:gap-2 transition-all">
          보러가기 <ChevronRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  )
}

function DiaryItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
      <div className="flex items-center gap-1.5 font-semibold text-sm text-emerald-800 dark:text-emerald-300">
        {icon} {title}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  )
}
