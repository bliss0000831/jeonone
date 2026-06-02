"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TrustScore } from "@/components/trust-score"
import { ReviewCard } from "@/components/review-card"
import type { Review } from "@/types/app"
import { Loader2, MessageCircle, ArrowUpDown } from "lucide-react"

type SortKey = "latest" | "oldest" | "highest" | "lowest"
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "highest", label: "높은 평점순" },
  { value: "lowest", label: "낮은 평점순" },
]

interface ReviewsModalProps {
  open: boolean
  onClose: () => void
  trustScore: number | null
  reviewCount: number | null
  reviews: Review[]
  loading?: boolean
}

export function ReviewsModal({
  open,
  onClose,
  trustScore,
  reviewCount,
  reviews,
  loading,
}: ReviewsModalProps) {
  const [sort, setSort] = useState<SortKey>("latest")

  const sorted = useMemo(() => {
    const arr = [...reviews]
    switch (sort) {
      case "oldest":
        return arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      case "highest":
        return arr.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
      case "lowest":
        return arr.sort((a, b) => (a.total_score ?? 0) - (b.total_score ?? 0))
      default:
        return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }, [reviews, sort])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base">이웃 별 & 후기</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {/* 신뢰지수 요약 */}
          <div className="bg-card rounded-xl border border-border p-4 mb-4">
            <TrustScore score={trustScore} reviewCount={reviewCount} />
          </div>

          {/* 정렬 드롭다운 */}
          {!loading && reviews.length > 1 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{reviews.length}개 후기</span>
              <div className="relative inline-flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="text-xs font-medium bg-transparent border-none outline-none cursor-pointer text-foreground pr-4 appearance-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 후기 목록 */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">아직 후기가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
