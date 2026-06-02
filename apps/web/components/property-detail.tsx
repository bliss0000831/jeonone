"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  MapPin,
  Ruler,
  Building2,
  Compass,
  Car,
  Phone,
  MessageCircle,
  Home,
  Loader2,
  MoreVertical,
  ArrowUp,
  Pencil,
  Trash2,
  User as UserIcon,
  Instagram,
  Youtube,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Property } from "@/types/app"
import { InstagramEmbed } from "@/components/instagram-embed"
import { YouTubeEmbed } from "@/components/youtube-embed"
import { PropertyPanoramaViewer } from "@/components/property-panorama-viewer"
import { cn } from "@/lib/utils"
import { BumpDialog } from "@/components/bump-dialog"
import { createClient } from "@/lib/supabase/client"
import { User as SupabaseUser } from "@supabase/supabase-js"
import {
  DetailShell,
  DetailGallery,
  DetailBody,
  DetailSection,
  DetailKeyValue,
  DetailInfoBox,
  DetailAuthorCard,
  DetailMeta,
  DetailTitleBlock,
  DetailHeaderActions,
} from "@/components/detail"
import { ReportButton } from "@/components/report-button"
import { toast } from "sonner"

const PropertyMap = dynamic(
  () => import("@/components/naver-map").then((m) => m.NaverMap),
  { ssr: false },
)

interface PropertyDetailProps {
  property: Property
  user: SupabaseUser | null
}

export function PropertyDetail({ property, user }: PropertyDetailProps) {
  const [isLiked, setIsLiked] = useState(property.isLiked || false)
  const [likeCount, setLikeCount] = useState(property.likes)
  const [showPhone, setShowPhone] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState<null | "instagram" | "youtube">(null)
  const router = useRouter()
  const supabase = createClient()

  const isOwner = user?.id === property.seller.id
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const sb = createClient()
    sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data?.role === "admin" || data?.role === "superadmin") setIsAdmin(true)
      })
    return () => {
      cancelled = true
    }
    // supabase 클라이언트는 매 렌더 새 인스턴스라 deps 에 넣으면 무한루프 → user.id 만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const handleChat = async () => {
    if (!user) {
      router.push(`/auth/login?redirect=/property/${property.id}`)
      return
    }
    if (user.id === property.seller.id) {
      toast("본인 매물에는 채팅할 수 없습니다")
      return
    }
    setChatLoading(true)
    try {
      const response = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: property.id,
          sellerId: property.seller.id,
        }),
      })
      const data = await response.json()
      if (response.ok && data.room) {
        router.push(`/chat/${data.room.id}`)
      } else {
        toast.error(data.error || "채팅방 생성에 실패했습니다")
      }
    } catch (error) {
      console.error("채팅방 생성 실패:", error)
      toast.error("채팅방 생성에 실패했습니다")
    } finally {
      setChatLoading(false)
    }
  }

  const handleLike = async () => {
    if (!user) {
      router.push(`/auth/login?redirect=/property/${property.id}`)
      return
    }
    // 더블클릭 race 가드 — 이전 요청 진행 중이면 무시
    if (likeLoading) return
    setLikeLoading(true)
    try {
      if (isLiked) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("property_id", property.id)
        if (!error) {
          setIsLiked(false)
          setLikeCount((p) => Math.max(0, p - 1))
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, property_id: property.id })
        // UNIQUE 위반(이미 찜한 상태)도 success 처리 — 동시 클릭 시 멱등성
        if (!error || (error as any)?.code === "23505") {
          setIsLiked(true)
          if (!error) setLikeCount((p) => p + 1)
        }
      }
    } finally {
      setLikeLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteDialogOpen(false)
    setDeleteLoading(true)
    try {
      const { error } = await supabase
        .from("properties")
        .delete()
        .eq("id", property.id)
      if (error) {
        toast.error("매물 삭제에 실패했습니다: " + error.message)
        return
      }
      toast.success("매물이 삭제되었습니다")
      router.push("/mypage")
    } catch {
      toast.error("매물 삭제 중 오류가 발생했습니다")
    } finally {
      setDeleteLoading(false)
    }
  }

  const formatPrice = () => {
    if (property.transactionType === "월세") {
      return `${property.deposit?.toLocaleString()}/${property.monthlyRent}만`
    }
    if (property.price >= 10000) {
      const uk = Math.floor(property.price / 10000)
      const man = property.price % 10000
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
    }
    return `${property.price.toLocaleString()}만원`
  }

  const getTimeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return "오늘"
    if (days === 1) return "어제"
    if (days < 7) return `${days}일 전`
    if (days < 30) return `${Math.floor(days / 7)}주 전`
    return `${Math.floor(days / 30)}개월 전`
  }

  const isAgent = property.seller.accountType === "agent"
  const transactionBadge = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className={cn(
          "inline-block px-2.5 py-1 text-xs font-semibold rounded-md",
          property.transactionType === "매매" &&
            "bg-primary text-primary-foreground",
          property.transactionType === "전세" &&
            "bg-accent text-accent-foreground",
          property.transactionType === "월세" &&
            "bg-secondary text-secondary-foreground",
        )}
      >
        {property.transactionType}
      </span>
      {property.propertyType && (
        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground">
          {property.propertyType}
        </span>
      )}
      <span
        className={cn(
          "inline-block px-2.5 py-1 text-xs font-semibold rounded-md text-white",
          isAgent ? "bg-blue-600" : "bg-zinc-500",
        )}
      >
        {isAgent ? "중개사" : "일반"}
      </span>
    </div>
  )

  return (
    <>
    <DetailShell
      backHref="/"
      user={user}
      rightActions={
        <DetailHeaderActions
          isLiked={isLiked}
          likeLoading={likeLoading}
          onLike={handleLike}
          shareMeta={{
            title: `${property.transactionType} ${formatPrice()} - ${property.title}`,
            description: `${property.address} · ${property.propertyType} ${property.area}m²`,
            imageUrl: property.images?.[0],
          }}
          extra={
            <>
              {!isOwner && !isAdmin && (
                <ReportButton
                  targetType="property"
                  targetId={property.id}
                  variant="icon"
                />
              )}
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="더보기 메뉴">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && (
                      <DropdownMenuItem onSelect={() => setBumpOpen(true)}>
                        <ArrowUp className="w-4 h-4 mr-2" />
                        올리기
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(`/property/${property.id}/edit`)
                      }
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      매물 수정
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={deleteLoading}
                      className="text-destructive focus:text-destructive"
                    >
                      {deleteLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      매물 삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />
      }
      actionBar={
        <>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 gap-2"
            onClick={() => setShowPhone(!showPhone)}
          >
            <Phone className="w-5 h-5" />
            {showPhone && property.seller.phone
              ? property.seller.phone
              : "전화하기"}
          </Button>
          <Button
            size="lg"
            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleChat}
            disabled={chatLoading}
          >
            {chatLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MessageCircle className="w-5 h-5" />
            )}
            {chatLoading ? "연결중..." : "채팅하기"}
          </Button>
        </>
      }
    >
      <DetailGallery
        images={property.images}
        alt={property.title}
        fallbackIcon={Home}
        fallbackLabel={property.propertyType}
      />

      <DetailBody>
        <DetailTitleBlock
          category={transactionBadge}
          price={formatPrice()}
          priceTone="foreground"
          title={property.title}
        />

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-4 h-4" />
          <span>{property.address}</span>
        </div>

        <DetailMeta
          views={property.views}
          likes={likeCount}
          timeAgo={getTimeAgo(property.createdAt)}
        />

        {property.panoramaImages && property.panoramaImages.length > 0 && (
          <DetailSection title="🏠 360° 가상 투어">
            <PropertyPanoramaViewer images={property.panoramaImages} height={460} />
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <Compass className="w-3 h-3" />
              마우스 드래그(또는 손가락 스와이프)로 360° 둘러보세요
            </p>
          </DetailSection>
        )}

        {/* AI 홍보영상 — 기능 일시 비활성화 (추후 프리미엄으로 재도입 예정).
            기존 매물에 영상이 저장되어 있어도 노출하지 않음. */}

        {(property.instagramPostUrl || property.youtubePostUrl) && (
          <div className="flex items-stretch gap-2">
            {property.instagramPostUrl && (
              <button
                type="button"
                onClick={() => setMediaOpen("instagram")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 via-rose-500 to-orange-400 text-white shadow-sm hover:opacity-90 transition-opacity"
                aria-label="인스타그램 게시물 보기"
              >
                <Instagram className="w-5 h-5" />
                인스타 보기
              </button>
            )}
            {property.youtubePostUrl && (
              <button
                type="button"
                onClick={() => setMediaOpen("youtube")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors"
                aria-label="유튜브 영상 보기"
              >
                <Youtube className="w-5 h-5" />
                유튜브 보기
              </button>
            )}
          </div>
        )}

        {/* Key Info Grid — property signature design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
              <Ruler className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">전용면적</div>
              <div className="font-semibold text-foreground">
                {property.area}m²
                {(() => {
                  const sqm = Number(property.area)
                  if (!Number.isFinite(sqm) || sqm <= 0) return null
                  const pyeong = Math.round(sqm / 3.3058)
                  return <span className="ml-1">({pyeong}평)</span>
                })()}
              </div>
            </div>
          </div>
          {property.floor && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">층수</div>
                <div className="font-semibold text-foreground">
                  {property.floor}
                  {property.totalFloors ? `/${property.totalFloors}층` : ""}
                </div>
              </div>
            </div>
          )}
          {property.direction && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
                <Compass className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">방향</div>
                <div className="font-semibold text-foreground">
                  {property.direction}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
              <Car className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">주차</div>
              <div className="font-semibold text-foreground">
                {property.parking ? "가능" : "불가"}
              </div>
            </div>
          </div>
        </div>

        <DetailSection title="상세정보">
          {/* 2-컬럼 그리드 — 모바일에서도 두 칸씩 (한 행에 두 항목) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {property.rooms && (
              <DetailKeyValue
                label="방/욕실"
                value={`${property.rooms}개 / ${property.bathrooms}개`}
              />
            )}
            {property.maintenanceFee && (
              <DetailKeyValue
                label="관리비"
                value={`${property.maintenanceFee}만원`}
              />
            )}
            {property.moveInDate && (
              <DetailKeyValue label="입주가능일" value={property.moveInDate} />
            )}
            <DetailKeyValue
              label="엘리베이터"
              value={property.elevator ? "있음" : "없음"}
            />
            <DetailKeyValue
              label="반려동물"
              value={property.petAllowed ? "가능" : "불가"}
            />
          </div>
        </DetailSection>

        {property.features.length > 0 && (
          <DetailSection title="특징">
            <div className="flex flex-wrap gap-2">
              {property.features.map((feature, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-full text-sm"
                >
                  {feature}
                </span>
              ))}
            </div>
          </DetailSection>
        )}

        {property.description && (
          <DetailSection title="상세설명">
            <DetailInfoBox>
              {property.description}
            </DetailInfoBox>
          </DetailSection>
        )}

        <DetailSection title="위치">
          <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4" />
            {property.address}
          </p>
          <PropertyMap
            address={property.address}
            lat={property.lat ?? undefined}
            lng={property.lng ?? undefined}
          />
        </DetailSection>

        <DetailSection title="판매자 정보">
          <DetailAuthorCard
            href={`/profile/${property.seller.id}`}
            name={property.seller.name}
            avatarUrl={property.seller.profileImage}
            badges={
              property.seller.accountType === "agent" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  <Building2 className="w-3 h-3" />
                  공인중개사
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
                  <UserIcon className="w-3 h-3" />
                  일반인
                </span>
              )
            }
            userId={property.seller.id}
            otherPostsTable="properties"
            otherPostsLinkPrefix="/property"
            otherPostsTitle="이 판매자의 다른 매물"
            excludeId={property.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>

    {mediaOpen && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={() => setMediaOpen(null)}
      >
        <div
          className="relative w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-2xl bg-background p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMediaOpen(null)}
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-secondary transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="pt-6">
            {mediaOpen === "instagram" && property.instagramPostUrl && (
              <InstagramEmbed url={property.instagramPostUrl} />
            )}
            {mediaOpen === "youtube" && property.youtubePostUrl && (
              <YouTubeEmbed url={property.youtubePostUrl} />
            )}
          </div>
        </div>
      </div>
    )}
    {isOwner && (
      <BumpDialog
        open={bumpOpen}
        onClose={() => setBumpOpen(false)}
        targetType="property"
        targetId={property.id}
      />
    )}
    {/* 삭제 확인 다이얼로그 */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>매물을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            이 작업은 되돌릴 수 없습니다. 매물 정보와 이미지가 모두 삭제됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
