"use client"

/**
 * 거래 목록용 정렬 + 지역(시군) 필터 바.
 *
 * 앱(apps/mobile/components/DomainListScreen.tsx)의 정렬 6종 / 지역(region_id) 필터를
 * 웹에 이식. 어르신 친화 — 큰 글씨/큰 터치 영역의 드롭다운.
 *
 * - 정렬: 최신/인기/가격↑/가격↓/조회 (sharing 등 가격 없는 도메인은 priceSort=false)
 * - 지역: /api/regions 의 시군(level-1, parent_id=null) 목록. region_id(uuid) 로 필터.
 *   (모바일 DomainListScreen 과 동일 필드 — secondhand/jobs/sharing/local_food 모두 region_id 보유)
 */

import { useEffect, useState } from "react"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { MapPin, ArrowUpDown } from "lucide-react"

export type ListSortKey = "latest" | "popular" | "price_asc" | "price_desc" | "views"

export interface RegionOption {
  id: string
  name: string
}

const ALL_SORT_OPTIONS: { value: ListSortKey; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "views", label: "조회순" },
]

/** /api/regions 의 시군 목록을 한 번 로드해서 [{id,name}] 반환. */
export function usePlazaRegions(): RegionOption[] {
  const [regions, setRegions] = useState<RegionOption[]>([])
  useEffect(() => {
    let cancelled = false
    const plaza = getCurrentPlazaClient()
    const qs = plaza ? `?plaza=${encodeURIComponent(plaza)}` : ""
    fetch(`/api/regions${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return
        // roots = level-1 시군 (parent_id=null). { id, name, children } 구조.
        setRegions(
          data
            .filter((r: any) => r && typeof r.id === "string" && typeof r.name === "string")
            .map((r: any) => ({ id: r.id, name: r.name })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return regions
}

interface Props {
  sort: ListSortKey
  onSortChange: (s: ListSortKey) => void
  region: string // "all" 또는 region_id(uuid)
  onRegionChange: (r: string) => void
  regions: RegionOption[]
  /** 가격 정렬 옵션 노출 여부 (나눔 등 무료 도메인은 false) */
  priceSort?: boolean
  /** 결과 개수 표시 (옵션) */
  count?: number
}

export function ListSortRegionBar({
  sort,
  onSortChange,
  region,
  onRegionChange,
  regions,
  priceSort = true,
  count,
}: Props) {
  const sortOptions = priceSort
    ? ALL_SORT_OPTIONS
    : ALL_SORT_OPTIONS.filter((o) => o.value !== "price_asc" && o.value !== "price_desc")

  const selectClass =
    "h-12 rounded-xl border-2 border-border bg-card px-3 text-base font-bold text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* 지역(시군) 필터 */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <select
          aria-label="지역 선택"
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          className={`${selectClass} pl-10 pr-8`}
        >
          <option value="all">전체 지역</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* 정렬 */}
      <div className="relative">
        <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <select
          aria-label="정렬 변경"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as ListSortKey)}
          className={`${selectClass} pl-10 pr-8`}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {typeof count === "number" && (
        <span className="ml-auto text-sm text-muted-foreground">{count}개</span>
      )}
    </div>
  )
}
