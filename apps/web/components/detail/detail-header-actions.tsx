"use client"

import { ReactNode, useState } from "react"
import { Heart, Share2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ShareSheet } from "./share-sheet"
import type { KakaoShareMeta } from "@/lib/integrations/kakao"
import { toast } from "sonner"

interface HeaderActionsProps {
  isLiked?: boolean
  likeLoading?: boolean
  onLike?: () => void
  /** 공유 메타데이터 — 넘기면 카카오톡/링크복사 시트가 자동으로 열림 */
  shareMeta?: KakaoShareMeta
  /** (Deprecated) 직접 공유 핸들러. shareMeta 없을 때만 동작 */
  onShare?: () => void
  /** 추가 액션 (드롭다운 메뉴 등) */
  extra?: ReactNode
  /** 하트 표시 여부 (기본 true) */
  showLike?: boolean
  /** 공유 표시 여부 (기본 true) */
  showShare?: boolean
}

/** 상세페이지 공용 헤더 우측 액션 */
export function DetailHeaderActions({
  isLiked,
  likeLoading,
  onLike,
  shareMeta,
  onShare,
  extra,
  showLike = true,
  showShare = true,
}: HeaderActionsProps) {
  const [shareOpen, setShareOpen] = useState(false)
  const canShare = Boolean(shareMeta) || Boolean(onShare)

  const handleShare = () => {
    if (shareMeta) setShareOpen(true)
    else onShare?.()
  }

  return (
    <>
      {showLike && onLike && (
        <button
          onClick={onLike}
          disabled={likeLoading}
          className="p-2 hover:bg-secondary rounded-full transition-colors disabled:opacity-50"
          aria-label={isLiked ? "관심 해제" : "관심 추가"}
        >
          {likeLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Heart
              className={cn(
                "w-5 h-5 transition-colors",
                isLiked ? "fill-primary text-primary" : "text-foreground",
              )}
            />
          )}
        </button>
      )}
      {showShare && canShare && (
        <button
          onClick={handleShare}
          className="p-2 hover:bg-secondary rounded-full transition-colors"
          aria-label="공유"
        >
          <Share2 className="w-5 h-5 text-foreground" />
        </button>
      )}
      {extra}

      {shareMeta && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          meta={shareMeta}
        />
      )}
    </>
  )
}

/** 공유 기본 동작 — navigator.share → clipboard fallback (폴백용) */
export async function shareCurrentPage(title: string, text?: string) {
  const url = typeof window !== "undefined" ? window.location.href : ""
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url })
    } catch {
      // 사용자가 공유 취소함
    }
  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(url)
    toast.success("링크가 복사되었습니다")
  }
}
