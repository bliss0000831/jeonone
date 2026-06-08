"use client"

/**
 * SecondhandActionsMenu — 중고거래 전용 ⋮ 메뉴
 *
 * `ListingActionsMenu` 를 감싸고 owner extras 로 [올리기 / 상태변경] 추가.
 */

import { CheckCircle } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { ListingActionsMenu } from "@/components/listing-actions-menu"
import { toast } from "sonner"
import type { KakaoShareMeta } from "@/lib/integrations/kakao"

type Status = "active" | "reserved" | "completed" | "hidden"

interface Props {
  postId: string
  isOwner: boolean
  isAdmin?: boolean
  status: Status
  onStatusChange?: (next: Status) => void
  onDeleted?: () => void
  onHide?: () => void
  /** 비소유자 메뉴에 노출할 찜/공유 액션용 */
  currentUserId?: string
  shareMeta?: KakaoShareMeta
}

export function SecondhandActionsMenu({
  postId,
  isOwner,
  isAdmin,
  status,
  onStatusChange,
  onDeleted,
  onHide,
  currentUserId,
  shareMeta,
}: Props) {
  const stop = (e: React.MouseEvent | Event) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleStatusChange = async (e: React.MouseEvent, next: Status) => {
    stop(e)
    try {
      const response = await fetch(`/api/secondhand/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (response.ok) onStatusChange?.(next)
      else toast.error("상태 변경 실패")
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  const ownerExtras = isOwner ? (
    <>
      {status === "active" && (
        <DropdownMenuItem onClick={(e) => handleStatusChange(e, "reserved")}>
          <CheckCircle className="w-4 h-4 mr-2 text-yellow-500" />
          예약중으로 변경
        </DropdownMenuItem>
      )}
      {status !== "completed" && (
        <DropdownMenuItem onClick={(e) => handleStatusChange(e, "completed")}>
          <CheckCircle className="w-4 h-4 mr-2 text-gray-500" />
          판매완료
        </DropdownMenuItem>
      )}
      {status === "completed" && (
        <DropdownMenuItem onClick={(e) => handleStatusChange(e, "active")}>
          <CheckCircle className="w-4 h-4 mr-2 text-amber-500" />
          판매중으로 변경
        </DropdownMenuItem>
      )}
    </>
  ) : null

  return (
    <>
      <ListingActionsMenu
        kind="secondhand"
        postId={postId}
        isOwner={isOwner}
        isAdmin={isAdmin}
        ownerExtras={ownerExtras}
        onDeleted={onDeleted}
        onHide={onHide}
        favoriteKind="secondhand"
        currentUserId={currentUserId}
        shareMeta={shareMeta}
      />
    </>
  )
}
