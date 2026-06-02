"use client"

/**
 * PropertyFilterModal — 매물 필터 공유 모달
 *
 * 홈 / 매물 전체보기 등 어디서든 같은 디자인/필드로 필터 선택 가능.
 * value/onChange 로 제어되며, 풋터의 [적용하기] 클릭 시 onClose() 호출.
 *
 * 섹션:
 *   - 매물유형 (그리드)
 *   - 거래유형 (4 col)
 *   - 판매자   (3 col)
 *   - 옵션     (4 col)
 *   - 동네     (LocationSelector 트리거 — showDistrict 일 때만)
 *   - 가격     (만원, 입력+퀵셋)
 *   - 면적     (m², 입력+퀵셋)
 */

import { useEffect, useState } from "react"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FilterOptions } from "@/types/app"
import { LocationSelector } from "@/components/location-selector"

interface PropertyFilterModalProps {
  open: boolean
  onClose: () => void
  value: FilterOptions
  onChange: (next: FilterOptions) => void
  /** 동네 섹션 노출 (홈 페이지) — 매물 전체보기에선 false 권장 */
  showDistrict?: boolean
}

const PROPERTY_TYPES = ["전체", "아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "상가", "사무실", "토지"] as const
const TRANSACTION_TYPES = ["전체", "매매", "전세", "월세"] as const
const SELLER_TYPES: Array<{ value: NonNullable<FilterOptions["sellerType"]>; label: string }> = [
  { value: "전체", label: "전체" },
  { value: "agent", label: "공인중개사" },
  { value: "individual", label: "일반" },
]
const OPTIONS: Array<{ value: NonNullable<FilterOptions["option"]>; label: string }> = [
  { value: "전체", label: "전체" },
  { value: "parking", label: "주차" },
  { value: "elevator", label: "엘리베이터" },
  { value: "pet", label: "반려동물" },
]

const PRICE_QUICK = [
  { label: "1000만 이하", value: 1000 },
  { label: "5000만 이하", value: 5000 },
  { label: "1억 이하", value: 10000 },
  { label: "3억 이하", value: 30000 },
  { label: "5억 이하", value: 50000 },
  { label: "10억 이하", value: 100000 },
]
const AREA_QUICK = ["33", "66", "99", "132", "165"]
const AREA_LABELS = ["33m² (10평)", "66m² (20평)", "99m² (30평)", "132m² (40평)", "165m² (50평)"]

export function PropertyFilterModal({
  open,
  onClose,
  value,
  onChange,
  showDistrict = false,
}: PropertyFilterModalProps) {
  const [showLocationSelector, setShowLocationSelector] = useState(false)
  const [priceText, setPriceText] = useState({
    min: value.minPrice != null ? String(value.minPrice) : "",
    max: value.maxPrice != null ? String(value.maxPrice) : "",
  })
  const [areaText, setAreaText] = useState({
    min: value.minArea != null ? String(value.minArea) : "",
    max: value.maxArea != null ? String(value.maxArea) : "",
  })

  // value 가 바뀌면 (예: 외부 초기화) 로컬 텍스트도 동기화
  useEffect(() => {
    setPriceText({
      min: value.minPrice != null ? String(value.minPrice) : "",
      max: value.maxPrice != null ? String(value.maxPrice) : "",
    })
    setAreaText({
      min: value.minArea != null ? String(value.minArea) : "",
      max: value.maxArea != null ? String(value.maxArea) : "",
    })
  }, [value.minPrice, value.maxPrice, value.minArea, value.maxArea])

  // ESC 닫기 + 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  const set = (patch: Partial<FilterOptions>) => onChange({ ...value, ...patch })

  const handleApply = () => {
    const toNum = (s: string) => {
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : undefined
    }
    onChange({
      ...value,
      minPrice: toNum(priceText.min),
      maxPrice: toNum(priceText.max),
      minArea: toNum(areaText.min),
      maxArea: toNum(areaText.max),
    })
    onClose()
  }

  const handleLocationSelect = (loc: { sido: string; sigungu?: string; dong?: string }) => {
    let district = "전체"
    if (loc.dong && loc.dong !== "전체") district = loc.dong
    else if (loc.sigungu && loc.sigungu !== "전체") district = loc.sigungu
    else if (loc.sido && loc.sido !== "전체") district = loc.sido
    set({ district })
    setShowLocationSelector(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-card w-full max-w-md rounded-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">필터</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* 매물유형 */}
            <div>
              <h4 className="font-medium mb-3">매물유형</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {PROPERTY_TYPES.map((t) => {
                  const active = (value.propertyType ?? "전체") === t
                  return (
                    <button
                      key={t}
                      onClick={() => set({ propertyType: t as FilterOptions["propertyType"] })}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80 text-foreground",
                      )}
                    >
                      <span className="font-medium">{t}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 거래유형 */}
            <div>
              <h4 className="font-medium mb-3">거래유형</h4>
              <div className="grid grid-cols-4 gap-2">
                {TRANSACTION_TYPES.map((t) => {
                  const active = (value.transactionType ?? "전체") === t
                  return (
                    <button
                      key={t}
                      onClick={() => set({ transactionType: t as FilterOptions["transactionType"] })}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80 text-foreground",
                      )}
                    >
                      <span className="font-medium">{t}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 판매자 */}
            <div>
              <h4 className="font-medium mb-3">판매자</h4>
              <div className="grid grid-cols-3 gap-2">
                {SELLER_TYPES.map((opt) => {
                  const active = (value.sellerType ?? "전체") === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => set({ sellerType: opt.value })}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80 text-foreground",
                      )}
                    >
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 옵션 */}
            <div>
              <h4 className="font-medium mb-3">옵션</h4>
              <div className="grid grid-cols-4 gap-2">
                {OPTIONS.map((opt) => {
                  const active = (value.option ?? "전체") === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => set({ option: opt.value })}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80 text-foreground",
                      )}
                    >
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 동네 */}
            {showDistrict && (
              <div>
                <h4 className="font-medium mb-3">동네</h4>
                <button
                  onClick={() => setShowLocationSelector(true)}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm transition-colors",
                    value.district && value.district !== "전체"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-foreground",
                  )}
                >
                  <span className="font-medium">
                    {!value.district || value.district === "전체" ? "동네 선택" : value.district}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 가격 */}
            <div>
              <h4 className="font-medium mb-3">가격 (만원)</h4>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={priceText.min}
                  onChange={(e) => setPriceText((p) => ({ ...p, min: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-muted-foreground">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={priceText.max}
                  onChange={(e) => setPriceText((p) => ({ ...p, max: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRICE_QUICK.map(({ label, value: v }) => (
                  <button
                    key={label}
                    onClick={() => setPriceText((p) => ({ ...p, max: String(v) }))}
                    className="px-2.5 py-1 text-xs rounded-full bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 면적 */}
            <div>
              <h4 className="font-medium mb-3">면적 (m²)</h4>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  value={areaText.min}
                  onChange={(e) => setAreaText((p) => ({ ...p, min: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-muted-foreground">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  value={areaText.max}
                  onChange={(e) => setAreaText((p) => ({ ...p, max: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {AREA_LABELS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setAreaText((p) => ({ ...p, max: AREA_QUICK[i] }))}
                    className="px-2.5 py-1 text-xs rounded-full bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-border bg-card">
            <button
              onClick={handleApply}
              className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              적용하기
            </button>
          </div>
        </div>
      </div>

      {showDistrict && (
        <LocationSelector
          location={null}
          onLocationChange={handleLocationSelect}
          isOpen={showLocationSelector}
          onClose={() => setShowLocationSelector(false)}
          hideButton={true}
        />
      )}
    </>
  )
}
