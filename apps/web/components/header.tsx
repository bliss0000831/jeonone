"use client"

import Link from "next/link"
import { PlusCircle, User, Menu, LogOut, Moon, Sun, HelpCircle, FileText, Shield, Settings, Megaphone, Paintbrush, Truck, SprayCan, Wrench, Mail, Edit3, Store, ShoppingCart, Gift, Home as HomeIcon, Building, ChevronDown, Leaf, Users, MessageSquare, Utensils, Lightbulb, Camera, Newspaper, MapPin, Search as SearchIcon, Briefcase, UserCircle2, HandHeart, Sparkles, ShoppingBag, Coins, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { User as SupabaseUser } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"

import { useTheme } from "next-themes"
import { useState, useEffect, useMemo } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LocationSelector, UserLocation, useUserLocation } from "@/components/location-selector"
import { PointCoin } from "@/components/point-coin"
import { NotificationBell } from "@/components/notification-bell"
import { HeaderActions } from "@/components/header-actions"
import { cn } from "@/lib/utils"
import { RegisterSheet } from "@/components/register-sheet"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"

interface HeaderProps {
  user?: SupabaseUser | null
  location?: UserLocation | null
  onLocationChange?: (location: UserLocation) => void
  userRole?: string | null
  userAccountType?: string | null
}

export function Header({ user, location: propLocation, onLocationChange, userRole: userRoleProp, userAccountType: userAccountTypeProp }: HeaderProps) {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [holmesOpen, setHolmesOpen] = useState(false)
  const [mobileHolmesOpen, setMobileHolmesOpen] = useState(false)
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [mobilePropertyOpen, setMobilePropertyOpen] = useState(false)
  const [registerSheetOpen, setRegisterSheetOpen] = useState(false)
  // 부모가 userRole/userAccountType 을 전달하지 않은 페이지에서도 관리자/사업자 메뉴가
  // 보이도록 자체 조회. 부모가 내려준 값이 있으면 그걸 우선 사용.
  const [fetchedRole, setFetchedRole] = useState<string | null>(null)
  const [fetchedAccountType, setFetchedAccountType] = useState<string | null>(null)
  // 어드민 → 테마 → 메뉴 에서 정의한 커스텀 메뉴 — 햄버거에 추가 노출
  // 모듈 캐시 5분 — 페이지 이동마다 DB 재조회 안 함
  const [customMenu, setCustomMenu] = useState<Array<{ label: string; href: string; icon: string | null }>>([])
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
          .from('homepage_menu')
          .select('label, href, icon, sort_order, is_active')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (plaza) q = q.eq('plaza_id', plaza)
        const { data } = await q
        const items = Array.isArray(data)
          ? data.map((d: any) => ({ label: d.label, href: d.href, icon: d.icon }))
          : []
        ;(globalThis as any).__customMenuCache = { plaza, data: items, ts: Date.now() }
        if (alive) setCustomMenu(items)
      } catch {
        // 테이블 없거나 RLS 거부 — 무시
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase])
  useEffect(() => {
    if (!user) return
    if (userRoleProp != null && userAccountTypeProp != null) return
    let alive = true

    // sessionStorage 통합 캐시 — bottom-nav 와 header 가 같은 키 공유
    const CACHE_KEY = 'profile_cache_v1'
    const CACHE_TTL_MS = 5 * 60_000
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw)
        if (cached && cached.userId === user.id && Date.now() - cached.ts < CACHE_TTL_MS) {
          if (userRoleProp == null) setFetchedRole(cached.role ?? null)
          if (userAccountTypeProp == null) setFetchedAccountType(cached.account_type ?? null)
          return
        }
      }
    } catch {}

    ;(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, account_type")
        .eq("id", user.id)
        .maybeSingle()
      if (alive && data) {
        if (userRoleProp == null) setFetchedRole(data.role ?? null)
        if (userAccountTypeProp == null) setFetchedAccountType(data.account_type ?? null)
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              userId: user.id,
              role: data.role,
              account_type: data.account_type,
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
  const userRole = userRoleProp ?? fetchedRole
  const userAccountType = userAccountTypeProp ?? fetchedAccountType
  const effectiveRole = userRole
  const effectiveAccountType = userAccountType
  // SSR 로 layout 의 SiteBrandingProvider 가 초기값을 흘려보내므로
  // 첫 렌더부터 로고가 그려진다 (빈 박스 지연 0). 관리자 변경 시
  // provider 의 백그라운드 fetch 가 자동 갱신.
  const siteBranding = useSiteBranding()
  // 또한 옛날 sessionStorage 잔재가 있으면 청소만 해 둠
  useEffect(() => {
    try { sessionStorage.removeItem('siteBranding') } catch {}
  }, [])
  
  // localStorage에서 위치 가져오기 (props보다 우선)
  const { location: savedLocation, setLocation: setSavedLocation } = useUserLocation()
  // mounted 후에만 savedLocation 사용 (hydration 불일치 방지)
  const location = mounted ? (savedLocation ?? propLocation ?? null) : (propLocation ?? null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  const handleLocationChange = (newLocation: UserLocation) => {
    setSavedLocation(newLocation)  // localStorage에 저장
    onLocationChange?.(newLocation)
  }
  
  return (
    <header className="safe-top sticky top-0 z-50 bg-background">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo + Location */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 group flex-shrink-0">
              <div className="w-8 sm:w-9 h-8 sm:h-9 flex-shrink-0 rounded-lg overflow-hidden mt-[1px]">
                <img
                  key={siteBranding.logo}
                  src={siteBranding.logo}
                  alt={`${siteBranding.name} 로고`}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-base sm:text-lg font-bold text-foreground whitespace-nowrap">{siteBranding.name}</span>
            </Link>
            <span className="text-muted-foreground text-xs sm:text-sm flex-shrink-0">|</span>
            {/* mt-0.5 — '춘천광장' 글자 베이스라인과 pill 중앙을 맞추기 위한 미세 조정 */}
            <div className="flex-shrink-0 mt-[1px]">
              <LocationSelector
                location={location ?? null}
                onLocationChange={handleLocationChange}
              />
            </div>
          </div>

          {/* Navigation - Desktop */}
          <nav className="hidden xl:flex items-center gap-6">
            <Link href="/properties?sort=newest" className="text-sm text-foreground hover:text-primary transition-colors font-medium">
              신규매물
            </Link>
            <Link href="/properties?sort=popular" className="text-sm text-foreground hover:text-primary transition-colors font-medium">
              인기매물
            </Link>
            {/* 홈케어 드롭다운 */}
            <DropdownMenu>
              <DropdownMenuTrigger className="text-sm text-foreground hover:text-primary transition-colors font-medium flex items-center gap-1 cursor-pointer">
                홈케어
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-36">
                <DropdownMenuItem asChild>
                  <Link href="/interior" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Paintbrush className="w-4 h-4 text-purple-500" />
                    인테리어
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/moving" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Truck className="w-4 h-4 text-yellow-600" />
                    이사
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/cleaning" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <SprayCan className="w-4 h-4 text-pink-500" />
                    청소
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/repair" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-orange-500" />
                    수리
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 우리동네 드롭다운 — 신장개업·모임 묶음 */}
            <DropdownMenu>
              <DropdownMenuTrigger className="text-sm text-foreground hover:text-primary transition-colors font-medium flex items-center gap-1 cursor-pointer">
                우리동네
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-40">
                <DropdownMenuItem asChild>
                  <Link href="/new-store" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Store className="w-4 h-4 text-amber-500" />
                    신장개업
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/clubs" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    모임
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 동네장터 드롭다운 — 중고거래·나눔·구인구직·공동구매·로컬푸드 묶음 */}
            <DropdownMenu>
              <DropdownMenuTrigger className="text-sm text-foreground hover:text-primary transition-colors font-medium flex items-center gap-1 cursor-pointer">
                동네장터
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-40">
                <DropdownMenuItem asChild>
                  <Link href="/secondhand" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
                    중고거래
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sharing" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Gift className="w-4 h-4 text-red-500" />
                    나눔
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/jobs" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-teal-600" />
                    구인구직
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/group-buying" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-500" />
                    공동구매
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/local-food" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-green-500" />
                    로컬푸드
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/chuncheon" className="text-sm text-foreground hover:text-primary transition-colors font-medium flex items-center gap-1">
              <Newspaper className="w-3.5 h-3.5" />
              {plazaCityName(siteBranding.name)} 소식
            </Link>
          </nav>

          {/* Right Side - Desktop */}
          <div className="hidden xl:flex items-center gap-1">
            {/* 글쓰기 — 매물등록 포함 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-foreground hover:text-primary hover:bg-secondary">
                  <Edit3 className="w-4 h-4 mr-1" />
                  글쓰기
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link href="/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-primary" />
                    매물 등록
                  </Link>
                </DropdownMenuItem>
                {effectiveAccountType !== "agent" && (
                  <DropdownMenuItem asChild>
                    <Link href="/requests/new" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <HandHeart className="w-4 h-4 text-rose-500" />
                      구해주세요(의뢰)
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/service-requests/new" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-500" />
                    도와주세요(홈서비스)
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/board/create" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    게시판 글쓰기
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/sharing/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Gift className="w-4 h-4 text-red-500" />
                    나눔 글쓰기
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/secondhand/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
                    중고거래 글쓰기
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/jobs/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-teal-600" />
                    구인구직 글쓰기
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/clubs/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    모임 글쓰기
                  </Link>
                </DropdownMenuItem>
                {userAccountType === "interior" && (
                  <DropdownMenuItem asChild>
                    <Link href="/interior/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <Paintbrush className="w-4 h-4 text-purple-500" />
                      인테리어 글쓰기
                    </Link>
                  </DropdownMenuItem>
                )}
                {userAccountType === "moving" && (
                  <DropdownMenuItem asChild>
                    <Link href="/moving/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <Truck className="w-4 h-4 text-yellow-500" />
                      이사 글쓰기
                    </Link>
                  </DropdownMenuItem>
                )}
                {userAccountType === "cleaning" && (
                  <DropdownMenuItem asChild>
                    <Link href="/cleaning/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <SprayCan className="w-4 h-4 text-pink-500" />
                      청소 글쓰기
                    </Link>
                  </DropdownMenuItem>
                )}
                {userAccountType === "repair" && (
                  <DropdownMenuItem asChild>
                    <Link href="/repair/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-orange-500" />
                      수리 글쓰기
                    </Link>
                  </DropdownMenuItem>
                )}
                {userAccountType === "business" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/group-buying/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-blue-500" />
                        공동구매 글쓰기
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/new-store/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                        <Store className="w-4 h-4 text-amber-500" />
                        신장개업 글쓰기
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {effectiveAccountType === "producer" && (
                  <DropdownMenuItem asChild>
                    <Link href="/local-food/register" prefetch={false} className="cursor-pointer flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-green-500" />
                      로컬 푸드 등록
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 통합 검색 */}
            <Link
              href="/search"
              aria-label="통합 검색"
              className="p-2 mt-0.5 rounded-full text-foreground hover:text-primary hover:bg-secondary transition-colors"
            >
              <SearchIcon className="w-5 h-5" />
            </Link>

            {/* 알림 / 사용자 / 햄버거 — 마이페이지와 공유 */}
            <HeaderActions
              user={user ?? null}
              userRole={effectiveRole}
              userAccountType={effectiveAccountType}
            />
          </div>


          {/* Mobile Menu */}
          <div className="flex items-center gap-1 xl:hidden">
            {/* 통합 검색 */}
            <Link
              href="/search"
              aria-label="통합 검색"
              className="p-2 mt-0.5 rounded-full text-foreground hover:text-primary hover:bg-secondary transition-colors"
            >
              <SearchIcon className="w-5 h-5" />
            </Link>
            <HeaderActions
              user={user ?? null}
              userRole={effectiveRole}
              userAccountType={effectiveAccountType}
            />
          </div>
        </div>
      </div>
      <RegisterSheet
        open={registerSheetOpen}
        onClose={() => setRegisterSheetOpen(false)}
        accountType={userAccountType}
      />
    </header>

  )
}
