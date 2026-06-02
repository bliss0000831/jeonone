"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X, User, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FollowListKind = "followers" | "following"

interface FollowListModalProps {
  open: boolean
  kind: FollowListKind
  /** 대상 사용자 (이 사람의 팔로워/팔로잉 목록을 봄) */
  targetUserId: string
  /** 현재 로그인한 사용자 — 각 행에 팔로우 버튼 표시용 */
  currentUserId: string | null
  onClose: () => void
}

interface ProfileRow {
  id: string
  nickname: string | null
  avatar_url: string | null
  bio: string | null
  account_type: string | null
}

/**
 * 팔로워/팔로잉 리스트 모달.
 * - kind='followers'  : targetUserId 를 팔로우하는 사람들
 * - kind='following'  : targetUserId 가 팔로우하는 사람들
 * 각 행에 "팔로우/팔로잉" 토글 버튼 표시 (본인/비로그인은 숨김)
 */
export function FollowListModal({
  open,
  kind,
  targetUserId,
  currentUserId,
  onClose,
}: FollowListModalProps) {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()

    async function load() {
      setLoading(true)
      try {
        // 관계 로드: follows 테이블에서 상대편 id 수집
        let relQuery
        if (kind === "followers") {
          // target을 팔로우하는 사람들 → follower_id 를 얻음
          relQuery = supabase
            .from("follows")
            .select("follower_id")
            .eq("following_id", targetUserId)
        } else {
          // target이 팔로우하는 사람들 → following_id 를 얻음
          relQuery = supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", targetUserId)
        }
        const { data: rels } = await relQuery
        const ids = (rels || [])
          .map((r: any) =>
            kind === "followers" ? r.follower_id : r.following_id,
          )
          .filter(Boolean) as string[]

        if (ids.length === 0) {
          if (!cancelled) {
            setProfiles([])
            setFollowingSet(new Set())
          }
          return
        }

        // 프로필 조회
        const { data: pros } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url, bio, account_type")
          .in("id", ids)

        // 현재 로그인 사용자 기준: 이 중 어떤 사람을 이미 팔로우 중인가?
        let myFollowing = new Set<string>()
        if (currentUserId) {
          const { data: myRels } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", currentUserId)
            .in("following_id", ids)
          myFollowing = new Set((myRels || []).map((r: any) => r.following_id))
        }

        if (!cancelled) {
          setProfiles((pros || []) as ProfileRow[])
          setFollowingSet(myFollowing)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, kind, targetUserId, currentUserId])

  const handleToggle = async (otherId: string) => {
    if (!currentUserId) {
      window.location.href = `/auth/login?redirect=/profile/${targetUserId}`
      return
    }
    if (currentUserId === otherId) return
    const supabase = createClient()
    const isFollowing = followingSet.has(otherId)
    // 낙관적 업데이트
    setFollowingSet((s) => {
      const next = new Set(s)
      if (isFollowing) next.delete(otherId)
      else next.add(otherId)
      return next
    })
    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", otherId)
    } else {
      await (supabase as any)
        .from("follows")
        .insert({ follower_id: currentUserId, following_id: otherId })
    }
  }

  // ESC 로 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl",
          "max-h-[80vh] flex flex-col shadow-2xl",
        )}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between px-4 h-14 border-b border-border">
          <h2 className="font-semibold">
            {kind === "followers" ? "팔로워" : "팔로잉"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-1 rounded-full hover:bg-secondary"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : profiles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {kind === "followers"
                ? "아직 팔로워가 없습니다"
                : "아직 팔로잉하는 사용자가 없습니다"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {profiles.map((p) => {
                const isMe = currentUserId === p.id
                const isFollowing = followingSet.has(p.id)
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Link
                      href={`/profile/${p.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80"
                    >
                      <div className="w-11 h-11 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.avatar_url}
                            alt={p.nickname || "프로필"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {p.nickname || "사용자"}
                        </p>
                        {p.bio && (
                          <p className="text-xs text-muted-foreground truncate">
                            {p.bio}
                          </p>
                        )}
                      </div>
                    </Link>
                    {!isMe && (
                      <Button
                        size="sm"
                        variant={isFollowing ? "outline" : "default"}
                        onClick={() => handleToggle(p.id)}
                        className="flex-shrink-0"
                      >
                        {isFollowing ? "팔로잉" : "팔로우"}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
