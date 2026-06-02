'use client'

/**
 * 헤더 글로벌 통합 검색 — 회원/매물/게시글.
 * GET /api/admin/search?q= 호출 후 드롭다운 결과 표시.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, User as UserIcon, Building2, FileText, X } from 'lucide-react'

interface SearchUser {
  id: string
  nickname: string | null
  full_name: string | null
  account_type: string | null
}
interface SearchProperty {
  id: string
  title: string | null
  address: string | null
}
interface SearchPost {
  id: string
  title: string | null
}
interface SearchResp {
  users?: SearchUser[]
  properties?: SearchProperty[]
  posts?: SearchPost[]
  error?: string
}

export default function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SearchResp | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // 외부 클릭 시 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 디바운스 검색
  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setData(null)
      return
    }
    setLoading(true)
    const tid = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}&limit=21`)
        const json: SearchResp = await res.json()
        setData(json)
        setOpen(true)
      } catch {
        setData({ error: '검색 실패' })
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(tid)
  }, [q])

  const close = () => {
    setOpen(false)
    setQ('')
    setData(null)
  }

  const goUser = (u: SearchUser) => {
    close()
    router.push(`/admin/members?focus=${u.id}`)
  }
  const goProperty = (p: SearchProperty) => {
    close()
    router.push(`/admin/properties?focus=${p.id}`)
  }
  const goPost = (p: SearchPost) => {
    close()
    router.push(`/admin/board/free?focus=${p.id}`)
  }

  const total =
    (data?.users?.length || 0) +
    (data?.properties?.length || 0) +
    (data?.posts?.length || 0)

  return (
    <div ref={wrapRef} className="relative hidden md:block w-72">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && setOpen(true)}
        placeholder="회원·매물·게시글 통합 검색…"
        className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {q && (
        <button
          type="button"
          onClick={close}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary"
          aria-label="검색어 지우기"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}

      {open && q.trim() && (
        <div className="absolute left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              검색 중…
            </div>
          ) : data?.error ? (
            <div className="px-3 py-4 text-sm text-red-600">{data.error}</div>
          ) : total === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">결과 없음</div>
          ) : (
            <div className="p-1 space-y-1">
              {data?.users && data.users.length > 0 && (
                <div>
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase font-semibold text-muted-foreground">
                    회원
                  </div>
                  {data.users.map((u) => (
                    <button
                      key={`u-${u.id}`}
                      onClick={() => goUser(u)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                    >
                      <UserIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="truncate">{u.nickname || u.full_name || u.id.slice(0, 8)}</span>
                      {u.account_type && (
                        <span className="ml-auto text-[10px] text-muted-foreground">{u.account_type}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {data?.properties && data.properties.length > 0 && (
                <div>
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase font-semibold text-muted-foreground">
                    매물
                  </div>
                  {data.properties.map((p) => (
                    <button
                      key={`p-${p.id}`}
                      onClick={() => goProperty(p)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                    >
                      <Building2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{p.title || '(제목 없음)'}</div>
                        {p.address && (
                          <div className="text-[11px] text-muted-foreground truncate">{p.address}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {data?.posts && data.posts.length > 0 && (
                <div>
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase font-semibold text-muted-foreground">
                    게시글
                  </div>
                  {data.posts.map((p) => (
                    <button
                      key={`b-${p.id}`}
                      onClick={() => goPost(p)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                    >
                      <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <span className="truncate">{p.title || '(제목 없음)'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
