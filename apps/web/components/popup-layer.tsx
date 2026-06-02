'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { X } from 'lucide-react'

interface Popup {
  id: string
  title: string
  content: string | null
  image_url: string | null
  link_url: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  start_date: string | null
  end_date: string | null
  is_active: boolean
  show_today_hide: boolean
  display_pages: string[]
}

const HIDE_KEY_PREFIX = 'popup_hidden_today_'

// ── 모듈 스코프 캐시 — 페이지 이동마다 popups DB 재조회하지 않도록 5분 TTL.
//    같은 광장 안에서 페이지 전환 시 두 번째부터 캐시 hit (-50ms × N pages).
const POPUP_CACHE_TTL_MS = 5 * 60_000
let popupCache: { plaza: string | null; data: any[]; ts: number } | null = null

function pageMatches(displayPages: string[] | null | undefined, pathname: string) {
  if (!displayPages || displayPages.length === 0) return true
  if (displayPages.includes('all')) return true
  if (displayPages.includes('home') && pathname === '/') return true
  return displayPages.some((p) => pathname.startsWith(`/${p}`))
}

export function PopupLayer() {
  const pathname = usePathname()
  const [popups, setPopups] = useState<Popup[]>([])
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    // 관리자/점검 페이지에서는 노출 X
    if (
      pathname?.startsWith('/admin') ||
      pathname?.startsWith('/auth') ||
      pathname === '/maintenance'
    ) {
      setPopups([])
      return
    }

    const supabase = createClient()
    ;(async () => {
      try {
        const now = new Date().toISOString()
        const plaza = getCurrentPlazaClient()

        // 캐시 hit — DB 재조회 없이 필터만 다시 적용
        let data: any[] | null = null
        if (popupCache && popupCache.plaza === plaza && Date.now() - popupCache.ts < POPUP_CACHE_TTL_MS) {
          data = popupCache.data
        } else {
          let q: any = supabase
            .from('popups')
            .select('*')
            .eq('is_active', true)
          if (plaza) q = q.eq('plaza_id', plaza)
          const { data: fresh } = await q
          data = (fresh ?? []) as any[]
          popupCache = { plaza, data, ts: Date.now() }
        }

        if (!data) return

        const filtered = (data as Popup[]).filter((p) => {
          if (p.start_date && p.start_date > now) return false
          if (p.end_date && p.end_date < now) return false
          if (!pageMatches(p.display_pages, pathname || '/')) return false
          // "오늘 하루 보지 않기" 체크
          try {
            const hiddenUntil = localStorage.getItem(HIDE_KEY_PREFIX + p.id)
            if (hiddenUntil && Number(hiddenUntil) > Date.now()) return false
          } catch {}
          return true
        })
        setPopups(filtered)
      } catch (err) {
        console.error('팝업 로드 실패:', err)
      }
    })()
  }, [pathname])

  const handleClose = (id: string) => {
    setClosedIds((prev) => new Set(prev).add(id))
  }

  const handleHideToday = (id: string) => {
    try {
      const tomorrow = new Date()
      tomorrow.setHours(23, 59, 59, 999)
      localStorage.setItem(HIDE_KEY_PREFIX + id, String(tomorrow.getTime()))
    } catch {}
    handleClose(id)
  }

  const visible = popups.filter((p) => !closedIds.has(p.id))
  if (visible.length === 0) return null

  return (
    <>
      {visible.map((popup) => (
        <div
          key={popup.id}
          className="fixed z-[100] shadow-2xl rounded-lg overflow-hidden border bg-card"
          style={{
            left: Math.min(popup.position_x ?? 100, Math.max(0, window.innerWidth - (popup.width || 400) - 20)),
            top: popup.position_y ?? 100,
            width: popup.width || 400,
            maxWidth: 'calc(100vw - 40px)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <span className="font-semibold text-sm truncate">{popup.title}</span>
            <button
              onClick={() => handleClose(popup.id)}
              aria-label="닫기"
              className="p-1 rounded hover:bg-accent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div
            className="overflow-auto"
            style={{ maxHeight: popup.height || 300 }}
          >
            {popup.image_url && (
              <a
                href={popup.link_url || '#'}
                target={popup.link_url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={popup.image_url}
                  alt={popup.title}
                  className="w-full h-auto object-cover"
                />
              </a>
            )}
            {popup.content && (
              <div
                className="p-4 text-sm whitespace-pre-wrap"
                // Content is stored plain; render as text to avoid XSS
              >
                {popup.content}
              </div>
            )}
            {popup.link_url && !popup.image_url && (
              <div className="px-4 pb-4">
                <a
                  href={popup.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline"
                >
                  자세히 보기 →
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          {popup.show_today_hide && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-xs">
              <button
                onClick={() => handleHideToday(popup.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                오늘 하루 보지 않기
              </button>
              <button
                onClick={() => handleClose(popup.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
