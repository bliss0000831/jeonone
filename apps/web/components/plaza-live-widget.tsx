"use client"

// 광장 실시간 위젯 — 타임라인 스타일
//
// 구성:
// 1. 상단 메타 한 줄 (LIVE pulse · 광장 · 날짜 · 날씨)
// 2. 작은 헤딩 "지금 우리 동네에서"
// 3. 세로 타임라인 — 각 점 = 활동, 점 사이 세로선이 시간 흐름 표현
// 4. 하단 통계 inline (0 항목 자동 숨김)

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  ArrowUpRight,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import type { SharingPost } from "@/components/sharing-card"
import type { LocalFoodPost } from "@/components/local-food-card"
import type { SecondhandPost } from "@/components/secondhand-card"
import type { JobsPost } from "@/components/jobs-card"
import { cn } from "@/lib/utils"

type FeedKind = "sharing" | "local_food" | "secondhand" | "jobs"

interface FeedItem {
  id: string
  kind: FeedKind
  emoji: string
  userId: string
  title: string
  created_at: string
  href: string
  thumbnail?: string | null
}

interface PlazaLiveWidgetProps {
  sharingPosts: SharingPost[]
  localFoodPosts: LocalFoodPost[]
  secondhandPosts: SecondhandPost[]
  jobsPosts: JobsPost[]
}

// 카테고리: 라벨 + 색상 (단색만 사용 — 차분하게)
const KIND_META: Record<FeedKind, { label: string; ring: string; text: string; bg: string }> = {
  sharing:      { label: "나눔",     ring: "ring-rose-500/30",    text: "text-rose-700 dark:text-rose-300",      bg: "bg-rose-500"    },
  local_food:   { label: "로컬푸드", ring: "ring-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500" },
  secondhand:   { label: "농기구/자재", ring: "ring-amber-500/30",   text: "text-amber-700 dark:text-amber-300",    bg: "bg-amber-500"   },
  jobs:         { label: "일손", ring: "ring-teal-500/30",    text: "text-teal-700 dark:text-teal-300",      bg: "bg-teal-500"    },
}

function timeAgo(dateStr: string) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return "방금"
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function actionVerb(kind: FeedKind) {
  switch (kind) {
    case "sharing":      return "나눠요"
    case "local_food":   return "팔아요"
    case "secondhand":   return "내놓았어요"
    case "jobs":         return "모집해요"
  }
}

function weatherIcon(code: number | null) {
  if (code === null || code <= 1) return Sun
  if (code === 2) return CloudSun
  if (code === 3 || (code >= 45 && code <= 48)) return Cloud
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return CloudRain
  if (code >= 71 && code <= 77) return CloudSnow
  return CloudSun
}

function weatherShort(code: number | null) {
  if (code === null) return ""
  if (code === 0) return "맑음"
  if (code <= 2) return "대체로 맑음"
  if (code === 3) return "흐림"
  if (code >= 45 && code <= 48) return "안개"
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "비"
  if (code >= 71 && code <= 77) return "눈"
  if (code >= 95) return "천둥번개"
  return ""
}

function isToday(dateStr: string) {
  const d = new Date(dateStr); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function todayLabel() {
  const d = new Date()
  const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()]
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${wk}요일`
}

export function PlazaLiveWidget({
  sharingPosts, localFoodPosts, secondhandPosts, jobsPosts,
}: PlazaLiveWidgetProps) {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = []
    const firstImage = (imgs: any): string | null =>
      Array.isArray(imgs) && typeof imgs[0] === "string" ? imgs[0] : null
    for (const p of sharingPosts)      items.push({ id: `sh-${p.id}`,  kind: "sharing",      emoji: "💝", userId: p.user_id, title: p.title, created_at: p.created_at, href: `/sharing/${p.id}`,      thumbnail: firstImage((p as any).images) })
    for (const p of localFoodPosts)    items.push({ id: `lf-${p.id}`,  kind: "local_food",   emoji: "🥬", userId: p.user_id, title: p.title, created_at: p.created_at, href: `/local-food/${p.id}`,   thumbnail: firstImage((p as any).images) })
    for (const p of secondhandPosts)   items.push({ id: `2h-${p.id}`,  kind: "secondhand",   emoji: "🛍️", userId: p.user_id, title: p.title, created_at: p.created_at, href: `/secondhand/${p.id}`,  thumbnail: firstImage((p as any).images) })
    for (const p of jobsPosts)         items.push({ id: `job-${p.id}`, kind: "jobs",         emoji: "💼", userId: p.user_id, title: p.title, created_at: p.created_at, href: `/jobs/${p.id}`,         thumbnail: firstImage((p as any).images) })
    return items
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6)
  }, [sharingPosts, localFoodPosts, secondhandPosts, jobsPosts])

  // 닉네임 (sessionStorage TTL 5분 캐시 — 홈 로드마다 DB 조회 방지)
  const [nicknames, setNicknames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = [...new Set(feed.map((f) => f.userId).filter(Boolean))]
    if (ids.length === 0) return
    const NICK_TTL = 5 * 60 * 1000
    const NICK_KEY = "plaza_widget_nicknames_v1"
    // 캐시 히트 확인 — ids 가 전부 포함되어 있으면 DB 생략
    try {
      const raw = sessionStorage.getItem(NICK_KEY)
      if (raw) {
        const c = JSON.parse(raw) as { fetchedAt: number; map: Record<string, string> }
        if (c?.fetchedAt && Date.now() - c.fetchedAt < NICK_TTL) {
          const cached: Record<string, string> = {}
          const missing: string[] = []
          for (const id of ids) {
            if (c.map[id]) cached[id] = c.map[id]
            else missing.push(id)
          }
          if (missing.length === 0) { setNicknames(cached); return }
        }
      }
    } catch {}
    const sb = createClient()
    ;(async () => {
      const { data } = await sb.from("profiles").select("id, nickname").in("id", ids)
      if (data) {
        const map: Record<string, string> = {}
        for (const p of data as { id: string; nickname: string | null }[]) if (p.nickname) map[p.id] = p.nickname
        setNicknames(map)
        try { sessionStorage.setItem(NICK_KEY, JSON.stringify({ fetchedAt: Date.now(), map })) } catch {}
      }
    })()
  }, [feed])

  // 통계
  // 단일 패스로 통계 계산 (이전: 3회 전체 스캔 + 2 중간 배열 생성)
  const stats = useMemo(() => {
    let todayPosts = 0
    const authorSet = new Set<string>()
    const allArrays = [sharingPosts, localFoodPosts, secondhandPosts, jobsPosts]
    for (let i = 0; i < allArrays.length; i++) {
      for (const p of allArrays[i]) {
        if (p.created_at && isToday(p.created_at)) {
          todayPosts++
          authorSet.add((p as any).user_id)
        }
      }
    }
    return { todayPosts, todayAuthors: authorSet.size }
  }, [sharingPosts, localFoodPosts, secondhandPosts, jobsPosts])

  const [newNeighbors, setNewNeighbors] = useState<number>(0)
  useEffect(() => {
    const cacheKey = "plaza_new_neighbors_v1"
    const TTL = 10 * 60 * 1000
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const c = JSON.parse(raw)
        if (c?.fetchedAt && Date.now() - c.fetchedAt < TTL && typeof c.count === "number") {
          setNewNeighbors(c.count); return
        }
      }
    } catch {}
    const sb = createClient()
    const start = new Date(); start.setHours(0, 0, 0, 0)
    ;(async () => {
      const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString())
      if (typeof count === "number") {
        setNewNeighbors(count)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ count, fetchedAt: Date.now() })) } catch {}
      }
    })()
  }, [])

  // 날씨
  const [weather, setWeather] = useState<{ code: number | null; temp: number | null }>({ code: null, temp: null })
  useEffect(() => {
    let cancelled = false
    const fetchW = async () => {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=37.8813&longitude=127.7298&current=temperature_2m,weather_code&timezone=Asia%2FSeoul&_=${Math.floor(Date.now()/60000)}`,
          { cache: "no-store" },
        )
        const d = await r.json()
        if (!cancelled) setWeather({ code: d?.current?.weather_code ?? null, temp: d?.current?.temperature_2m ?? null })
      } catch {}
    }
    fetchW()
    const i = setInterval(fetchW, 10 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === "visible") fetchW() }
    document.addEventListener("visibilitychange", onVis)
    return () => { cancelled = true; clearInterval(i); document.removeEventListener("visibilitychange", onVis) }
  }, [])

  const WIcon = weatherIcon(weather.code)
  const tempText = weather.temp != null ? `${Math.round(weather.temp)}°` : ""
  const wText = weatherShort(weather.code)

  // 통계 칩
  const statBits: { label: string; value: number; accent?: boolean }[] = []
  if (stats.todayPosts > 0)   statBits.push({ label: "오늘 새 글",  value: stats.todayPosts, accent: true })
  if (newNeighbors > 0)       statBits.push({ label: "새 이웃",     value: newNeighbors })
  if (stats.todayAuthors > 0) statBits.push({ label: "활동한 이웃", value: stats.todayAuthors })

  return (
    <section className="py-8 border-t border-border">
      <div className="max-w-3xl mx-auto px-4">
        {/* 메타 한 줄 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2.5 flex-wrap">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
          </span>
          <span className="font-semibold text-rose-600 dark:text-rose-400 tracking-wide">LIVE</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{cityName}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{todayLabel()}</span>
          {tempText && (
            <span className="ml-auto inline-flex items-center gap-1">
              <WIcon className="w-3.5 h-3.5" />
              <span className="tabular-nums font-medium text-foreground">{tempText}</span>
              {wText && <span className="text-muted-foreground/70">{wText}</span>}
            </span>
          )}
        </div>

        {/* 헤딩 */}
        <h2 className="text-base sm:text-lg font-bold text-foreground mb-5">
          지금 우리 동네에서
        </h2>

        {/* 타임라인 — flex 로 점/세로선/카드를 한 줄에 배치, 점은 카드 세로 중앙 정렬 */}
        {feed.length > 0 ? (
          <ol className="space-y-4">
            {feed.map((it, idx) => {
              const meta = KIND_META[it.kind]
              const nick = nicknames[it.userId] || "이웃"
              const isLast = idx === feed.length - 1
              return (
                <li key={it.id} className="flex items-stretch gap-3">
                  {/* 좌측: 점 + 세로선 */}
                  <div className="relative flex flex-col items-center w-8 flex-shrink-0">
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-base bg-card ring-4 z-10",
                        meta.ring,
                      )}
                      aria-hidden
                    >
                      {it.emoji}
                    </span>
                    {!isLast && <span aria-hidden className="flex-1 w-px bg-border mt-1" />}
                  </div>

                  {/* 우측: 내용 카드 (점이 카드 세로 중앙에 자연스럽게 정렬됨) */}
                  <Link
                    href={it.href}
                    prefetch={false}
                    className="group flex-1 min-w-0 rounded-xl border border-border bg-card hover:border-foreground/20 hover:bg-secondary/30 transition-colors px-3.5 py-3 self-center flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 text-[11px]">
                        <span className="font-semibold text-foreground tabular-nums">
                          {timeAgo(it.created_at)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className={cn("inline-flex items-center gap-1 font-semibold", meta.text)}>
                          <span className={cn("inline-block w-1 h-1 rounded-full", meta.bg)} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-[13.5px] sm:text-sm text-foreground leading-snug line-clamp-2">
                        <strong className="font-semibold">{nick}</strong>
                        <span className="text-muted-foreground">님이 </span>
                        <span className="font-medium">{it.title}</span>
                        <span className="text-muted-foreground"> {actionVerb(it.kind)}</span>
                      </p>
                    </div>
                    {/* 썸네일 — 있으면 우측에 표시. 없으면 작은 화살표만 */}
                    {it.thumbnail ? (
                      <div className="flex-shrink-0 relative w-12 h-12 rounded-lg overflow-hidden bg-muted ring-1 ring-border self-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.thumbnail}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <ArrowUpRight className="flex-shrink-0 w-4 h-4 text-muted-foreground/30 group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all self-center" />
                    )}
                  </Link>
                </li>
              )
            })}
            {/* 끝 마커 */}
            <li className="flex items-center gap-3">
              <div className="w-8 flex-shrink-0 flex justify-center">
                <span aria-hidden className="w-2 h-2 rounded-full bg-border" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                계속 업데이트되는 중이에요
              </span>
            </li>
          </ol>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            아직 오늘의 이야기가 없어요. 첫 소식을 남겨보시겠어요?
          </div>
        )}

        {/* 하단 통계 */}
        {statBits.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <span className="text-muted-foreground">오늘의 전원일기</span>
            {statBits.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground">{s.label}</span>
                <span className={cn("font-bold tabular-nums", s.accent ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                  {s.value}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-[12px] text-muted-foreground">
            오늘은 조용한 하루네요. 이웃들에게 첫 인사를 건네보세요.
          </p>
        )}
      </div>
    </section>
  )
}
