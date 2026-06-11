"use client"

import { useState } from "react"
import { Megaphone } from "lucide-react"
import { useUserLocation } from "@/components/location-selector"

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
  const { location } = useUserLocation()
  const mySigungu = location?.sigungu || null
  const [regionMode, setRegionMode] = useState<"mine" | "all">("mine")

  const filtered = notices.filter((n) => {
    if (regionMode === "all") return true
    if (!mySigungu) return true
    return !n.region || n.region === mySigungu
  })

  return (
    <>
      {notices.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-4 px-1">
          <span className="text-sm md:text-base text-muted-foreground">
            {regionMode === "mine" ? (
              mySigungu ? (
                <>📍 <b className="text-foreground">{mySigungu}</b> + 전체 공지를 보고 있어요</>
              ) : (
                "📍 전체 공지를 보고 있어요"
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
          {filtered.map((n) => (
            <li key={n.id} className="p-4">
              <div className="flex items-start gap-2 flex-wrap">
                {n.is_pinned && (
                  <span className="shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded">
                    고정
                  </span>
                )}
                <span
                  className={`shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    n.region ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                  }`}
                >
                  {n.region ? `📍 ${n.region}` : "🌐 전체"}
                </span>
                <div className="flex-1 min-w-0 basis-full sm:basis-0">
                  <h3 className="font-semibold text-foreground mb-1">{n.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{n.content}</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    {new Date(n.created_at).toLocaleDateString("ko-KR")}
                    {typeof n.view_count === "number" && <span className="ml-2">조회 {n.view_count}</span>}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
