'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapPin, Lock, ArrowRight, Sparkles, Users, Building2, Search, X } from 'lucide-react'
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
  slate: 'bg-slate-950',
  sky: 'bg-sky-900',
  violet: 'bg-violet-950',
  emerald: 'bg-emerald-950',
  rose: 'bg-rose-950',
}

const REGION_THEME: Record<
  string,
  { label: string; gradient: string; ring: string; chip: string; dot: string }
> = {
  // chip 색상 — 사진 배경 위에서 자연스럽게 보이도록 톤 다운 (500 → 600/700)
  '서울권': { label: '서울권', gradient: 'from-rose-500/15 via-rose-400/5 to-transparent',     ring: 'ring-rose-500/20',     chip: 'bg-rose-600 text-white',    dot: 'bg-rose-500' },
  '경기권': { label: '경기권', gradient: 'from-orange-500/15 via-orange-400/5 to-transparent', ring: 'ring-orange-500/20',   chip: 'bg-orange-600 text-white',  dot: 'bg-orange-500' },
  '강원권': { label: '강원권', gradient: 'from-sky-500/15 via-sky-400/5 to-transparent',       ring: 'ring-sky-500/20',      chip: 'bg-sky-700 text-white',     dot: 'bg-sky-500' },
  '충청권': { label: '충청권', gradient: 'from-emerald-500/15 via-emerald-400/5 to-transparent', ring: 'ring-emerald-500/20', chip: 'bg-emerald-700 text-white', dot: 'bg-emerald-500' },
  '전라권': { label: '전라권', gradient: 'from-violet-500/15 via-violet-400/5 to-transparent', ring: 'ring-violet-500/20',   chip: 'bg-violet-700 text-white',  dot: 'bg-violet-500' },
  '경상권': { label: '경상권', gradient: 'from-amber-500/15 via-amber-400/5 to-transparent',   ring: 'ring-amber-500/20',    chip: 'bg-amber-700 text-white',   dot: 'bg-amber-500' },
  '제주권': { label: '제주권', gradient: 'from-teal-500/15 via-teal-400/5 to-transparent',     ring: 'ring-teal-500/20',     chip: 'bg-teal-700 text-white',    dot: 'bg-teal-500' },
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
  const overlayColor = background?.overlay_color ?? 'slate'
  // 톤 일관성 위해 기본 0.65 (사진 35% 비침). 위/아래 사진 톤 차이 완화.
  const overlayOpacity = typeof background?.overlay_opacity === 'number' ? background.overlay_opacity : 0.65
  const bgPosition = background?.position === 'top' ? 'center top' : background?.position === 'bottom' ? 'center bottom' : 'center center'
  const [query, setQuery] = useState('')
  const trimmed = query.trim()

  // 검색: 광장 이름 또는 coverage 지역에 매칭. 매칭 광장 + 매칭 지역명까지 같이 알려줌.
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

  // 검색어가 coverage 의 어느 항목에 매칭됐는지 (highlight 용)
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
        !hasBg && 'bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
        hasBg && 'text-white',
      )}
    >
      {/* ─── 배경 이미지 (fixed) + 오버레이 ─────────────────────────────── */}
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
              imageRendering: 'auto',
              // GPU 가속으로 렌더 품질 향상
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

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className={cn('relative overflow-hidden', !hasBg && 'border-b border-slate-200/60 dark:border-slate-800')}>
        {/* 배경 장식 — 이미지 없을 때만 */}
        {!hasBg && (
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute top-40 -right-20 w-[400px] h-[400px] rounded-full bg-violet-500/10 blur-3xl" />
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="flex items-center gap-2 mb-4">
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                hasBg
                  ? 'bg-white/25 backdrop-blur-md border-white/40 text-white shadow-sm shadow-black/20'
                  : 'bg-primary/10 text-primary border-primary/20',
              )}
            >
              <Sparkles className="w-3 h-3" />
              전국 농업인 플랫폼
            </div>
          </div>
          <h1
            className={cn(
              'text-3xl sm:text-5xl font-bold tracking-tight',
              hasBg ? 'text-white' : 'text-slate-900 dark:text-white',
            )}
            style={hasBg ? { textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
          >
            우리 지역 전원일기,
            <br className="sm:hidden" />
            <span
              className={cn(
                hasBg
                  ? 'text-white'
                  : 'bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 bg-clip-text text-transparent',
              )}
            >
              {' '}한 곳에서
            </span>
          </h1>
          <p
            className={cn(
              'mt-4 text-base sm:text-lg max-w-2xl',
              hasBg ? 'text-white/95' : 'text-slate-600 dark:text-slate-300',
            )}
            style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.5)' } : undefined}
          >
            지역별 농기구 직거래·로컬푸드·이웃 커뮤니티를 전원일기 하나로. 우리 지역을 선택해 들어가세요.
          </p>

          {/* 검색 — 둥근 pill + 좌측 돋보기 + 우측 광장 찾기 버튼 */}
          <div className="mt-8 max-w-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                // 검색은 input 변경 즉시 반영되므로 별도 동작 없음 — submit 시 결과 영역으로 스크롤
                if (query.trim()) {
                  document.getElementById('all-plazas')?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className={cn(
                'flex items-stretch rounded-full shadow-lg overflow-hidden focus-within:ring-2 transition-all',
                hasBg
                  ? 'bg-white/95 backdrop-blur-md border border-white/50 shadow-black/30 focus-within:ring-white/40'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus-within:ring-primary/30',
              )}
            >
              {/* 좌측 돋보기 */}
              <div className="flex items-center pl-4 pr-2">
                <Search className="w-4 h-4 text-slate-400" />
              </div>

              {/* 입력 */}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="지역으로 전원일기 찾기 — 예: 강원, 강릉, 춘천"
                className={cn(
                  'flex-1 min-w-0 py-3 pr-2 text-sm bg-transparent focus:outline-none',
                  hasBg
                    ? 'text-slate-900 placeholder:text-slate-500'
                    : 'text-slate-900 dark:text-white placeholder:text-slate-400',
                )}
              />

              {/* 검색어 지우기 (있을 때만) */}
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex items-center px-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="검색어 지우기"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* 우측 광장 찾기 버튼 */}
              <button
                type="submit"
                className="flex-shrink-0 px-5 sm:px-6 my-1 mr-1 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-bold transition-colors whitespace-nowrap"
              >
                지역 찾기
              </button>
            </form>
            {trimmed && (
              <p
                className={cn(
                  'mt-2 text-xs',
                  hasBg ? 'text-white/95' : 'text-slate-500 dark:text-slate-400',
                )}
                style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
              >
                "{trimmed}" 검색 결과: {filtered.length}곳
              </p>
            )}
          </div>

          {/* 통계 — 검색 안 할 때만 */}
          {!trimmed && (
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4 max-w-md">
              <Stat icon={<MapPin className="w-4 h-4" />} value={stats.total} label="전체 지역" glass={hasBg} />
              <Stat icon={<Users className="w-4 h-4" />} value={stats.open} label="오픈" highlighted glass={hasBg} />
              <Stat icon={<Building2 className="w-4 h-4" />} value={stats.soon} label="오픈예정" glass={hasBg} />
            </div>
          )}
        </div>
      </section>

      {/* ─── LIVE 알림 바 — 오픈된 광장 활동 알림 (5초 rotate) ───── */}
      {openPlazas.length > 0 && !trimmed && (
        <div className="max-w-6xl mx-auto px-4 -mt-6 sm:-mt-10 mb-0">
          <LiveActivityBar openPlazas={openPlazas} activities={liveActivities} />
        </div>
      )}

      <main className="relative max-w-6xl mx-auto px-4 pt-4 pb-10 space-y-12">
        {/* 검색 결과 없음 */}
        {trimmed && filtered.length === 0 && (
          <div
            className={cn(
              'rounded-2xl border border-dashed p-12 text-center',
              hasBg
                ? 'border-white/40 bg-white/15 backdrop-blur-md'
                : 'border-slate-300 dark:border-slate-700',
            )}
          >
            <Search className={cn('w-10 h-10 mx-auto mb-3', hasBg ? 'text-white/70' : 'text-slate-300')} />
            <h3
              className={cn(
                'text-base font-semibold mb-1',
                hasBg ? 'text-white' : 'text-slate-700 dark:text-slate-200',
              )}
              style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
              "{trimmed}" 에 해당하는 광장이 없습니다
            </h3>
            <p
              className={cn('text-sm', hasBg ? 'text-white/90' : 'text-slate-500 dark:text-slate-400')}
              style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
            >
              다른 지역명으로 다시 검색해보세요.
            </p>
          </div>
        )}

        {/* ─── 오픈된 광장 — 빠른 진입 ─────────────────────────────────── */}
        {openPlazas.length > 0 && (
          <section id="live-section">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2
                  className={cn(
                    'text-lg sm:text-xl font-bold',
                    hasBg ? 'text-white' : 'text-slate-900 dark:text-white',
                  )}
                  style={hasBg ? { textShadow: '0 2px 10px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
                >
                  지금 이용 가능한 광장
                </h2>
                <p
                  className={cn(
                    'text-sm mt-0.5',
                    hasBg ? 'text-white/95' : 'text-slate-500 dark:text-slate-400',
                  )}
                  style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.6)' } : undefined}
                >
                  바로 클릭해서 입장하세요
                </p>
              </div>
              {/* LIVE 라벨 — chip 형태로 강조 */}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                  hasBg
                    ? 'bg-emerald-500/25 backdrop-blur-md border border-emerald-400/40 text-emerald-100 shadow-sm shadow-emerald-500/20'
                    : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
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

        {/* ─── 권역별 전체 ─────────────────────────────────────────────── */}
        <section id="all-plazas">
          <div className="mb-4">
            <h2
              className={cn(
                'text-lg sm:text-xl font-bold',
                hasBg ? 'text-white' : 'text-slate-900 dark:text-white',
              )}
              style={hasBg ? { textShadow: '0 2px 10px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' } : undefined}
            >
              전체 지역 둘러보기
            </h2>
            <p
              className={cn(
                'text-sm mt-0.5',
                hasBg ? 'text-white/95' : 'text-slate-500 dark:text-slate-400',
              )}
              style={hasBg ? { textShadow: '0 1px 6px rgba(0,0,0,0.6)' } : undefined}
            >
              6개 권역 · 9개 도 · 전국 농촌 (확장 중)
            </p>
          </div>
          <div className="space-y-6">
            {grouped.map(({ region, plazas: ps }) => {
              const theme = REGION_THEME[region] || REGION_THEME['서울권']
              const openCount = ps.filter((p) => p.is_active).length
              return (
                <div
                  key={region}
                  className={cn(
                    'rounded-2xl border p-5',
                    hasBg
                      ? 'bg-white/15 backdrop-blur-xl border-white/30 shadow-lg shadow-black/10'
                      : cn('bg-gradient-to-br', theme.gradient, 'border-slate-200/60 dark:border-slate-800'),
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2.5 py-1 rounded-md text-xs font-bold', theme.chip)}>
                        {theme.label}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium',
                          hasBg ? 'text-white/95' : 'text-slate-600 dark:text-slate-300',
                        )}
                      >
                        {ps.length}곳
                      </span>
                    </div>
                    {openCount > 0 ? (
                      <span
                        className={cn(
                          'text-xs flex items-center gap-1 font-medium',
                          hasBg ? 'text-white/90' : 'text-slate-500',
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', theme.dot)} />
                        {openCount}개 오픈
                      </span>
                    ) : (
                      <span className={cn('text-xs font-medium', hasBg ? 'text-white/75' : 'text-slate-400')}>
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
          className={cn(
            'pt-8 pb-12 border-t text-center',
            hasBg ? 'border-white/15' : 'border-slate-200 dark:border-slate-800',
          )}
        >
          <p
            className={cn(
              'text-sm',
              hasBg ? 'text-white/90' : 'text-slate-500 dark:text-slate-400',
            )}
            style={hasBg ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : undefined}
          >
            전원일기 — 전국의 농촌을 잇는 플랫폼
          </p>
          <p
            className={cn(
              'text-xs mt-1',
              hasBg ? 'text-white/70' : 'text-slate-400 dark:text-slate-500',
            )}
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
        'rounded-xl border p-3 sm:p-4 backdrop-blur-md',
        glass
          ? highlighted
            ? 'bg-white/30 border-white/50 ring-1 ring-white/40 shadow-lg shadow-black/10'
            : 'bg-white/20 border-white/35 shadow-lg shadow-black/10'
          : highlighted
            ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20'
            : 'bg-white/70 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800',
      )}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-lg mb-1.5',
          glass
            ? 'bg-white/30 text-white'
            : highlighted
              ? 'bg-primary/15 text-primary'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
        )}
      >
        {icon}
      </div>
      <div
        className={cn(
          'text-xl sm:text-2xl font-bold leading-none',
          glass ? 'text-white' : 'text-slate-900 dark:text-white',
        )}
        style={glass ? { textShadow: '0 1px 4px rgba(0,0,0,0.4)' } : undefined}
      >
        {value}
      </div>
      <div
        className={cn('text-xs mt-1 font-medium', glass ? 'text-white/95' : 'text-slate-500 dark:text-slate-400')}
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
  const theme = REGION_THEME[plaza.parent_region || ''] || REGION_THEME['서울권']
  const coverage = plaza.coverage ?? []
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-5 text-left transition-all',
        glass
          ? 'border-white/40 bg-white/25 backdrop-blur-xl hover:bg-white/30 hover:-translate-y-0.5 hover:border-white/60 hover:shadow-2xl shadow-lg shadow-black/30'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-xl hover:-translate-y-0.5 hover:border-primary/40',
      )}
    >
      {/* 배경 데코 */}
      <div
        aria-hidden
        className={cn(
          'absolute -right-12 -top-12 w-40 h-40 rounded-full blur-2xl opacity-30 transition-opacity group-hover:opacity-50',
          theme.dot,
        )}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', theme.chip)}>
            {plaza.parent_region}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium',
              glass ? 'text-emerald-300' : 'text-emerald-600 dark:text-emerald-400',
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
          className={cn('text-xl font-bold mb-1', glass ? 'text-white' : 'text-slate-900 dark:text-white')}
          style={glass ? { textShadow: '0 1px 4px rgba(0,0,0,0.4)' } : undefined}
        >
          {plaza.name}
        </h3>
        {matchHint && (
          <div
            className={cn(
              'mb-2 inline-flex items-center gap-1 text-[11px] font-medium border rounded px-1.5 py-0.5',
              glass
                ? 'text-amber-200 bg-amber-500/15 border-amber-300/30'
                : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40',
            )}
          >
            <Search className="w-3 h-3" />
            "{matchHint}" 포함
          </div>
        )}
        {coverage.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1">
            {coverage.slice(0, 6).map((c) => (
              <span
                key={c}
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                  glass
                    ? 'bg-white/30 text-white border border-white/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                )}
              >
                {c}
              </span>
            ))}
            {coverage.length > 6 && (
              <span
                className={cn(
                  'text-[10px] px-1 py-0.5 font-medium',
                  glass ? 'text-white/80' : 'text-slate-400',
                )}
              >
                +{coverage.length - 6}
              </span>
            )}
          </div>
        ) : (
          <p
            className={cn(
              'text-sm mb-4',
              glass ? 'text-white/70' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            매물 · 커뮤니티 · 동네 정보
          </p>
        )}
        <div
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium group-hover:gap-2 transition-all',
            glass ? 'text-white' : 'text-primary',
          )}
        >
          입장하기
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
  // 광장 이름이 지역명만 그대로면 (예: 강릉광장 → 강릉) coverage 의 첫 항목 중복 표시 방지
  const baseName = plaza.name.replace(/광장$/, '')
  const coverageDisplay = coverage.filter((c) => c !== baseName).slice(0, 3)
  const more = coverage.length - coverageDisplay.length

  return (
    <button
      type="button"
      disabled={!isOpen}
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border px-3 py-2.5 text-left transition-all overflow-hidden',
        glass
          ? isOpen
            ? 'bg-white/25 backdrop-blur-md border-white/40 hover:bg-white/35 hover:border-white/60 hover:-translate-y-0.5 cursor-pointer shadow-md shadow-black/20'
            : 'bg-white/10 backdrop-blur-sm border-white/20 cursor-not-allowed'
          : isOpen
            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
            : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 cursor-not-allowed',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {isOpen ? (
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', accentDot)} />
            ) : (
              <Lock className={cn('w-3 h-3 shrink-0', glass ? 'text-white/40' : 'text-slate-400')} />
            )}
            <p
              className={cn(
                'text-sm font-semibold truncate',
                glass
                  ? isOpen
                    ? 'text-white'
                    : 'text-white/40'
                  : isOpen
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {plaza.name}
            </p>
          </div>
          {matchHint ? (
            <p
              className={cn(
                'text-[10px] leading-snug font-medium',
                glass ? 'text-amber-300' : 'text-amber-700 dark:text-amber-400',
              )}
            >
              ✓ "{matchHint}" 포함
            </p>
          ) : coverage.length > 0 ? (
            <p
              className={cn(
                'text-[10px] leading-snug line-clamp-2',
                glass
                  ? isOpen
                    ? 'text-white/90'
                    : 'text-white/40'
                  : isOpen
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-slate-400/70 dark:text-slate-600',
              )}
            >
              {coverageDisplay.length > 0 ? (
                <>
                  {coverageDisplay.join(', ')}
                  {more > 0 && (
                    <span className={glass ? 'text-white/40' : 'text-slate-400'}>
                      {' '}· 외 {more}
                    </span>
                  )}
                </>
              ) : (
                coverage.slice(0, 3).join(', ')
              )}
            </p>
          ) : (
            <p
              className={cn(
                'text-[10px]',
                glass
                  ? isOpen
                    ? 'text-emerald-300 font-medium'
                    : 'text-white/40'
                  : isOpen
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-slate-400',
              )}
            >
              {isOpen ? '클릭해서 입장' : '오픈예정'}
            </p>
          )}
        </div>
        {isOpen && (
          <ArrowRight
            className={cn(
              'w-3.5 h-3.5 transition-all shrink-0 mt-0.5',
              glass
                ? 'text-white/60 group-hover:text-white group-hover:translate-x-0.5'
                : 'text-slate-400 group-hover:text-primary group-hover:translate-x-0.5',
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

  // 활동 글이 있을 때 → 그 글로 이동, 없을 때 → 첫 LIVE 광장 카드로 스크롤
  const handleClick = () => {
    if (current) {
      // 글 상세는 광장 도메인으로 가야 하므로 해당 광장 홈 board 로 이동
      window.location.href = buildPlazaUrl(current.plaza_id as any, '/board')
      return
    }
    document.getElementById('live-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-full bg-stone-900 hover:bg-stone-800 text-white px-5 py-3 flex items-center gap-3 text-sm shadow-lg shadow-black/30 transition-colors group"
    >
      {/* LIVE dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      {/* 라벨 */}
      <span className="font-semibold flex-shrink-0">지금 광장</span>
      <span className="text-white/40 hidden sm:inline">·</span>
      {/* 본문 — 활동 글 있으면 rotate, 없으면 generic */}
      <span
        key={index}
        className="text-white/85 truncate text-left flex-1 min-w-0 animate-in fade-in slide-in-from-right-2 duration-500"
      >
        {current ? (
          <>
            <span className="font-medium">{current.plaza_name}</span>
            <span className="text-white/40 mx-1.5">·</span>
            <span className="text-white/85">
              {current.author_nickname}님 "{current.title}"
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">{openPlazas[0]?.name ?? '광장'}</span>
            {openPlazas.length > 1 && (
              <span className="text-white/60"> 외 {openPlazas.length - 1}곳</span>
            )}
            <span className="text-white/60">에서 이웃들이 활동 중</span>
          </>
        )}
      </span>
      {/* 모두 보기 */}
      <span className="ml-auto text-xs text-white/60 group-hover:text-white whitespace-nowrap flex-shrink-0 hidden sm:inline">
        모두 보기 →
      </span>
      <span className="ml-auto text-xs text-white/60 group-hover:text-white whitespace-nowrap flex-shrink-0 sm:hidden">
        →
      </span>
    </button>
  )
}
