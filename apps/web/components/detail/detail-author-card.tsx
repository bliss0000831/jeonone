"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Package,
  User as UserIcon,
} from "lucide-react"
import { ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { getBusinessInfo, type BusinessInfo } from "@/lib/services/business-info"
import { NeighborStar } from "@/components/trust-score"

interface DetailAuthorCardProps {
  /** 프로필 링크 */
  href: string
  name: string
  avatarUrl?: string | null
  /** 이름 아래 보조 정보 (위치/거리 등) */
  subtitle?: ReactNode
  /** 이름 옆 배지 (공인중개사/생산자/업체 등) */
  badges?: ReactNode
  className?: string

  /**
   * 유저 ID — 주면 profiles 에서 자동으로 통계(응답률/거래수/인증 여부/가입일)를
   * 가져와서 스탯 행을 렌더링.
   */
  userId?: string | null
  /**
   * "이 판매자의 다른 게시글" 섹션을 렌더링할 때 쓰는 테이블명.
   * (예: "sharing_posts", "properties", "clubs", "group_buying_posts" 등)
   * 지정하지 않으면 섹션이 뜨지 않음.
   */
  otherPostsTable?: string
  /** 다른 게시글 카드 클릭 시 이동할 경로 prefix. 예: "/sharing" → `/sharing/{id}` */
  otherPostsLinkPrefix?: string
  /** 다른 게시글 섹션 제목 (기본: "이 판매자의 다른 게시글") */
  otherPostsTitle?: string
  /** 현재 보고 있는 게시글 ID (목록에서 제외) */
  excludeId?: string
  /** 다른 게시글 select 절 커스텀 (기본: "id, title, images, created_at") */
  otherPostsSelect?: string
  /** 이미지 컬럼 키 — 기본 "images"(배열 첫번째) */
  otherPostsImageKey?: string
}

interface ProfileStats {
  created_at: string | null
  response_rate: number | null
  completed_deals: number | null
  is_verified_phone: boolean | null
  is_verified_business: boolean | null
  is_verified_license: boolean | null
  /** 이웃 별 — 평균 별점(0~5) / 후기 수. 후기 없으면 "거래 후기 없음" 표시. */
  trust_score: number | null
  review_count: number | null
}

interface OtherPost {
  id: string
  title: string | null
  created_at: string | null
  images?: string[] | string | null
  image_url?: string | null
  [key: string]: any
}

/** 하단 판매자/작성자/업체 카드 — 모든 상세페이지 공용
 *
 * `userId` 를 주면 profiles 로부터 응답률·거래수·인증 뱃지·가입연차를 자동으로 가져와
 * 스탯 행을 렌더링합니다.
 *
 * `otherPostsTable` 을 주면 "이 판매자의 다른 게시글" 가로 슬라이드 섹션도 함께 렌더됩니다.
 */
export function DetailAuthorCard({
  href,
  name,
  avatarUrl,
  subtitle,
  badges,
  className,
  userId,
  otherPostsTable,
  otherPostsLinkPrefix,
  otherPostsTitle = "이 판매자의 다른 게시글",
  excludeId,
  otherPostsSelect = "id, title, images, created_at",
  otherPostsImageKey = "images",
}: DetailAuthorCardProps) {
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [otherPosts, setOtherPosts] = useState<OtherPost[]>([])
  const [bizInfo, setBizInfo] = useState<BusinessInfo | null>(null)

  // 프로필 통계 + 다른 게시글 + 사업자 정보 로드
  useEffect(() => {
    if (!userId) return
    let alive = true
    const supabase = createClient()

    ;(async () => {
      // 프로필 통계
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "created_at, response_rate, completed_deals, is_verified_phone, is_verified_business, is_verified_license, account_type, trust_score, review_count",
        )
        .eq("id", userId)
        .maybeSingle()
      if (alive && profile) {
        setStats(profile as ProfileStats)
        // 사업자 정보 로드 (account_type이 individual/user/null이 아닐 때만)
        const acctType = (profile as any).account_type
        if (acctType && acctType !== "individual" && acctType !== "user") {
          const info = await getBusinessInfo(supabase as any, userId)
          if (alive) setBizInfo(info)
        }
      }

      // 다른 게시글
      if (otherPostsTable) {
        let query = (supabase as any)
          .from(otherPostsTable)
          .select(otherPostsSelect)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(6)
        if (excludeId) query = query.neq("id", excludeId)
        const { data, error } = await query
        if (alive && !error && Array.isArray(data)) {
          setOtherPosts(data as unknown as OtherPost[])
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [userId, otherPostsTable, excludeId, otherPostsSelect])

  const joinedLabel = stats?.created_at
    ? formatJoinedLabel(stats.created_at)
    : null

  // 가입일(joinedLabel) 은 subtitle 에 이미 들어가므로 stats 행 판정에서 제외.
  // 응답률·거래수·인증 뱃지 중 하나라도 있어야 stats 행을 그린다.
  const hasStatsRow =
    stats &&
    ((stats.response_rate ?? 0) > 0 ||
      (stats.completed_deals ?? 0) > 0 ||
      stats.is_verified_phone ||
      stats.is_verified_business)

  const mergedSubtitle =
    subtitle || joinedLabel ? (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        {subtitle}
        {subtitle && joinedLabel ? (
          <span className="text-muted-foreground/60">·</span>
        ) : null}
        {joinedLabel && <span>{joinedLabel}</span>}
      </span>
    ) : null

  return (
    <>
      <Link
        href={href}
        className={cn(
          "block p-4 bg-card border border-border rounded-xl",
          "hover:border-foreground/20 hover:shadow-sm transition-all",
          bizInfo && "rounded-b-none",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border/60">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={name} width={48} height={48} className="w-full h-full rounded-full object-cover" unoptimized />
              ) : (
                <UserIcon className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">{name}</span>
                {badges}
                {/* 이웃 별 — userId 로 stats 로딩 후 표시 (후기 없으면 "새 이웃") */}
                {stats && (
                  <NeighborStar
                    score={stats.trust_score}
                    reviewCount={stats.review_count}
                    variant="compact"
                  />
                )}
              </div>
              {mergedSubtitle && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {mergedSubtitle}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </div>

        {hasStatsRow && (
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-4 flex-wrap text-xs">
            {(stats?.response_rate ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>
                  응답률 <span className="font-semibold text-foreground">{stats!.response_rate}%</span>
                </span>
              </span>
            )}
            {(stats?.completed_deals ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Package className="w-3.5 h-3.5" />
                <span>
                  거래 <span className="font-semibold text-foreground">{stats!.completed_deals}</span>
                </span>
              </span>
            )}
            {stats?.is_verified_business && (
              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <BadgeCheck className="w-3.5 h-3.5" />
                사업자 인증
              </span>
            )}
            {stats?.is_verified_phone &&
              !stats?.is_verified_business && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  본인 인증
                </span>
              )}
          </div>
        )}
      </Link>

      {bizInfo && (
        <div className="-mt-px border border-border border-t-0 rounded-b-xl overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 flex items-center gap-1.5 border-b border-border/40">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">사업자 정보</span>
          </div>
          <div className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
            {bizInfo.business_name && (
              <>
                <dt className="text-muted-foreground">상호</dt>
                <dd className="font-medium text-foreground">{bizInfo.business_name}</dd>
              </>
            )}
            {bizInfo.office_address && (
              <>
                <dt className="text-muted-foreground">주소</dt>
                <dd className="text-foreground">{bizInfo.office_address}</dd>
              </>
            )}
            {bizInfo.business_number && (
              <>
                <dt className="text-muted-foreground">사업자 번호</dt>
                <dd className="text-foreground tabular-nums">{bizInfo.business_number}</dd>
              </>
            )}
            {bizInfo.registration_number && bizInfo.requested_type === "agent" && (
              <>
                <dt className="text-muted-foreground">등록번호</dt>
                <dd className="text-foreground tabular-nums">{bizInfo.registration_number}</dd>
              </>
            )}
            {bizInfo.contact_phone && (
              <>
                <dt className="text-muted-foreground">연락처</dt>
                <dd>
                  <a href={`tel:${bizInfo.contact_phone}`} className="text-foreground hover:text-primary tabular-nums transition-colors">
                    {bizInfo.contact_phone}
                  </a>
                </dd>
              </>
            )}
          </div>
        </div>
      )}

      {otherPosts.length > 0 && otherPostsLinkPrefix && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-foreground">
              {otherPostsTitle}
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                {otherPosts.length}
              </span>
            </h4>
            <Link
              href={href}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              전체보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
            <div className="flex gap-3 pb-1">
              {otherPosts.map((p) => {
                const thumb = resolveThumb(p, otherPostsImageKey)
                return (
                  <Link
                    key={p.id}
                    href={`${otherPostsLinkPrefix}/${p.id}`}
                    className="shrink-0 w-28 group"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/60">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={p.title ?? ""}
                          width={112}
                          height={112}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-foreground line-clamp-2 leading-snug">
                      {p.title ?? "제목 없음"}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function resolveThumb(p: OtherPost, key: string): string | null {
  const raw = (p as any)[key]
  if (!raw) {
    // fallback common fields
    if (p.image_url) return p.image_url
    return null
  }
  if (Array.isArray(raw)) return raw[0] ?? null
  if (typeof raw === "string") return raw
  return null
}

function formatJoinedLabel(iso: string): string | null {
  const joined = new Date(iso)
  if (Number.isNaN(joined.getTime())) return null
  const now = Date.now()
  const diffMs = now - joined.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return "오늘 가입"
  if (days < 30) return `가입 ${days}일차`
  const months = Math.floor(days / 30)
  if (months < 12) return `가입 ${months}개월차`
  const years = Math.floor(days / 365)
  return `가입 ${years}년차`
}
