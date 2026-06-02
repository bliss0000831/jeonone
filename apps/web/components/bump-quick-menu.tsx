"use client"

/**
 * 상세 페이지 헤더에 끼우는 가벼운 3-dot 메뉴.
 *  - 본인 글: 올리기 + (선택) 수정/삭제
 *  - 관리자: 수정/삭제 (올리기 숨김 — 남의 글 끌올 방지)
 *  - 비소유자/비관리자: 노출 안 함
 *
 * 신고하기는 별도 ReportButton 으로 헤더 우측에 배치.
 */

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { MoreVertical, ArrowUp, Pencil, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BumpDialog } from "@/components/bump-dialog"

type BumpTarget =
  | "property"
  | "secondhand"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "group_buying"
  | "local_food"
  | "jobs"
  | "new_store"

interface BumpQuickMenuProps {
  isOwner: boolean
  /** 관리자/슈퍼관리자 — owner 가 아니어도 수정/삭제 가능 (단, 올리기는 숨김) */
  isAdmin?: boolean
  targetType: BumpTarget
  targetId: string
  /** 수정 페이지 경로 — 넘기면 수정하기 메뉴 노출 */
  editHref?: string
  /** 삭제 핸들러 — 넘기면 삭제하기 메뉴 노출. confirm 은 호출자가 처리 */
  onDelete?: () => void | Promise<void>
  /** 추가 메뉴 아이템 — 올리기 위에 렌더 (예: 나눔완료) */
  children?: ReactNode
}

export function BumpQuickMenu({
  isOwner,
  isAdmin = false,
  targetType,
  targetId,
  editHref,
  onDelete,
  children,
}: BumpQuickMenuProps) {
  const router = useRouter()
  const [bumpOpen, setBumpOpen] = useState(false)

  // 메뉴 노출 권한이 있는가? (owner 또는 admin)
  if (!isOwner && !isAdmin) return null

  const showBump = isOwner // 관리자는 남의 글 끌올 불가
  const showEdit = (isOwner || isAdmin) && Boolean(editHref)
  const showDelete = (isOwner || isAdmin) && Boolean(onDelete)
  const hasAny = showBump || showEdit || showDelete || Boolean(children)
  if (!hasAny) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-2 hover:bg-secondary rounded-full transition-colors"
            aria-label="더보기"
          >
            <MoreVertical className="w-5 h-5 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {children}
          {showBump && (
            <DropdownMenuItem onSelect={() => setBumpOpen(true)}>
              <ArrowUp className="w-4 h-4 mr-2" />
              올리기
            </DropdownMenuItem>
          )}
          {(showBump && (showEdit || showDelete)) && <DropdownMenuSeparator />}
          {showEdit && editHref && (
            <DropdownMenuItem onClick={() => router.push(editHref)}>
              <Pencil className="w-4 h-4 mr-2" />
              수정하기
            </DropdownMenuItem>
          )}
          {showDelete && onDelete && (
            <DropdownMenuItem
              onClick={() => onDelete()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              삭제하기
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showBump && (
        <BumpDialog
          open={bumpOpen}
          onClose={() => setBumpOpen(false)}
          targetType={targetType}
          targetId={targetId}
        />
      )}
    </>
  )
}
