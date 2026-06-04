"use client"

// 헤더 우측 3-버튼 클러스터 (알림 / 사용자 / 햄버거)
// 홈 헤더와 마이페이지 헤더가 동일한 메뉴를 공유하기 위한 컴포넌트.
// Header.tsx 의 데스크탑 클러스터를 그대로 옮긴 것이므로,
// 여기 한 군데만 수정하면 양쪽이 동시에 갱신된다.

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { User as SupabaseUser } from "@supabase/supabase-js"
import {
  Menu,
  User,
  Edit3,
  Heart,
  MessageSquare,
  MessageCircle,
  Mail,
  Settings,
  Shield,
  LogOut,
  Sun,
  Moon,
  Newspaper,
  MapPin,
  Building,
  Briefcase,
  UserCircle2,
  HandHeart,
  Home as HomeIcon,
  Paintbrush,
  Truck,
  SprayCan,
  Wrench,
  Store,
  Users,
  ShoppingBag,
  Gift,
  ShoppingCart,
  Tractor,
  Leaf,
  Utensils,
  Lightbulb,
  HelpCircle,
  Camera,
  ChevronDown,
  Sparkles,
  Coins,
  Megaphone,
  FileText,
  Fuel,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/notification-bell"
import { PointCoin } from "@/components/point-coin"
import { RegisterSheet } from "@/components/register-sheet"
import { useSiteBranding } from "@/components/site-branding-client"
import { useLabel, useLabelImage } from "@/components/site-labels-client"
import { EditableIcon } from "@/components/editable-icon"
import { plazaCityName } from "@/lib/plaza/city-name"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface Props {
  user: SupabaseUser | { id: string } | null
  userRole?: string | null
  userAccountType?: string | null
}

export function HeaderActions({
  user,
  userRole: userRoleProp,
  userAccountType: userAccountTypeProp,
}: Props) {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [holmesOpen, setHolmesOpen] = useState(false)
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [registerSheetOpen, setRegisterSheetOpen] = useState(false)
  const [fetchedRole, setFetchedRole] = useState<string | null>(null)
  const [fetchedAccountType, setFetchedAccountType] = useState<string | null>(null)
  // 드롭다운 프로필 카드용 — 닉네임 / 아바타 / 포인트 / 찜·채팅 카운트
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [points, setPoints] = useState<number | null>(null)
  const [favCount, setFavCount] = useState<number>(0)
  const [chatUnread, setChatUnread] = useState<number>(0)
  const [customMenu, setCustomMenu] = useState<
    Array<{ label: string; href: string; icon: string | null }>
  >([])

  const siteBranding = useSiteBranding()

  // 슈퍼관리자가 편집 가능한 라벨들 — 미존재 시 fallback 사용
  const L = {
    plazaInfo: useLabel("nav.section.plaza_info", `${plazaCityName(siteBranding.name)} 정보`),
    plazaNews: useLabel("nav.plaza_news.label", `${plazaCityName(siteBranding.name)} 소식`),
    plazaNewsHelper: useLabel("nav.plaza_news.helper", "뉴스 · 행사 · 날씨 한눈에"),
    toilets: useLabel("nav.toilets.label", "내 주변 화장실"),
    toiletsHelper: useLabel("nav.toilets.helper", "반경 1km 공공화장실 찾기"),
    gasStations: useLabel("nav.gas_stations.label", "내 주변 주유소"),
    gasStationsHelper: useLabel("nav.gas_stations.helper", "실시간 가격 + 저렴한 순위"),
    sectionCommunity: useLabel("nav.section.community", "우리동네"),
    realEstate: useLabel("nav.realestate.label", "부동산"),
    holmes: useLabel("nav.holmes.label", "홈즈"),
    newStore: useLabel("nav.new_store.label", "신장개업"),
    clubs: useLabel("nav.clubs.label", "모임"),
    sectionMarket: useLabel("nav.section.market", "동네장터"),
    secondhand: useLabel("nav.secondhand.label", "중고거래"),
    sharing: useLabel("nav.sharing.label", "나눔"),
    jobs: useLabel("nav.jobs.label", "구인구직"),
    groupBuying: useLabel("nav.group_buying.label", "공동구매"),
    localFood: useLabel("nav.local_food.label", "로컬푸드"),
    sectionBoards: useLabel("nav.section.boards", "게시판"),
    boardFree: useLabel("nav.board.free.label", "마을 사랑방"),
    boardRestaurant: useLabel("nav.board.restaurant.label", "맛집 추천"),
    boardLiving: useLabel("nav.board.living.label", "살림 정보"),
    boardDaily: useLabel("nav.board.daily.label", "농업 일기"),
    boardQna: useLabel("nav.board.qna.label", "궁금해요"),
    // 부제 (helper) — 슈퍼관리자가 편집 가능
    realEstateHelper:  useLabel("nav.realestate.helper",  "공인중개사 매물"),
    holmesHelper:      useLabel("nav.holmes.helper",      "집 꾸미기부터 이사까지"),
    newStoreHelper:    useLabel("nav.new_store.helper",   "새로 문 연 가게"),
    clubsHelper:       useLabel("nav.clubs.helper",       "동네 사람들"),
    secondhandHelper:  useLabel("nav.secondhand.helper",  "동네 이웃과 거래"),
    sharingHelper:     useLabel("nav.sharing.helper",     "무료로 나눠요"),
    jobsHelper:        useLabel("nav.jobs.helper",        "일도 취미도"),
    groupBuyingHelper: useLabel("nav.group_buying.helper","같이 사면 저렴"),
    localFoodHelper:   useLabel("nav.local_food.helper",  "동네 신선 식재료"),
    boardFreeHelper:       useLabel("nav.board.free.helper",       "무엇이든 이야기"),
    boardRestaurantHelper: useLabel("nav.board.restaurant.helper", "가볼만한 가게"),
    boardLivingHelper:     useLabel("nav.board.living.helper",     "꿀팁 모음"),
    boardDailyHelper:      useLabel("nav.board.daily.helper",      "오늘의 한 컷"),
    boardQnaHelper:        useLabel("nav.board.qna.helper",        "동네에 물어보기"),
  }
  // 아이콘 오버라이드 (이모지). 비어있으면 기본 lucide 아이콘 유지.
  const I = {
    plazaNews: useLabel("nav.plaza_news.icon", ""),
    toilets: useLabel("nav.toilets.icon", ""),
    gasStations: useLabel("nav.gas_stations.icon", ""),
    realEstate: useLabel("nav.realestate.icon", ""),
    holmes: useLabel("nav.holmes.icon", ""),
    newStore: useLabel("nav.new_store.icon", ""),
    clubs: useLabel("nav.clubs.icon", ""),
    secondhand: useLabel("nav.secondhand.icon", ""),
    sharing: useLabel("nav.sharing.icon", ""),
    jobs: useLabel("nav.jobs.icon", ""),
    groupBuying: useLabel("nav.group_buying.icon", ""),
    localFood: useLabel("nav.local_food.icon", ""),
    boardFree: useLabel("nav.board.free.icon", ""),
    boardRestaurant: useLabel("nav.board.restaurant.icon", ""),
    boardLiving: useLabel("nav.board.living.icon", ""),
    boardDaily: useLabel("nav.board.daily.icon", ""),
    boardQna: useLabel("nav.board.qna.icon", ""),
  }
  // 이미지 오버라이드 (URL). 이미지가 있으면 이모지/lucide 보다 우선 표시.
  const Img = {
    plazaNews: useLabelImage("nav.plaza_news.icon"),
    toilets: useLabelImage("nav.toilets.icon"),
    gasStations: useLabelImage("nav.gas_stations.icon"),
    realEstate: useLabelImage("nav.realestate.icon"),
    holmes: useLabelImage("nav.holmes.icon"),
    newStore: useLabelImage("nav.new_store.icon"),
    clubs: useLabelImage("nav.clubs.icon"),
    secondhand: useLabelImage("nav.secondhand.icon"),
    sharing: useLabelImage("nav.sharing.icon"),
    jobs: useLabelImage("nav.jobs.icon"),
    groupBuying: useLabelImage("nav.group_buying.icon"),
    localFood: useLabelImage("nav.local_food.icon"),
    boardFree: useLabelImage("nav.board.free.icon"),
    boardRestaurant: useLabelImage("nav.board.restaurant.icon"),
    boardLiving: useLabelImage("nav.board.living.icon"),
    boardDaily: useLabelImage("nav.board.daily.icon"),
    boardQna: useLabelImage("nav.board.qna.icon"),
  }

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const plaza = getCurrentPlazaClient()
        const cache = (globalThis as any).__customMenuCache as
          | { plaza: string | null; data: any[]; ts: number }
          | undefined
        if (cache && cache.plaza === plaza && Date.now() - cache.ts < 5 * 60_000) {
          if (alive) setCustomMenu(cache.data)
          return
        }
        let q: any = supabase
          .from("homepage_menu")
          .select("label, href, icon, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
        if (plaza) q = q.eq("plaza_id", plaza)
        const { data } = await q
        const items = Array.isArray(data)
          ? data.map((d: any) => ({ label: d.label, href: d.href, icon: d.icon }))
          : []
        ;(globalThis as any).__customMenuCache = { plaza, data: items, ts: Date.now() }
        if (alive) setCustomMenu(items)
      } catch {}
    })()
    return () => {
      alive = false
    }
  }, [supabase])

  useEffect(() => {
    if (!user) return
    // role/accountType 이 props 로 왔어도 nickname/avatar 는 항상 fetch 해야 함
    let alive = true
    const CACHE_KEY = "profile_cache_v2" // v2 — nickname/avatar_url 추가
    const CACHE_TTL_MS = 5 * 60_000
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw)
        if (cached && cached.userId === user.id && Date.now() - cached.ts < CACHE_TTL_MS) {
          if (userRoleProp == null) setFetchedRole(cached.role ?? null)
          if (userAccountTypeProp == null) setFetchedAccountType(cached.account_type ?? null)
          if (cached.nickname) setNickname(cached.nickname)
          if (cached.avatar_url) setAvatarUrl(cached.avatar_url)
          return
        }
      }
    } catch {}
    ;(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, account_type, nickname, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
      if (alive && data) {
        if (userRoleProp == null) setFetchedRole(data.role ?? null)
        if (userAccountTypeProp == null) setFetchedAccountType(data.account_type ?? null)
        setNickname(data.nickname ?? null)
        setAvatarUrl(data.avatar_url ?? null)
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              userId: user.id,
              role: data.role,
              account_type: data.account_type,
              nickname: data.nickname,
              avatar_url: data.avatar_url,
              ts: Date.now(),
            }),
          )
        } catch {}
      }
    })()
    return () => {
      alive = false
    }
  }, [user, userRoleProp, userAccountTypeProp, supabase])

  const effectiveRole = userRoleProp ?? fetchedRole
  const effectiveAccountType = userAccountTypeProp ?? fetchedAccountType

  // 포인트 / 찜 / 채팅 읽지 않음 카운트 — 로그인 시에만, 5분 sessionStorage 캐시
  useEffect(() => {
    if (!user) return
    let alive = true
    const CACHE_KEY = "userdrop_meta_v1"
    const TTL = 5 * 60_000
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const c = JSON.parse(raw)
        if (c?.userId === user.id && Date.now() - c.ts < TTL) {
          setPoints(c.points ?? null)
          setFavCount(c.favCount ?? 0)
          setChatUnread(c.chatUnread ?? 0)
          return
        }
      }
    } catch {}
    ;(async () => {
      const [pRes, fRes, cRes] = await Promise.all([
        fetch("/api/points/balance", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        fetch("/api/chat/unread-total").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!alive) return
      const p = typeof pRes?.available === "number" ? pRes.available : null
      const f = typeof fRes?.count === "number" ? fRes.count : 0
      const cu = typeof cRes?.total === "number" ? cRes.total : (typeof cRes?.unread === "number" ? cRes.unread : 0)
      setPoints(p)
      setFavCount(f)
      setChatUnread(cu)
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId: user.id, points: p, favCount: f, chatUnread: cu, ts: Date.now() }))
      } catch {}
    })()
    return () => { alive = false }
  }, [user, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  const buttonClass = "text-foreground hover:text-primary hover:bg-secondary"

  return (
    <>
      {user && <NotificationBell />}

      {/* 사용자 메뉴 */}
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-2.5 w-9 h-9 rounded-full overflow-hidden ring-2 ring-rose-500/60 hover:ring-rose-500 transition-shadow flex items-center justify-center bg-secondary flex-shrink-0"
              aria-label="사용자 메뉴"
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt={nickname || "내 프로필"} width={36} height={36} loading="lazy" className="w-full h-full object-cover" />
              ) : nickname ? (
                <span className="text-sm font-bold text-foreground">
                  {nickname.charAt(0)}
                </span>
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[260px] p-0 overflow-hidden">
            {/* 프로필 + 포인트 — 연한 색상 채워진 헤더 영역 */}
            <div className="bg-rose-50/70 dark:bg-rose-950/15 border-b border-border">
              <Link
                href="/mypage"
                prefetch={false}
                className="flex items-center gap-3 px-4 pt-4 pb-3 hover:bg-rose-100/40 dark:hover:bg-rose-950/25 transition-colors"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0 ring-2 ring-card">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="" width={44} height={44} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {nickname || "이웃"} <span className="text-muted-foreground font-normal">님</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    프로필 보기
                  </p>
                </div>
              </Link>

              {/* 포인트 — 같은 헤더 영역 안 */}
              <Link
                href="/mypage/points"
                prefetch={false}
                className="flex items-center justify-between gap-3 mx-3 mb-3 px-3 py-2.5 rounded-xl bg-card/70 hover:bg-card transition-colors border border-amber-500/25"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <PointCoin size="md" />내 포인트
                </span>
                <span className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
                  {points != null ? `${points.toLocaleString()}P` : "—"}
                </span>
              </Link>
            </div>

            {/* 메인 메뉴 리스트 — 글쓰기 / 마이페이지 / 찜 / 채팅 / 초대요청 ─ 계정 유형 / 설정 ─ 로그아웃 */}
            <div className="px-1.5 py-1.5">
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setRegisterSheetOpen(true) }}
                className="cursor-pointer flex items-center gap-2 px-2.5 py-2"
              >
                <Edit3 className="w-4 h-4 text-foreground" />
                <span className="text-sm font-medium">글쓰기</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/mypage" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <User className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">마이페이지</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/mypage?tab=saved" prefetch={false} scroll={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <Heart className="w-4 h-4 text-foreground fill-current" />
                  <span className="text-sm font-medium">찜 목록</span>
                  {favCount > 0 && (
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{favCount}</span>
                  )}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/chat" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <MessageCircle className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">채팅</span>
                  {chatUnread > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white tabular-nums">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
              {(() => {
                const serviceTypes = ["agent", "interior", "moving", "cleaning", "repair"]
                const isServiceProvider = effectiveAccountType && serviceTypes.includes(effectiveAccountType)
                if (!isServiceProvider) return null
                return (
                  <DropdownMenuItem asChild>
                    <Link href="/invitations" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                      <Mail className="w-4 h-4 text-foreground" />
                      <span className="text-sm font-medium">초대 요청</span>
                    </Link>
                  </DropdownMenuItem>
                )
              })()}
              <DropdownMenuSeparator className="mx-3" />
              <DropdownMenuItem asChild>
                <Link href="/mypage/orders" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <ShoppingCart className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">구매 내역</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/mypage/sales" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <Store className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">판매 관리</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/mypage/trades" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <Tractor className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">내 거래 (농기구·경매·대여)</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-3" />
              <DropdownMenuItem asChild>
                <Link href="/mypage/account-upgrade" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <Shield className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">계정 유형 신청</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/mypage/settings" prefetch={false} className="cursor-pointer flex items-center gap-2 px-2.5 py-2">
                  <Settings className="w-4 h-4 text-foreground" />
                  <span className="text-sm font-medium">설정</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-3" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer flex items-center gap-2 px-2.5 py-2 text-destructive"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">로그아웃</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href="/auth/login">
          <Button variant="ghost" size="sm" className={buttonClass}>
            로그인
          </Button>
        </Link>
      )}


      <RegisterSheet
        open={registerSheetOpen}
        onClose={() => setRegisterSheetOpen(false)}
        accountType={effectiveAccountType}
      />
    </>
  )
}
