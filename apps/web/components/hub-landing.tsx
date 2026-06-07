'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { MapPin, LocateFixed, ArrowRight, Sprout, Search, X, Lock, Users, MessageCircle } from 'lucide-react'
import { buildPlazaUrl } from '@/lib/plaza/client'
import { provinceName, provinceColors } from '@/lib/plaza/city-name'
import { cn } from '@/lib/utils'

type Plaza = {
  id: string
  name: string
  parent_region: string | null
  center_lat: number | null
  center_lng: number | null
  is_active: boolean
  is_open_soon: boolean
  sort_order: number
  coverage?: string[] | null
  // page.tsx 에서 부착하는 통계 (목업의 회원수·오늘 글수·최근글)
  member_count?: number
  posts_today?: number
  recent_post_title?: string | null
}

export interface HubBackgroundConfig {
  image_url?: string | null
  overlay_opacity?: number
  overlay_color?: 'slate' | 'sky' | 'violet' | 'emerald' | 'rose'
  position?: 'top' | 'center' | 'bottom'
}

export interface LiveActivity {
  plaza_id: string
  plaza_name: string
  author_nickname: string
  title: string
  created_at: string
}

// 두 좌표 사이 거리(km) — 가까운 지역 찾기용 (외부 API 불필요)
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function HubLanding({
  plazas,
  liveActivities = [],
}: {
  plazas: Plaza[]
  background?: HubBackgroundConfig | null
  liveActivities?: LiveActivity[]
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const [locating, setLocating] = useState(false)
  const [byLocation, setByLocation] = useState(false)

  const sorted = useMemo(
    () => [...plazas].sort((a, b) => a.sort_order - b.sort_order),
    [plazas],
  )
  const firstOpen = useMemo(() => sorted.find((p) => p.is_active) ?? sorted[0] ?? null, [sorted])
  const [detectedId, setDetectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!detectedId && firstOpen) setDetectedId(firstOpen.id)
  }, [firstOpen, detectedId])

  const filtered = useMemo(() => {
    if (!trimmed) return sorted
    const q = trimmed.toLowerCase()
    return sorted.filter((p) => {
      const inName = p.name.toLowerCase().includes(q)
      const inProvince = provinceName(p.id, p.name).toLowerCase().includes(q)
      const inRegion = (p.parent_region || '').toLowerCase().includes(q)
      const inCoverage = (p.coverage || []).some((c) => c.toLowerCase().includes(q))
      return inName || inProvince || inRegion || inCoverage
    })
  }, [sorted, trimmed])

  // 큰 카드(내 지역): 검색 중이면 첫 매칭, 아니면 감지/기본 지역
  const featured = useMemo(() => {
    if (trimmed) return filtered[0] ?? null
    return sorted.find((p) => p.id === detectedId) ?? firstOpen
  }, [trimmed, filtered, sorted, detectedId, firstOpen])

  const others = useMemo(
    () => filtered.filter((p) => p.id !== featured?.id),
    [filtered, featured],
  )
  const otherOpen = others.filter((p) => p.is_active)
  const comingSoon = others.filter((p) => !p.is_active)

  const stats = useMemo(() => {
    const open = plazas.filter((p) => p.is_active).length
    return { total: plazas.length, open }
  }, [plazas])

  const nearestPlaza = useCallback(
    (lat: number, lng: number): Plaza | null => {
      let best: Plaza | null = null
      let bestD = Infinity
      for (const p of sorted) {
        if (p.center_lat == null || p.center_lng == null) continue
        const d = distanceKm(lat, lng, p.center_lat, p.center_lng)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      return best
    },
    [sorted],
  )

  const goPlaza = (id: string) => {
    window.location.href = buildPlazaUrl(id as any, '/')
  }

  const handleLocate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('이 기기에서는 위치를 사용할 수 없어요. 아래에서 지역을 직접 골라주세요.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const n = nearestPlaza(pos.coords.latitude, pos.coords.longitude)
        if (n) {
          setQuery('')
          setDetectedId(n.id)
          setByLocation(true)
        }
        setLocating(false)
        setTimeout(() => document.getElementById('my-region')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      },
      () => {
        setLocating(false)
        alert('위치 권한이 꺼져 있어요. 아래에서 지역을 직접 골라주세요.')
      },
      { timeout: 8000, enableHighAccuracy: false },
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f6f0] via-[#fbfaf6] to-[#eef3ea]">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] overflow-hidden">
          <Image src="/images/gangwon-bg.jpg" alt="" fill className="object-cover opacity-[0.13]" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#f7f6f0]/50 to-[#f7f6f0]" />
        </div>

        <div className="max-w-3xl mx-auto px-4 pt-10 pb-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <div className="relative w-12 h-12 rounded-full overflow-hidden ring-2 ring-white shadow">
              <Image src="/images/logo-farmer.jpg" alt="전원일기" fill className="object-cover" priority />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[#225a39] font-bold text-base">
              <Sprout className="w-4 h-4" /> 전원일기
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-[#225a39] leading-tight">
            어디에 사세요?
          </h1>
          <p className="mt-3 text-lg sm:text-xl text-stone-600 font-medium">
            사는 곳을 고르면 농기구·로컬푸드·이웃 소식을 한곳에서 볼 수 있어요.
          </p>

          {/* 큰 '내 위치로 찾기' 버튼 */}
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            className="mt-7 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-5 rounded-2xl bg-[#225a39] hover:bg-[#1b4a2f] active:bg-[#163d27] disabled:opacity-70 text-white text-xl sm:text-2xl font-black shadow-xl transition-colors"
          >
            <LocateFixed className={cn('w-7 h-7', locating && 'animate-spin')} />
            {locating ? '위치 찾는 중…' : '내 위치로 찾기'}
          </button>

          {/* 검색 */}
          <div className="mt-4 max-w-xl mx-auto">
            <div className="flex items-stretch rounded-2xl bg-white border-2 border-[#225a39]/20 focus-within:border-[#225a39]/45 focus-within:ring-2 focus-within:ring-[#225a39]/20 shadow-sm overflow-hidden">
              <div className="flex items-center pl-4 pr-1">
                <Search className="w-5 h-5 text-[#225a39]/60" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setByLocation(false) }}
                placeholder="지역 이름으로 찾기 — 예: 강원도, 강릉"
                className="flex-1 min-w-0 py-3.5 px-2 text-base sm:text-lg bg-transparent focus:outline-none text-stone-900 placeholder:text-stone-400"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="flex items-center px-3 text-stone-400 hover:text-stone-700" aria-label="지우기">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-sm text-stone-500 font-medium">
            전국 {stats.total}개 지역 · 지금 {stats.open}곳 열림
          </p>
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-4 pb-12">
        {/* ─── LIVE 칩 바 (목업) ──────────────────────────────── */}
        {!trimmed && stats.open > 0 && (
          <LiveChip openCount={stats.open} activities={liveActivities} />
        )}

        {/* ─── 내 지역 큰 카드 ─────────────────────────────────── */}
        {featured ? (
          <section id="my-region" className="scroll-mt-4 mt-5">
            <p className="mb-2 text-base font-bold text-stone-500 flex items-center gap-1.5">
              <span className="w-1 h-5 rounded-full bg-[#225a39]" />
              {byLocation ? (
                <span className="inline-flex items-center gap-1 text-[#225a39]"><MapPin className="w-4 h-4" /> 가까운 지역이에요</span>
              ) : trimmed ? (
                <span className="inline-flex items-center gap-1"><Search className="w-4 h-4" /> “{trimmed}” 검색 결과</span>
              ) : (
                '우리 동네'
              )}
            </p>
            <BigRegionCard plaza={featured} onEnter={() => goPlaza(featured.id)} />
          </section>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-[#225a39]/25 bg-white/60 p-10 text-center">
            <p className="text-lg font-bold text-stone-700">“{trimmed}” 에 해당하는 지역이 없어요</p>
            <p className="mt-1 text-sm text-stone-500">다른 지역 이름으로 찾아보세요.</p>
          </div>
        )}

        {/* ─── 열린 마을 둘러보기 (가로 슬라이드) ──────────────── */}
        {otherOpen.length > 0 && (
          <section className="mt-9">
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xl sm:text-2xl font-black text-[#225a39]">열린 마을 둘러보기</h2>
              <span className="text-sm font-bold text-stone-500">전체 {stats.open}곳 →</span>
            </div>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-thin">
              {otherOpen.map((p) => (
                <VillageCard key={p.id} plaza={p} onClick={() => goPlaza(p.id)} />
              ))}
            </div>
          </section>
        )}

        {/* ─── 곧 열릴 지역 ────────────────────────────────────── */}
        {comingSoon.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold text-stone-500">곧 열릴 지역</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {comingSoon.map((p) => (
                <RegionTile key={p.id} plaza={p} onClick={() => {}} />
              ))}
            </div>
          </section>
        )}

        <footer className="pt-10 mt-10 border-t border-[#225a39]/15 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sprout className="w-4 h-4 text-[#225a39]" />
            <p className="text-sm font-semibold text-[#225a39]">전원일기 — 전국의 농촌을 잇는 플랫폼</p>
          </div>
          <p className="text-xs text-stone-400">© {new Date().getFullYear()} 전원일기</p>
        </footer>
      </main>
    </div>
  )
}

// ─── 큰 지역 카드 (목업: 사진형 + 통계행) ──────────────────────
function BigRegionCard({ plaza, onEnter }: { plaza: Plaza; onEnter: () => void }) {
  const isOpen = plaza.is_active
  const coverage = plaza.coverage ?? []
  const province = provinceName(plaza.id, plaza.name)
  const members = plaza.member_count ?? 0
  const postsToday = plaza.posts_today ?? 0
  const c = provinceColors(plaza.id)
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl bg-white">
      {/* 헤더 — 도별 자연색 그라데이션 + 큰 도명 */}
      <div
        className="relative h-[170px] sm:h-[200px] overflow-hidden"
        style={{ background: `linear-gradient(to bottom right, ${c.from}, ${c.mid}, ${c.to})` }}
      >
        {/* 은은한 빛 효과 */}
        <div aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-2xl" style={{ background: `${c.chip}33` }} />
        <div aria-hidden className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full blur-3xl" style={{ background: `${c.chip}22` }} />
        {/* 좌상단 칩 */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          {isOpen ? (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[#173524] text-sm font-bold shadow"
              style={{ backgroundColor: c.chip }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#173524] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#173524]" />
              </span>
              지금 열림
              {plaza.parent_region && <span className="text-[#173524]/75">· {plaza.parent_region}</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 text-stone-700 text-sm font-bold shadow">
              <Lock className="w-3.5 h-3.5" /> 곧 열려요
            </span>
          )}
        </div>
        {/* 좌하단 도명 */}
        <h3 className="absolute left-6 bottom-4 text-4xl sm:text-5xl font-black text-white drop-shadow-lg tracking-tight">{province}</h3>
      </div>

      {/* 통계 행 */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between text-stone-700">
        <div className="flex items-center gap-1.5 text-base font-bold">
          <Users className="w-5 h-5 text-[#225a39]" />
          <span className="text-[#225a39] tabular-nums">{members.toLocaleString()}</span>
          <span className="text-stone-500 font-semibold">명</span>
        </div>
        <span className="text-stone-300">·</span>
        <div className="flex items-center gap-1.5 text-base font-bold">
          <MessageCircle className="w-5 h-5 text-[#225a39]" />
          <span className="text-[#225a39] tabular-nums">{postsToday}</span>
          <span className="text-stone-500 font-semibold">개 글 오늘</span>
        </div>
        <span className="text-stone-300">·</span>
        <div className="flex items-center gap-1.5 text-base font-bold">
          <MapPin className="w-5 h-5 text-[#225a39]" />
          <span className="text-[#225a39] tabular-nums">{coverage.length}</span>
          <span className="text-stone-500 font-semibold">개 동네</span>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4 pt-1">
        <button
          type="button"
          onClick={onEnter}
          disabled={!isOpen}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl text-lg sm:text-xl font-black transition-colors',
            isOpen
              ? 'bg-white border-2 border-[#225a39]/15 text-[#225a39] hover:bg-[#225a39] hover:text-white hover:border-[#225a39]'
              : 'bg-stone-100 text-stone-400 cursor-not-allowed',
          )}
        >
          {isOpen ? (<>{province} 들어가기 <ArrowRight className="w-6 h-6" /></>) : '오픈예정'}
        </button>
      </div>
    </div>
  )
}

// ─── 가로 슬라이드용 작은 마을 카드 (목업) ─────────────────────
function VillageCard({ plaza, onClick }: { plaza: Plaza; onClick: () => void }) {
  const province = provinceName(plaza.id, plaza.name)
  const members = plaza.member_count ?? 0
  const postsToday = plaza.posts_today ?? 0
  const snippet = plaza.recent_post_title ?? '이웃들이 모이고 있어요'
  const c = provinceColors(plaza.id)
  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-[220px] sm:w-[240px] bg-white rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all border border-stone-200/70 overflow-hidden text-left"
    >
      <div
        className="relative h-[110px] overflow-hidden flex items-end px-4 pb-3"
        style={{ background: `linear-gradient(to bottom right, ${c.from}, ${c.mid}, ${c.to})` }}
      >
        <div aria-hidden className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl" style={{ background: `${c.chip}33` }} />
        <span
          className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[#173524] text-xs font-bold shadow"
          style={{ backgroundColor: c.chip }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#173524]" /> 열림
        </span>
        <p className="relative text-2xl font-black text-white drop-shadow tracking-tight">{province}</p>
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <p className="text-sm text-stone-500 line-clamp-1">{snippet}</p>
        <div className="flex items-center gap-2 mt-2 text-sm font-bold text-stone-700">
          <Users className="w-4 h-4 text-[#225a39]" />
          <span className="tabular-nums">{members.toLocaleString()}</span><span className="text-stone-400 font-semibold">명</span>
          <span className="text-stone-300">·</span>
          <MessageCircle className="w-4 h-4 text-[#225a39]" />
          <span className="tabular-nums">{postsToday}</span><span className="text-stone-400 font-semibold">개 글</span>
        </div>
      </div>
    </button>
  )
}

// ─── LIVE 칩 바 (목업 상단) ────────────────────────────────────
function LiveChip({ openCount, activities }: { openCount: number; activities: LiveActivity[] }) {
  const distinctPlazas = new Set(activities.map((a) => a.plaza_id)).size
  const villages = distinctPlazas > 0 ? distinctPlazas : openCount
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 text-sm sm:text-base text-stone-700 font-semibold">
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span>
        지금 <span className="font-black text-[#225a39] tabular-nums">{villages}</span>곳 마을에서 이웃들이 모이고 있어요
      </span>
    </div>
  )
}

// ─── 작은 지역 타일 ────────────────────────────────────────────
function RegionTile({ plaza, onClick }: { plaza: Plaza; onClick: () => void }) {
  const isOpen = plaza.is_active
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isOpen}
      className={cn(
        'group rounded-2xl border-2 px-4 py-4 text-left transition-all',
        isOpen
          ? 'bg-white border-[#225a39]/15 hover:border-[#225a39] hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
          : 'bg-stone-50 border-stone-200 cursor-not-allowed',
      )}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {isOpen ? (
          <span className="w-2 h-2 rounded-full bg-[#2f7d4f] shrink-0" />
        ) : (
          <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        )}
        <span className={cn('text-lg font-black truncate', isOpen ? 'text-stone-900' : 'text-stone-400')}>
          {provinceName(plaza.id, plaza.name)}
        </span>
      </div>
      <span className={cn('text-sm font-semibold', isOpen ? 'text-[#225a39]' : 'text-stone-400')}>
        {isOpen ? (
          <span className="inline-flex items-center gap-0.5">눌러서 입장 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
        ) : '곧 열려요'}
      </span>
    </button>
  )
}

