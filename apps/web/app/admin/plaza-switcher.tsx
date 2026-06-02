'use client'

/**
 * 광장 전환기 — super 만 표시.
 * 현재 광장 표시 + 드롭다운으로 다른 광장 선택.
 * 클릭 시 buildPlazaUrl 로 해당 광장 도메인(또는 ?plaza= 쿼리) 으로 이동.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient, buildPlazaUrl } from '@/lib/plaza/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, MapPin, Loader2, Search } from 'lucide-react'

interface PlazaRow {
  id: string
  name: string
  is_active: boolean | null
}

interface Props {
  isSuper: boolean
  currentPlaza: string | null
  currentPlazaName: string | null
}

export default function PlazaSwitcher({ isSuper, currentPlaza, currentPlazaName }: Props) {
  const [plazas, setPlazas] = useState<PlazaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return plazas
    const q = search.trim().toLowerCase()
    return plazas.filter((p) => p.name.toLowerCase().includes(q))
  }, [plazas, search])

  // super 일 때만 광장 목록 fetch
  useEffect(() => {
    if (!isSuper) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('plazas')
          .select('id, name, is_active')
          .order('name', { ascending: true })
        if (!cancelled) setPlazas((data || []) as PlazaRow[])
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isSuper])

  if (!isSuper) {
    // 일반 admin — 그냥 현재 광장 라벨 노출
    return currentPlazaName ? (
      <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/20">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
        {currentPlazaName} 관리 중
      </span>
    ) : null
  }

  const go = (plazaId: string | null) => {
    const url = buildPlazaUrl((plazaId as any) || null, '/admin')
    if (typeof window !== 'undefined') window.location.href = url
  }

  const current = getCurrentPlazaClient() || currentPlaza

  const handleOpenChange = (open: boolean) => {
    if (!open) setSearch('')
    else setTimeout(() => searchRef.current?.focus(), 50)
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-xs">
            {currentPlazaName || current || '광장 선택'}
          </span>
          <span className="text-[10px] text-amber-600 font-bold">SUPER</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel className="text-xs">광장 전환</DropdownMenuLabel>
        {plazas.length > 3 && (
          <div className="px-2 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="광장 검색…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}
        <DropdownMenuSeparator />
        {loading && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && plazas.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">광장 정보 없음</div>
        )}
        {!loading && search.trim() && filtered.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">검색 결과 없음</div>
        )}
        {filtered.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => go(p.id)}
            className={p.id === current ? 'bg-primary/10 text-primary' : ''}
          >
            <span className="flex-1 truncate">{p.name}</span>
            {p.is_active === false && (
              <span className="text-[10px] text-muted-foreground ml-2">예정</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(null)}>
          <span className="text-xs text-muted-foreground">허브로 이동</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
