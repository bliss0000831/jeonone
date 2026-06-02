"use client"

/**
 * ListingActionsMenu — 카드 우측 상단 ⋮ 더보기 메뉴 (범용)
 *
 * 사용처: 중고거래 / 나눔 / 구인구직 / 모임 / 신장개업
 *
 * 소유자/관리자: 수정 / 삭제 (+ ownerExtras slot 으로 추가 항목 — 예: 올리기, 상태변경)
 * 비소유자: 이 글 숨기기 / 신고하기
 */

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  EyeOff,
  Flag,
  X,
  Heart,
  Share2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getFavoriteState, toggleFavoriteRecord, type FavoriteKind } from "@/components/favorite-button"
import { ShareSheet } from "@/components/detail/share-sheet"
import type { KakaoShareMeta } from "@/lib/integrations/kakao"

export type ListingKind = "secondhand" | "sharing" | "jobs" | "clubs" | "new-store"

interface Props {
  kind: ListingKind
  postId: string
  isOwner: boolean
  isAdmin?: boolean
  /** 소유자/관리자 메뉴 항목 위쪽에 끼워넣을 추가 액션 (예: 올리기, 상태변경) */
  ownerExtras?: ReactNode
  /** 수정 페이지 경로 (기본: `/{kind}/{postId}/edit`) */
  editHref?: string
  onDeleted?: () => void
  /** 비소유자가 "이 글 숨기기" 클릭 시 호출 */
  onHide?: () => void
  /** 찜하기 — 비소유자 메뉴에 노출. favoriteKind 가 매핑되지 않는 종류(jobs 등)면 생략 */
  favoriteKind?: FavoriteKind
  currentUserId?: string
  /** 공유하기 — meta 가 있으면 비소유자 메뉴에 노출 */
  shareMeta?: KakaoShareMeta
}

const REPORT_REASONS = [
  { value: "commercial", label: "업자 의심" },
  { value: "spam", label: "스팸/광고" },
  { value: "fraud", label: "사기 의심" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other", label: "기타" },
]

const HIDDEN_KEY: Record<ListingKind, string> = {
  secondhand: "hiddenSecondhandIds",
  sharing: "hiddenSharingIds",
  jobs: "hiddenJobsIds",
  clubs: "hiddenClubsIds",
  "new-store": "hiddenNewStoreIds",
}

export function ListingActionsMenu({
  kind,
  postId,
  isOwner,
  isAdmin = false,
  ownerExtras,
  editHref,
  onDeleted,
  onHide,
  favoriteKind,
  currentUserId,
  shareMeta,
}: Props) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<string>("commercial")
  const [reportDetail, setReportDetail] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  // 신고 모달 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (!reportOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [reportOpen])

  // 메뉴 열릴 때만 찜 상태 조회 — 매 카드마다 fetch 안 하고 클릭 시점에만
  useEffect(() => {
    if (!favoriteKind || !currentUserId) return
    let cancelled = false
    getFavoriteState(favoriteKind, postId, currentUserId)
      .then((v) => {
        if (!cancelled) setLiked(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [favoriteKind, postId, currentUserId])

  const stop = (e: React.MouseEvent | Event) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDelete = async (e: React.MouseEvent) => {
    stop(e)
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/${kind}/${postId}`, { method: "DELETE" })
      if (response.ok) onDeleted?.()
      else toast.error("삭제에 실패했습니다")
    } catch {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    stop(e)
    window.location.href = editHref ?? `/${kind}/${postId}/edit`
  }

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    stop(e)
    if (!favoriteKind) return
    if (!currentUserId) {
      window.location.href = "/auth/login"
      return
    }
    if (likeBusy) return
    const next = !liked
    setLiked(next)
    setLikeBusy(true)
    try {
      await toggleFavoriteRecord(favoriteKind, postId, currentUserId, next)
      toast.success(next ? "찜 목록에 추가했어요" : "찜을 해제했어요")
    } catch {
      setLiked(!next)
      toast.error("찜 처리에 실패했습니다")
    } finally {
      setLikeBusy(false)
    }
  }

  const handleShare = (e: React.MouseEvent) => {
    stop(e)
    setShareOpen(true)
  }

  const handleHide = (e: React.MouseEvent) => {
    stop(e)
    try {
      const KEY = HIDDEN_KEY[kind]
      const raw = localStorage.getItem(KEY)
      const arr: string[] = raw ? JSON.parse(raw) : []
      if (!arr.includes(postId)) arr.push(postId)
      localStorage.setItem(KEY, JSON.stringify(arr))
    } catch {}
    onHide?.()
    toast.success("이 글을 숨겼어요")
  }

  const handleReportSubmit = async () => {
    if (reportSubmitting) return
    setReportSubmitting(true)
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: kind,
          targetId: postId,
          reason: reportReason,
          reasonDetail: reportDetail || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("신고가 접수되었습니다. 감사합니다.")
        setReportOpen(false)
        setReportDetail("")
      } else if (res.status === 409) {
        toast.error("이미 신고하신 글입니다.")
        setReportOpen(false)
      } else if (res.status === 401) {
        toast.error("로그인이 필요합니다.")
      } else {
        toast.error(data.error || "신고에 실패했습니다.")
      }
    } catch {
      toast.error("신고 요청 중 오류가 발생했습니다.")
    } finally {
      setReportSubmitting(false)
    }
  }

  const showOwnerActions = isOwner || isAdmin

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => stop(e)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white/85 backdrop-blur-sm text-foreground hover:bg-white shadow-sm border border-border/50"
            aria-label="더보기"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {showOwnerActions ? (
            <>
              {ownerExtras}
              {ownerExtras && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                수정하기
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={deleteLoading}
                className="text-destructive focus:text-destructive"
              >
                {deleteLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                삭제하기
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {favoriteKind && (
                <DropdownMenuItem onClick={handleToggleFavorite} disabled={likeBusy}>
                  <Heart
                    className={cn(
                      "w-4 h-4 mr-2",
                      liked ? "fill-rose-500 text-rose-500" : "",
                    )}
                  />
                  {liked ? "찜 해제" : "찜하기"}
                </DropdownMenuItem>
              )}
              {shareMeta && (
                <DropdownMenuItem onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  공유하기
                </DropdownMenuItem>
              )}
              {(favoriteKind || shareMeta) && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleHide}>
                <EyeOff className="w-4 h-4 mr-2" />
                이 글 숨기기
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  stop(e)
                  setReportOpen(true)
                }}
                className="text-destructive focus:text-destructive"
              >
                <Flag className="w-4 h-4 mr-2" />
                신고하기
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shareMeta && (
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} meta={shareMeta} />
      )}

      {reportOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !reportSubmitting && setReportOpen(false)}
        >
          <div
            className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Flag className="w-5 h-5 text-destructive" />
                신고하기
              </h2>
              <button
                onClick={() => !reportSubmitting && setReportOpen(false)}
                className="p-1 hover:bg-secondary rounded-full"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              허위 신고 시 서비스 이용이 제한될 수 있습니다.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">사유</label>
              <div className="space-y-1.5">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      reportReason === r.value
                        ? "border-destructive bg-destructive/5"
                        : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`report-reason-${kind}-${postId}`}
                      value={r.value}
                      checked={reportReason === r.value}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="accent-destructive"
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                상세 내용 <span className="text-muted-foreground text-xs">(선택)</span>
              </label>
              <textarea
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
                placeholder="신고 사유를 자세히 적어주세요"
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-destructive resize-none text-sm"
              />
              <div className="text-right text-xs text-muted-foreground">{reportDetail.length}/500</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !reportSubmitting && setReportOpen(false)}
                disabled={reportSubmitting}
                className="flex-1 py-2.5 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReportSubmit}
                disabled={reportSubmitting}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {reportSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                신고하기
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
