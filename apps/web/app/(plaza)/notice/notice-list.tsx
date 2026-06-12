"use client"

import { useState } from "react"
import { Megaphone, ChevronDown } from "lucide-react"
import { useRegion } from "@/lib/region-context"

export interface NoticeItem {
  id: string
  title: string
  content: string
  is_pinned: boolean
  view_count: number | null
  created_at: string
  region: string | null
}

/**
 * 시군별 공지 목록 — 정부지원금과 동일 방식.
 *  - 기본: 내 시군 공지 + 전체(도 전체) 공지만 표시
 *  - "전체 보기" 토글로 다른 시군 공지까지
 */
export function NoticeListClient({ notices }: { notices: NoticeItem[] }) {
  // 웹 홈(NoticeSection)과 동일한 region 소스 — 기본값 '홍천군'
  const { selectedRegion } = useRegion()
  const mySigungu = selectedRegion || null
  const [regionMode, setRegionMode] = useState<"mine" | "all">("mine")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = notices
    .filter((n) => {
      if (regionMode === "all") return true
      if (!mySigungu) return true
      return !n.region || n.region === mySigungu
    })
    // 내 시군 전용 공지를 먼저, 전체(도 전역) 공지를 뒤로
    .sort((a, b) => {
      const am = a.region && a.region === mySigungu ? 0 : 1
      const bm = b.region && b.region === mySigungu ? 0 : 1
      return am - bm
    })

  return (
    <>
      {notices.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-4 px-1">
          <span className="text-sm md:text-base text-muted-foreground">
            {regionMode === "mine" ? (
              mySigungu ? (
                <>📍 <b className="text-foreground">{mySigungu}</b> 및 전체 지역 대상 공지를 보고 있어요</>
              ) : (
                "📍 전체 지역 대상 공지를 보고 있어요"
              )
            ) : (
              "🗺️ 전체 시군 공지를 보고 있어요"
            )}
          </span>
          {mySigungu && (
            <button
              onClick={() => setRegionMode((m) => (m === "mine" ? "all" : "mine"))}
              className="flex-shrink-0 text-sm md:text-base font-bold text-primary hover:underline"
            >
              {regionMode === "mine" ? "전체 보기" : "내 지역만"}
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Megaphone className="w-10 h-10 mb-3 text-muted-foreground/40" />
          <p className="text-sm">
            {notices.length > 0 && mySigungu ? `${mySigungu} 공지가 아직 없어요` : "등록된 공지사항이 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border bg-card rounded-2xl border border-border overflow-hidden">
          {filtered.map((n) => {
            const expanded = expandedId === n.id
            return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : n.id)}
                aria-expanded={expanded}
                className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start gap-2 flex-wrap">
                  {n.is_pinned && (
                    <span className="shrink-0 mt-1 inline-flex items-center px-1.5 py-0.5 text-xs font-bold text-amber-700 bg-amber-100 rounded">
                      고정
                    </span>
                  )}
                  <span
                    className={`shrink-0 mt-1 inline-flex items-center px-1.5 py-0.5 text-xs font-bold rounded ${
                      n.region ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {n.region ? `📍 ${n.region}` : "🌐 전체"}
                  </span>
                  <div className="flex-1 min-w-0 basis-full sm:basis-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground mb-1">{n.title}</h3>
                      <ChevronDown
                        className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </div>
                    <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${expanded ? "" : "line-clamp-2"}`}>
                      {n.content}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {new Date(n.created_at).toLocaleDateString("ko-KR")}
                      {typeof n.view_count === "number" && <span className="ml-2">조회 {n.view_count}</span>}
                      <span className="ml-2 text-primary font-medium">{expanded ? "접기" : "전체 보기"}</span>
                    </p>
                  </div>
                </div>
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
