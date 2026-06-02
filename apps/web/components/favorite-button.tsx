"use client"

import { useEffect, useState } from "react"
import { Heart, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { toast } from "sonner"

/**
 * 통합 찜 버튼 — 모든 카드에서 동일한 UI 사용. (부동산 카드 스타일)
 *   - 36x36 (w-9 h-9) 둥근 사각형
 *   - 비활성: bg-card/90 backdrop-blur-md + 회색 하트
 *   - 활성: 채워진 rose 하트 + scale-110
 */
export type FavoriteKind =
  | "property"
  | "local-food"
  | "board"
  | "club"
  | "group-buying"
  | "interior"
  | "sharing"
  | "new-store"
  | "moving"
  | "cleaning"
  | "repair"
  | "secondhand"

interface TableMapEntry {
  table: string
  /** 대상 리소스 id 를 저장하는 컬럼 명 */
  col: string
}

/**
 * 좋아요 카운트 컬럼 맵 — 카드에서 찜할 때도 상세 페이지와 동일하게 카운트를 동기화.
 * 상세 페이지/모바일이 이미 쓰는 원자적 RPC(change_like_count)를 그대로 사용한다.
 * 제외: board(DB 트리거가 카운트 유지), property·group-buying(좋아요 카운트 표시 없음).
 * new-store: 카드/상세 모두 new_store_likes 테이블로 일원화(2026-08) — 카운트 동기화 포함.
 */
const COUNT_MAP: Partial<Record<FavoriteKind, { table: string; col: string }>> = {
  secondhand:   { table: "secondhand_posts", col: "likes" },
  sharing:      { table: "sharing_posts",    col: "likes" },
  club:         { table: "clubs",            col: "like_count" },
  "local-food": { table: "local_food",       col: "like_count" },
  interior:     { table: "interior_posts",   col: "likes" },
  moving:       { table: "moving_posts",     col: "likes" },
  cleaning:     { table: "cleaning_posts",   col: "likes" },
  repair:       { table: "repair_posts",     col: "likes" },
  "new-store":  { table: "new_store_posts",  col: "likes" },
}

const TABLE_MAP: Record<FavoriteKind, TableMapEntry> = {
  property:       { table: "favorites",             col: "property_id" },
  "local-food":   { table: "local_food_likes",      col: "local_food_id" },
  board:          { table: "board_post_likes",      col: "post_id" },
  club:           { table: "club_likes",            col: "club_id" },
  "group-buying": { table: "group_buying_wishlist", col: "post_id" },
  interior:       { table: "interior_favorites",    col: "post_id" },
  sharing:        { table: "sharing_likes",         col: "post_id" },
  "new-store":    { table: "new_store_likes",       col: "post_id" },
  moving:         { table: "moving_favorites",      col: "post_id" },
  cleaning:       { table: "cleaning_favorites",    col: "post_id" },
  repair:         { table: "repair_favorites",      col: "post_id" },
  secondhand:     { table: "secondhand_likes",      col: "post_id" },
}

/**
 * 찜 상태 조회 — 외부에서도 사용 가능 (예: ⋮ 더보기 메뉴 안 찜하기)
 * 반환: 현재 사용자가 해당 대상을 찜한 상태인지
 */
export async function getFavoriteState(kind: FavoriteKind, targetId: string, userId: string): Promise<boolean> {
  const { table, col } = TABLE_MAP[kind]
  const plaza = getCurrentPlazaClient()
  const supabase = createClient()
  let q: any = (supabase as any).from(table).select("user_id").eq("user_id", userId).eq(col, targetId).limit(1)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q.maybeSingle()
  return !!data
}

/**
 * 찜 토글 — true 면 추가, false 면 제거. 성공 시 새 상태 반환, 실패 시 throw.
 */
export async function toggleFavoriteRecord(
  kind: FavoriteKind,
  targetId: string,
  userId: string,
  next: boolean,
): Promise<boolean> {
  const { table, col } = TABLE_MAP[kind]
  const plaza = getCurrentPlazaClient()
  const supabase = createClient()
  if (next) {
    const insertRow: Record<string, any> = { user_id: userId, [col]: targetId }
    if (plaza) insertRow.plaza_id = plaza
    const { error } = await (supabase as any).from(table).insert(insertRow)
    if (error && !String(error.message || "").includes("duplicate")) throw error
  } else {
    let delQ: any = (supabase as any).from(table).delete().eq("user_id", userId).eq(col, targetId)
    if (plaza) delQ = delQ.eq("plaza_id", plaza)
    const { error } = await delQ
    if (error) throw error
  }
  return next
}

interface FavoriteButtonProps {
  kind: FavoriteKind
  targetId: string
  currentUserId?: string
  initialLiked?: boolean
  /** 부모가 좋아요 카운트를 표시 중이면 콜백으로 전달받아 업데이트 */
  onChange?: (liked: boolean) => void
  className?: string
  /** true 면 버튼 크기 한 단계 키움 (상세 페이지 용) */
  size?: "sm" | "md"
}

export function FavoriteButton({
  kind,
  targetId,
  currentUserId,
  initialLiked = false,
  onChange,
  className,
  size = "sm",
}: FavoriteButtonProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [busy, setBusy] = useState(false)

  // 마운트 시 실제 찜 상태를 DB에서 확인 (어느 페이지에 있든 정확한 상태 표시)
  useEffect(() => {
    if (!currentUserId) return
    let cancelled = false
    const { table, col } = TABLE_MAP[kind]
    const plaza = getCurrentPlazaClient()
    const supabase = createClient()
    let q: any = (supabase as any)
      .from(table)
      .select("user_id")
      .eq("user_id", currentUserId)
      .eq(col, targetId)
      .limit(1)
    // 모든 *_likes/_favorites/_wishlist 테이블이 plaza_id 컬럼 보유
    // (마이그레이션 20260521000013 이후)
    if (plaza) q = q.eq("plaza_id", plaza)
    q.maybeSingle().then(({ data, error }: any) => {
      if (cancelled || error) return
      setLiked(!!data)
    })
    return () => {
      cancelled = true
    }
  }, [kind, targetId, currentUserId])

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!currentUserId) {
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login"
      }
      return
    }
    if (busy) return

    const { table, col } = TABLE_MAP[kind]
    const next = !liked

    // 낙관적 업데이트
    setLiked(next)
    onChange?.(next)
    setBusy(true)

    try {
      const supabase = createClient()
      const plaza = getCurrentPlazaClient()
      let delta = 0
      if (next) {
        const insertRow: Record<string, any> = { user_id: currentUserId, [col]: targetId }
        if (plaza) insertRow.plaza_id = plaza
        const { error } = await (supabase as any)
          .from(table)
          .insert(insertRow)
        if (error) {
          // 중복(이미 찜함)은 정상 — 카운트 변동 없음. 그 외는 throw.
          if (!String(error.message || "").includes("duplicate")) throw error
        } else {
          delta = 1
        }
      } else {
        let delQ: any = (supabase as any)
          .from(table)
          .delete()
          .eq("user_id", currentUserId)
          .eq(col, targetId)
        if (plaza) delQ = delQ.eq("plaza_id", plaza)
        const { error } = await delQ
        if (error) throw error
        delta = -1
      }
      // 카운트 컬럼 동기화 — 카드 찜도 상세와 동일하게 반영 (원자적 RPC).
      // 실제 insert/delete 가 일어났을 때만(중복 무시).
      const cm = COUNT_MAP[kind]
      if (delta !== 0 && cm) {
        void (supabase as any)
          .rpc("change_like_count", {
            p_table: cm.table,
            p_id: targetId,
            p_column: cm.col,
            p_delta: delta,
          })
          .then(({ error }: any) => {
            if (error) console.error("[favorite count]", kind, error)
          })
      }
    } catch (err) {
      // 롤백
      console.error("[favorite]", kind, err)
      setLiked(!next)
      onChange?.(!next)
      if (typeof window !== "undefined") {
        toast("찜 처리 실패: 테이블이 없거나 권한이 없습니다. (관리자에게 문의)")
      }
    } finally {
      setBusy(false)
    }
  }

  const sizeCls = size === "md" ? "w-11 h-11" : "w-10 h-10"
  const iconCls = size === "md" ? "w-5 h-5" : "w-5 h-5"

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={liked ? "찜 해제" : "찜하기"}
      className={cn(
        "rounded-xl bg-card/90 backdrop-blur-md flex items-center justify-center",
        "hover:bg-card hover:scale-110 transition-all shadow-sm disabled:opacity-50",
        sizeCls,
        className,
      )}
    >
      {busy ? (
        <Loader2 className={cn(iconCls, "animate-spin text-muted-foreground")} />
      ) : (
        <Heart
          className={cn(
            iconCls,
            "transition-all",
            liked ? "fill-rose-500 text-rose-500 scale-110" : "text-muted-foreground",
          )}
        />
      )}
    </button>
  )
}
