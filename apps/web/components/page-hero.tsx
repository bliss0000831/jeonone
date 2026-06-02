"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"

interface PageHeroProps {
  /** 이 히어로가 속한 페이지 식별자. 있으면 DB(page_heroes)에 저장된 이미지가 우선. */
  pageKey?: string
  /** 메인 배너 이미지 경로 (/banners/xxx.jpg). pageKey DB 값이 없으면 이 값을 씀. */
  bannerImage: string
  /** 메인 이미지 로드 실패 시 폴백. 기본값: /banners/hero-banner.jpg */
  fallbackImage?: string
  /** 좌상단 아이콘 */
  icon?: ReactNode
  /** 작은 pill label */
  eyebrow?: string
  /** 메인 타이틀 */
  title: string
  /** 타이틀 중 그라데이션 강조 부분 */
  titleAccent?: string
  /** 강조 그라데이션 tailwind */
  accentGradient?: string
  /** 서브 카피 */
  subtitle?: string
  /** 우상단 action (버튼/링크 등) */
  action?: ReactNode
  /** 타이틀 아래, 툴바 위에 들어가는 알림 스트립 */
  notice?: ReactNode
  /** 실제 toolbar/filter 영역 */
  children?: ReactNode
}

// 모듈 단위 캐시 — 페이지 이동해도 한 번만 fetch
let heroMapCache: Record<string, string> | null = null
let heroMapPromise: Promise<Record<string, string>> | null = null

function loadHeroMap(): Promise<Record<string, string>> {
  if (heroMapCache) return Promise.resolve(heroMapCache)
  if (heroMapPromise) return heroMapPromise
  heroMapPromise = fetch("/api/page-heroes", { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      heroMapCache = data?.heroes || {}
      return heroMapCache!
    })
    .catch(() => ({}))
  return heroMapPromise
}

export function PageHero({
  pageKey,
  bannerImage,
  fallbackImage = "/banners/hero-banner.jpg",
  icon,
  eyebrow,
  title,
  titleAccent,
  accentGradient = "from-sky-300 to-emerald-300",
  subtitle,
  action,
  notice,
  children,
}: PageHeroProps) {
  const [dbImage, setDbImage] = useState<string | null>(null)

  useEffect(() => {
    if (!pageKey) return
    let cancelled = false
    loadHeroMap().then((map) => {
      if (!cancelled && map[pageKey]) setDbImage(map[pageKey])
    })
    return () => {
      cancelled = true
    }
  }, [pageKey])

  // 우선순위: DB 이미지 > prop bannerImage > fallbackImage
  const primary = dbImage || bannerImage
  const bgImageStyle = `url('${primary}'), url('${fallbackImage}')`

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border mb-4 shadow-sm">
      {/* 배경 이미지 */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: bgImageStyle }}
        aria-hidden
      />
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-900/55 via-slate-900/35 to-slate-900/15"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent"
        aria-hidden
      />
      {/* 데코 블러 서클 */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sky-400/20 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl"
        aria-hidden
      />

      <div className="relative p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-[11px] font-semibold text-white/90 tracking-wider mb-2.5">
                <MapPin className="w-3 h-3" />
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md tracking-tight flex items-center gap-2 flex-wrap">
              {icon && <span className="flex-shrink-0">{icon}</span>}
              <span>
                {title}
                {titleAccent && (
                  <>
                    {" "}
                    <span
                      className={`bg-gradient-to-r ${accentGradient} bg-clip-text text-transparent`}
                    >
                      {titleAccent}
                    </span>
                  </>
                )}
              </span>
            </h1>
            {subtitle && (
              <p className="text-sm sm:text-base text-white/85 mt-2 drop-shadow-sm">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>

        {notice && <div className="mb-4">{notice}</div>}

        {children && <div className="relative">{children}</div>}
      </div>
    </div>
  )
}
