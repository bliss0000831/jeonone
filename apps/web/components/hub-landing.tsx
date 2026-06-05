'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { MapPin, Lock, ArrowRight, Sprout, Users, Search, X, Leaf } from 'lucide-react'
import { buildPlazaUrl } from '@/lib/plaza/client'
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

const OVERLAY_BG_CLASS: Record<NonNullable<HubBackgroundConfig['overlay_color']>, string> = {
  slate: 'bg-[#1f3d2a]',
  sky: 'bg-[#1f3d2a]',
  violet: 'bg-[#1f3d2a]',
  emerald: 'bg-[#173524]',
  rose: 'bg-[#3a2f1a]',
}

// 전원일기 자연·수확 팔레트 — 권역별로 톤만 살짝 다른 어스 그린 계열 (도시 느낌 제거)
const REGION_THEME: Record<
  string,
  { label: string; gradient: string; chip: string; dot: string }
> = {
  '서울권': { label: '서울권', gradient: 'from-emerald-100/70 via-emerald-50/40 to-transparent', chip: 'bg-emerald-700 text-white', dot: 'bg-emerald-500' },
  '경기권': { label: '경기권', gradient: 'from-lime-100/70 via-lime-50/40 to-transparent',       chip: 'bg-lime-700 text-white',    dot: 'bg-lime-600' },
  '강원권': { label: '강원권', gradient: 'from-green-100/70 via-green-50/40 to-transparent',      chip: 'bg-[#225a39] text-white',   dot: 'bg-[#2f7d4f]' },
  '충청권': { label: '충청권', gradient: 'from-teal-100/70 via-teal-50/40 to-transparent',        chip: 'bg-teal-700 text-white',    dot: 'bg-teal-500' },
  '전라권': { label: '전라권', gradient: 'from-green-100/70 via-emerald-50/40 to-transparent',    chip: 'bg-green-700 text-white',   dot: 'bg-green-500' },
  '경상권': { label: '경상권', gradient: 'from-amber-100/70 via-amber-50/40 to-transparent',      chip: 'bg-amber-700 text-white',   dot: 'bg-amber-500' },
  '제주권': { label: '제주권', gradient: 'from-cyan-100/70 via-teal-50/40 to-transparent',        chip: 'bg-cyan-700 text-white',    dot: 'bg-cyan-500' },
}

const REGION_ORDER = ['서울권', '경기권', '강원권', '충청권', '전라권', '경상권', '제주권']

export function HubLanding({
  plazas,
  background,
  liveActivities = [],
}: {
  plazas: Plaza[]
  background?: HubBackgroundConfig | null
  liveActivities?: LiveActivity[]
}) {
  const hasBg = !!background?.image_url
  const overlayColor = background?.overlay_color ?? 'emerald'
  const overlayOpacity = typeof background?.overlay_opacity === 'number' ? background.overlay_opacity : 0.6
  const bgPosition = background?.position === 'top' ? 'center top' : background?.position === 'bottom' ? 'center bottom' : 'center center'
  const [query, setQuery] = useState('')
  const trimmed = query.trim()

  const filtered = useMemo(() => {
    if (!trimmed) return plazas
    const q = trimmed.toLowerCase()
    return plazas.filter((p) => {
      const inName = p.name.toLowerCase().includes(q)
      const inRegion = (p.parent_region || '').toLowerCase().includes(q)
      const inCoverage = (p.coverage || []).some((c) => c.toLowerCase().includes(q))
      return inName || inRegion || inCoverage
    })
  }, [plazas, trimmed])

  const matchedCoverage = (p: Plaza): string | null => {
    if (!trimmed) return null
    const q = trimmed.toLowerCase()
    const hit = (p.coverage || []).find((c) => c.toLowerCase().includes(q))
    return hit || null
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Plaza[]>()
    for (const p of filtered) {
      const region = p.parent_region || '기타'
      if (!map.has(region)) map.set(region, [])
      map.get(region)!.push(p)
    }
    return REGION_ORDER
      .filter((r) => map.has(r))
      .map((r) => ({ region: r, plazas: map.get(r)!.sort((a, b) => a.sort_order - b.sort_order) }))
  }, [filtered])

  const stats = useMemo(() => {
    const total = plazas.length
    const open = plazas.filter((p) => p.is_active).length
    const soon = plazas.filter((p) => !p.is_active && p.is_open_soon).length
    return { total, open, soon }
  }, [plazas])

  const openPlazas = useMemo(
    () =>
      filtered.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [filtered],
  )

  const goPlaza = (id: string) => {
    window.location.href = buildPlazaUrl(id as any, '/')
  }

  return (
    <div
      className={cn(
        'min-h-screen relative',
        !hasBg && 'bg-gradient-to-b from-[#f7f6f0] via-[#fbfaf6] to-[#eef3ea]',
        hasBg && 'text-white',
      )}
    >
      {/* ─── 배경 이미지 (관리자 설정 시) + 오버레이 ─────────────── */}
      {hasBg && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 -z-20 bg-cover"
            style={{
              backgroundImage: `url('${background!.image_url}')`,
              backgroundPosition: bgPosition,
              backgroundAttachment: 'fixed',
              backgroundSize: 'cover',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
          <div
            aria-hidden
            className={cn('fixed inset-0 -z-10', OVERLAY_BG_CLASS[overlayColor])}
            style={{ opacity: overlayOpacity }}
          />
        </>
      )}

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* 풍경 배경 — 이미지 없을 때 은은하게 */}
        {!hasBg && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
              <Image src="/images/gangwon-bg.jpg" alt="" fill className="object-cover opacity-[0.13]" priority />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#f7f6f0]/40 to-[#f7f6f0]" />
            </div>
            <div aria-hidden className="absolute inset-0 -z-10">
              <div className="absolute -top-24 -left-20 w-[460px] h-[460px] rounded-full bg-[#225a39]/10 blur-3xl" />
              <div className="absolute top-32 -right-20 w-[380px] h-[380px] rounded-full bg-amber-400/10 blur-3xl" />
            </div>
          </>
        )}

        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          {/* 로고 + 브랜드 */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-full overflow-hidden ring-4 ring-white shadow-lg">
              <Image src="/images/logo-farmer.jpg" alt="전원일기" fill className="object-cover" priority />
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border',
                hasBg
                  ? 'bg-white/25 backdrop-blur-md border-white/40 text-white'
                  : 'bg-[#225a39]/10 text-[#225a39] border-[#225a39]/20',
              )}
            >
              <Sprout className="w-4 h-4" />
              전국 농촌을 잇는 플랫폼
            </div>
          </div>

          <h1
            className={cn(
              'text-4xl sm:text-6xl font-black tracking-tight leading-tight',
              hasBg ? 'text-white' : 'text-[#225a39]',
            )}
            style={hasBg ? { textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
          >
            우리 동네 전원일기,
            <br className="sm:hidden" />
            <span className={cn(hasBg ? 'text-white' : 'text-secondary')}> 한 곳에서</span>
          </h1>
          <p
            className={cn(
              'mt-4 text-lg sm:text-xl max-w-2xl leading-relaxed font-medium',
              hasBg ? 'text-white/95' : 'text-stone-600',
            )}
            style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.5)' } : undefined}
          >
            농기구 직거래·대여·경매, 로컬푸드, 품앗이 일손, 이웃 커뮤니티까지.
            우리 지역을 골라 들어가세요.
          </p>

          {/* 검색 — 둥근 pill + 좌측 돋보기 + 우측 초록 버튼 */}
          <div className="mt-8 max-w-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) {
                  document.getElementById('all-plazas')?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className={cn(
                'flex items-stretch rounded-full shadow-lg overflow-hidden focus-within:ring-2 transition-all',
                hasBg
                  ? 'bg-white/95 backdrop-blur-md border border-white/50 focus-within:ring-white/40'
                  : 'bg-white border-2 border-[#225a39]/20 focus-within:ring-[#225a39]/30 focus-within:border-[#225a39]/40',
              )}
            >
              <div className="flex items-center pl-5 pr-2">
                <Search className="w-5 h-5 text-[#225a39]/60" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="지역으로 찾기 — 예: 강원, 강릉, 홍천"
                className="flex-1 min-w-0 py-3.5 pr-2 text-base bg-transparent focus:outline-none text-stone-900 placeholder:text-stone-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex items-center px-2 text-stone-400 hover:text-stone-700"
                  aria-label="검색어 지우기"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <button
                type="submit"
                className="flex-shrink-0 px-6 sm:px-7 my-1.5 mr-1.5 rounded-full bg-[#225a39] hover:bg-[#1b4a2f] active:bg-[#163d27] text-white text-base font-bold transition-colors whitespace-nowrap"
              >
                지역 찾기
              </button>
            </form>
            {trimmed && (
              <p
                className={cn('mt-2 text-sm font-medium', hasBg ? 'text-white/95' : 'text-stone-500')}
                style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
              >
                “{trimmed}” 검색 결과: {filtered.length}곳
              </p>
            )}
          </div>

          {/* 통계 — 검색 안 할 때만 */}
          {!trimmed && (
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4 max-w-md">
              <Stat icon={<MapPin className="w-5 h-5" />} value={stats.total} label="전체 지역" glass={hasBg} />
              <Stat icon={<Sprout className="w-5 h-5" />} value={stats.open} label="오픈" highlighted glass={hasBg} />
              <Stat icon={<Users className="w-5 h-5" />} value={stats.soon} label="오픈예정" glass={hasBg} />
            </div>
          )}
        </div>
      </section>

      {/* ─── LIVE 알림 바 ─────────────────────────────────────── */}
      {openPlazas.length > 0 && !trimmed && (
        <div className="max-w-6xl mx-auto px-4 -mt-6 sm:-mt-10 mb-0">
          <LiveActivityBar openPlazas={openPlazas} activities={liveActivities} />
        </div>
      )}

      <main className="relative max-w-6xl mx-auto px-4 pt-6 pb-10 space-y-12">
        {/* 검색 결과 없음 */}
        {trimmed && filtered.length === 0 && (
          <div
            className={cn(
              'rounded-2xl border border-dashed p-12 text-center',
              hasBg ? 'border-white/40 bg-white/15 backdrop-blur-md' : 'border-[#225a39]/25 bg-white/60',
            )}
          >
            <Leaf className={cn('w-10 h-10 mx-auto mb-3', hasBg ? 'text-white/70' : 'text-[#225a39]/40')} />
            <h3
              className={cn('text-lg font-bold mb-1', hasBg ? 'text-white' : 'text-stone-700')}
              style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
              “{trimmed}” 에 해당하는 지역이 없습니다
            </h3>
            <p
              className={cn('text-sm', hasBg ? 'text-white/90' : 'text-stone-500')}
              style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
              다른 지역명으로 다시 찾아보세요.
            </p>
          </div>
        )}

        {/* ─── 오픈된 지역 — 빠른 진입 ─────────────────────────── */}
        {openPlazas.length > 0 && (
          <section id="live-section">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2
                  className={cn('text-xl sm:text-2xl font-black', hasBg ? 'text-white' : 'text-[#225a39]')}
                  style={hasBg ? { textShadow: '0 2px 10px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
                >
                  지금 열려 있는 지역
                </h2>
                <p
                  className={cn('text-base mt-0.5 font-medium', hasBg ? 'text-white/95' : 'text-stone-500')}
                  style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.6)' } : undefined}
                >
                  눌러서 우리 동네로 들어가세요
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold',
                  hasBg
                    ? 'bg-emerald-500/25 backdrop-blur-md border border-emerald-400/40 text-emerald-100'
                    : 'bg-emerald-500/10 border border-emerald-600/30 text-emerald-700',
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                LIVE
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {openPlazas.map((p) => (
                <FeaturedCard
                  key={p.id}
                  plaza={p}
                  onClick={() => goPlaza(p.id)}
                  matchHint={matchedCoverage(p)}
                  glass={hasBg}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── 권역별 전체 ─────────────────────────────────────── */}
        <section id="all-plazas">
          <div className="mb-4">
            <h2
              className={cn('text-xl sm:text-2xl font-black', hasBg ? 'text-white' : 'text-[#225a39]')}
              style={hasBg ? { textShadow: '0 2px 10px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
            >
              전체 지역 둘러보기
            </h2>
            <p
              className={cn('text-base mt-0.5 font-medium', hasBg ? 'text-white/95' : 'text-stone-500')}
              style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.6)' } : undefined}
            >
              6개 권역 · 9개 도 · 전국 농촌 (확장 중)
            </p>
          </div>
          <div className="space-y-6">
            {grouped.map(({ region, plazas: ps }) => {
              const theme = REGION_THEME[region] || REGION_THEME['강원권']
              const openCount = ps.filter((p) => p.is_active).length
              return (
                <div
                  key={region}
                  className={cn(
                    'rounded-2xl border p-5',
                    hasBg
                      ? 'bg-white/15 backdrop-blur-xl border-white/30 shadow-lg shadow-black/10'
                      : cn('bg-gradient-to-br', theme.gradient, 'bg-white/70 border-[#225a39]/12 shadow-sm'),
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={cn('px-3 py-1 rounded-md text-sm font-bold', theme.chip)}>
                        {theme.label}
                      </span>
                      <span
                        className={cn('text-sm font-semibold', hasBg ? 'text-white/95' : 'text-stone-600')}
                      >
                        {ps.length}곳
                      </span>
                    </div>
                    {openCount > 0 ? (
                      <span
                        className={cn('text-sm flex items-center gap-1 font-semibold', hasBg ? 'text-white/90' : 'text-stone-500')}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', theme.dot)} />
                        {openCount}곳 오픈
                      </span>
                    ) : (
                      <span className={cn('text-sm font-medium', hasBg ? 'text-white/75' : 'text-stone-400')}>
                        준비 중
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {ps.map((p) => (
                      <PlazaTile
                        key={p.id}
                        plaza={p}
                        onClick={() => goPlaza(p.id)}
                        accentDot={theme.dot}
                        matchHint={matchedCoverage(p)}
                        glass={hasBg}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <footer
          className={cn('pt-8 pb-12 border-t text-center', hasBg ? 'border-white/15' : 'border-[#225a39]/15')}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sprout className={cn('w-4 h-4', hasBg ? 'text-white/90' : 'text-[#225a39]')} />
            <p
              className={cn('text-sm font-semibold', hasBg ? 'text-white/90' : 'text-[#225a39]')}
              style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
              전원일기 — 전국의 농촌을 잇는 플랫폼
            </p>
          </div>
          <p
            className={cn('text-xs', hasBg ? 'text-white/70' : 'text-stone-400')}
            style={hasBg ? { textShadow: '0 1px 3px rgba(0,0,0,0.4)' } : undefined}
          >
            © {new Date().getFullYear()} 전원일기
          </p>
        </footer>
      </main>
    </div>
  )
}

// ─── Sub Components ────────────────────────────────────────────────────────

function Stat({
  icon,
  value,
  label,
  highlighted,
  glass,
}: {
  icon: React.ReactNode
  value: number
  label: string
  highlighted?: boolean
  glass?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3 sm:p-4',
        glass
          ? highlighted
            ? 'bg-white/30 border-white/50 ring-1 ring-white/40 shadow-lg shadow-black/10 backdrop-blur-md'
            : 'bg-white/20 border-white/35 shadow-lg shadow-black/10 backdrop-blur-md'
          : highlighted
            ? 'bg-[#225a39]/8 border-[#225a39]/30 ring-1 ring-[#225a39]/20'
            : 'bg-white/80 border-[#225a39]/12 shadow-sm',
      )}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center w-8 h-8 rounded-xl mb-1.5',
          glass
            ? 'bg-white/30 text-white'
            : highlighted
              ? 'bg-[#225a39]/15 text-[#225a39]'
              : 'bg-stone-100 text-stone-500',
        )}
      >
        {icon}
      </div>
      <div
        className={cn('text-2xl sm:text-3xl font-black leading-none', glass ? 'text-white' : 'text-[#225a39]')}
        style={glass ? { textShadow: '0 1px 4px rgba(0,0,0,0.4)' } : undefined}
      >
        {value}
      </div>
      <div
        className={cn('text-sm mt-1 font-semibold', glass ? 'text-white/95' : 'text-stone-500')}
        style={glass ? { textShadow: '0 1px 3px rgba(0,0,0,0.4)' } : undefined}
      >
        {label}
      </div>
    </div>
  )
}

function FeaturedCard({
  plaza,
  onClick,
  matchHint,
  glass,
}: {
  plaza: Plaza
  onClick: () => void
  matchHint?: string | null
  glass?: boolean
}) {
  const theme = REGION_THEME[plaza.parent_region || ''] || REGION_THEME['강원권']
  const coverage = plaza.coverage ?? []
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-5 text-left transition-all',
        glass
          ? 'border-white/40 bg-white/25 backdrop-blur-xl hover:bg-white/30 hover:-translate-y-0.5 hover:border-white/60 hover:shadow-2xl shadow-lg shadow-black/30'
          : 'border-[#225a39]/15 bg-white hover:shadow-xl hover:-translate-y-0.5 hover:border-[#225a39]/40',
      )}
    >
      <div
        aria-hidden
        className={cn('absolute -right-12 -top-12 w-40 h-40 rounded-full blur-2xl opacity-30 transition-opacity group-hover:opacity-50', theme.dot)}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className={cn('px-2.5 py-1 rounded text-xs font-bold', theme.chip)}>
            {plaza.parent_region}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-bold',
              glass ? 'text-emerald-200' : 'text-emerald-700',
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            오픈됨
          </span>
        </div>
        <h3
          className={cn('text-2xl font-black mb-1', glass ? 'text-white' : 'text-stone-900')}
          style={glass ? { textShadow: '0 1px 4px rgba(0,0,0,0.4)' } : undefined}
        >
          {plaza.name}
        </h3>
        {matchHint && (
          <div
            className={cn(
              'mb-2 inline-flex items-center gap-1 text-[11px] font-bold border rounded px-1.5 py-0.5',
              glass
                ? 'text-amber-200 bg-amber-500/15 border-amber-300/30'
                : 'text-amber-700 bg-amber-50 border-amber-200',
            )}
          >
            <Search className="w-3 h-3" />
            “{matchHint}” 포함
          </div>
        )}
        {coverage.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1">
            {coverage.slice(0, 6).map((c) => (
              <span
                key={c}
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                  glass ? 'bg-white/30 text-white border border-white/20' : 'bg-[#225a39]/8 text-[#225a39]',
                )}
              >
                {c}
              </span>
            ))}
            {coverage.length > 6 && (
              <span className={cn('text-xs px-1 py-0.5 font-medium', glass ? 'text-white/80' : 'text-stone-400')}>
                +{coverage.length - 6}
              </span>
            )}
          </div>
        ) : (
          <p className={cn('text-sm mb-4 font-medium', glass ? 'text-white/70' : 'text-stone-500')}>
            농기구 · 로컬푸드 · 마을 커뮤니티
          </p>
        )}
        <div
          className={cn(
            'flex items-center gap-1.5 text-base font-bold group-hover:gap-2 transition-all',
            glass ? 'text-white' : 'text-[#225a39]',
          )}
        >
          들어가기
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  )
}

function PlazaTile({
  plaza,
  onClick,
  accentDot,
  matchHint,
  glass,
}: {
  plaza: Plaza
  onClick: () => void
  accentDot: string
  matchHint?: string | null
  glass?: boolean
}) {
  const isOpen = plaza.is_active
  const coverage = plaza.coverage ?? []
  const baseName = plaza.name.replace(/\s*전원일기$/, '')
  const coverageDisplay = coverage.filter((c) => c !== baseName).slice(0, 3)
  const more = coverage.length - coverageDisplay.length

  return (
    <button
      type="button"
      disabled={!isOpen}
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border px-3 py-3 text-left transition-all overflow-hidden',
        glass
          ? isOpen
            ? 'bg-white/25 backdrop-blur-md border-white/40 hover:bg-white/35 hover:border-white/60 hover:-translate-y-0.5 cursor-pointer shadow-md shadow-black/20'
            : 'bg-white/10 backdrop-blur-sm border-white/20 cursor-not-allowed'
          : isOpen
            ? 'bg-white border-[#225a39]/15 hover:border-[#225a39] hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
            : 'bg-stone-50/70 border-stone-200/70 cursor-not-allowed',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {isOpen ? (
              <span className={cn('w-2 h-2 rounded-full shrink-0', accentDot)} />
            ) : (
              <Lock className={cn('w-3.5 h-3.5 shrink-0', glass ? 'text-white/40' : 'text-stone-400')} />
            )}
            <p
              className={cn(
                'text-base font-bold truncate',
                glass
                  ? isOpen ? 'text-white' : 'text-white/40'
                  : isOpen ? 'text-stone-900' : 'text-stone-400',
              )}
            >
              {plaza.name}
            </p>
          </div>
          {matchHint ? (
            <p className={cn('text-[11px] leading-snug font-bold', glass ? 'text-amber-300' : 'text-amber-700')}>
              ✓ “{matchHint}” 포함
            </p>
          ) : coverage.length > 0 ? (
            <p
              className={cn(
                'text-[11px] leading-snug line-clamp-2',
                glass
                  ? isOpen ? 'text-white/90' : 'text-white/40'
                  : isOpen ? 'text-stone-500' : 'text-stone-400/70',
              )}
            >
              {coverageDisplay.length > 0 ? (
                <>
                  {coverageDisplay.join(', ')}
                  {more > 0 && (
                    <span className={glass ? 'text-white/40' : 'text-stone-400'}> · 외 {more}</span>
                  )}
                </>
              ) : (
                coverage.slice(0, 3).join(', ')
              )}
            </p>
          ) : (
            <p
              className={cn(
                'text-[11px] font-semibold',
                glass
                  ? isOpen ? 'text-emerald-300' : 'text-white/40'
                  : isOpen ? 'text-emerald-700' : 'text-stone-400',
              )}
            >
              {isOpen ? '눌러서 입장' : '오픈예정'}
            </p>
          )}
        </div>
        {isOpen && (
          <ArrowRight
            className={cn(
              'w-4 h-4 transition-all shrink-0 mt-0.5',
              glass ? 'text-white/60 group-hover:text-white group-hover:translate-x-0.5' : 'text-[#225a39]/50 group-hover:text-[#225a39] group-hover:translate-x-0.5',
            )}
          />
        )}
      </div>
    </button>
  )
}

// ─── LIVE 알림 바 (5초 rotate) ─────────────────────────────────────
function LiveActivityBar({
  openPlazas,
  activities,
}: {
  openPlazas: Plaza[]
  activities: LiveActivity[]
}) {
  const hasActivities = activities.length > 0
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (activities.length <= 1) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % activities.length)
    }, 5000)
    return () => clearInterval(id)
  }, [activities.length])

  const current = hasActivities ? activities[index % activities.length] : null

  const handleClick = () => {
    if (current) {
      window.location.href = buildPlazaUrl(current.plaza_id as any, '/board')
      return
    }
    document.getElementById('live-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-full bg-[#1f3d2a] hover:bg-[#274d35] text-white px-5 py-3.5 flex items-center gap-3 text-sm shadow-lg shadow-black/20 transition-colors group"
    >
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      <span className="font-bold flex-shrink-0">지금 마을</span>
      <span className="text-white/30 hidden sm:inline">·</span>
      <span
        key={index}
        className="text-white/90 truncate text-left flex-1 min-w-0 animate-in fade-in slide-in-from-right-2 duration-500"
      >
        {current ? (
          <>
            <span className="font-semibold">{current.plaza_name}</span>
            <span className="text-white/40 mx-1.5">·</span>
            <span className="text-white/90">
              {current.author_nickname}님 “{current.title}”
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">{openPlazas[0]?.name ?? '전원일기'}</span>
            {openPlazas.length > 1 && (
              <span className="text-white/60"> 외 {openPlazas.length - 1}곳</span>
            )}
            <span className="text-white/60">에서 이웃들이 활동 중</span>
          </>
        )}
      </span>
      <span className="ml-auto text-xs text-white/60 group-hover:text-white whitespace-nowrap flex-shrink-0 hidden sm:inline">
        모두 보기 →
      </span>
      <span className="ml-auto text-xs text-white/60 group-hover:text-white whitespace-nowrap flex-shrink-0 sm:hidden">
        →
      </span>
    </button>
  )
}
