"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { User, MapPin, BadgeCheck, Camera, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RoleConfig } from "./role-config"
import { ProfileCounters } from "./profile-counters"

export interface ProfileCardData {
  id: string
  nickname: string | null
  avatar_url: string | null
  cover_url?: string | null
  bio: string | null
  location: string | null
  role?: string | null
  postsCount: number
  followersCount: number
  followingCount: number
  trustScore?: number | null
  reviewCount?: number | null
}

interface ProfileCardProps {
  data: ProfileCardData
  role: RoleConfig
  mode: "self" | "other"
  isFollowing?: boolean
  onFollowToggle?: () => void
  onMessage?: () => void
  onShare?: () => void
  onCall?: () => void
  onInquiry?: () => void
  onCounterClick?: (kind: "posts" | "followers" | "following" | "trust") => void
  onAvatarUpload?: (file: File) => Promise<void>
}

export function ProfileCard({
  data,
  role,
  mode,
  isFollowing,
  onFollowToggle,
  onMessage,
  onShare,
  onCall,
  onInquiry,
  onCounterClick,
  onAvatarUpload,
}: ProfileCardProps) {
  const Icon = role.icon
  const badgeLabel = role.shortLabel || role.label
  const isAdmin = data.role === "admin" || data.role === "superadmin"

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const editable = mode === "self" && !!onAvatarUpload

  const handleAvatarClick = () => {
    if (!editable || avatarBusy) return
    avatarInputRef.current?.click()
  }
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !onAvatarUpload) return
    setAvatarBusy(true)
    try { await onAvatarUpload(file) } finally { setAvatarBusy(false) }
  }

  return (
    <div className="relative px-4 sm:px-6 pt-5">
      {/* Avatar + 닉네임/뱃지/위치 — 가로 배치
          배너(커버) 제거 — 어르신 가독성. 상단 호흡은 pt-5 로 확보. */}
      <div className="flex items-end gap-5 pb-1">
      <div
        className={cn(
          "relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0",
          editable && "cursor-pointer group",
        )}
        onClick={handleAvatarClick}
        role={editable ? "button" : undefined}
        aria-label={editable ? "프로필 사진 변경" : undefined}
      >
        {/* 안쪽 원형 이미지: overflow-hidden 으로 이미지만 원형 클립 */}
        <div className="w-full h-full rounded-full bg-secondary overflow-hidden ring-4 ring-background shadow-md relative">
          {data.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatar_url}
              alt={data.nickname || "프로필"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <User className="w-12 h-12 text-primary" />
            </div>
          )}
          {editable && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              {avatarBusy ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          )}
        </div>
        {editable && (
          <>
            {/* 카메라 배지: 바깥 wrapper 기준 절대 위치 → 잘리지 않음 */}
            <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md ring-2 ring-background pointer-events-none">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
          </>
        )}
      </div>

      {/* 이름 + 뱃지 + 위치 — 아바타 오른쪽 가로
          translate-y 로 살짝 아래 (커버에서 떨어뜨려 보이게).
          items-end 라 정렬은 그대로, 시각만 이동 → 카운터 위치 영향 없음. */}
      <div className="flex-1 min-w-0 pb-1 translate-y-[11px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="font-bold text-lg sm:text-xl truncate">
            {data.nickname || "사용자"}
          </h2>
          {role.type !== "user" && (
            <Badge
              className={cn(
                "text-xs whitespace-nowrap gap-1",
                role.badgeClass,
              )}
            >
              <Icon className="w-3 h-3" />
              {badgeLabel}
            </Badge>
          )}
          {isAdmin && (
            <Badge
              className={cn(
                "text-xs text-white whitespace-nowrap",
                data.role === "superadmin" ? "bg-black" : "bg-red-500",
              )}
            >
              {data.role === "superadmin" ? "슈퍼관리자" : "관리자"}
            </Badge>
          )}
        </div>
        {data.location && (
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            {data.location}
          </p>
        )}
      </div>
      </div>

      {/* Counters — 팔로워 / 팔로잉 / 이웃 별 */}
      <div className="mt-4">
        <ProfileCounters
          posts={data.postsCount}
          followers={data.followersCount}
          following={data.followingCount}
          trustScore={data.trustScore}
          reviewCount={data.reviewCount}
          onClick={onCounterClick}
        />
      </div>

      {/* CTA */}
      <div className="mt-4 flex gap-2 flex-wrap">
        {mode === "self" ? (
          <>
            <Button asChild className="flex-[2] min-w-[160px] h-12 text-base font-bold">
              <Link href="/mypage/edit">프로필 편집</Link>
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-w-[90px] h-12 text-base font-semibold"
              onClick={onShare}
            >
              공유
            </Button>
          </>
        ) : (
          <>
            <Button className="flex-1 min-w-[100px]" onClick={onMessage}>
              메시지
            </Button>
            <Button
              variant={isFollowing ? "outline" : "default"}
              className="flex-1 min-w-[100px]"
              onClick={onFollowToggle}
            >
              {isFollowing ? "팔로잉" : "팔로우"}
            </Button>
            {role.extraCta?.includes("call") && (
              <Button variant="outline" onClick={onCall}>
                전화
              </Button>
            )}
            {role.extraCta?.includes("inquiry") && (
              <Button variant="outline" onClick={onInquiry}>
                문의
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={onShare} aria-label="공유">
              <BadgeCheck className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
