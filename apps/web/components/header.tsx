"use client"

import Link from "next/link"
import { PlusCircle, User, Menu, LogOut, Moon, Sun, HelpCircle, FileText, Shield, Settings, Megaphone, Paintbrush, Truck, SprayCan, Wrench, Mail, Edit3, Store, ShoppingCart, Gift, Home as HomeIcon, Building, ChevronDown, Leaf, Users, MessageSquare, Utensils, Lightbulb, Camera, Newspaper, MapPin, Search as SearchIcon, Briefcase, UserCircle2, HandHeart, Sparkles, ShoppingBag, Coins, Heart, Tractor, Gavel } from "lucide-react"
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
import { MobileNavDrawer } from "@/components/mobile-nav-drawer"
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
          {/* 홈 링크(광장명) + 위치칩 좌측 */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Link
              href="/"
              aria-label="홈으로"
              className="flex-shrink-0 font-extrabold text-primary text-sm sm:text-base whitespace-nowrap hover:opacity-80 transition-opacity"
            >
              {siteBranding.name}
            </Link>
            <div className="flex-shrink-0">
              <LocationSelector
                location={location ?? null}
                onLocationChange={handleLocationChange}
              />
            </div>
          </div>

          {/* Navigation - Desktop (전원일기) */}
          <nav className="hidden xl:flex items-center gap-6">
            <Link href="/secondhand" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Tractor className="w-4 h-4 text-primary" />농기구/자재
            </Link>
            <Link href="/local-food" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Leaf className="w-4 h-4 text-primary" />로컬푸드
            </Link>
            <Link href="/auction" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Gavel className="w-4 h-4 text-primary" />경매장
            </Link>
            <Link href="/rental" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-primary" />대여
            </Link>
            <Link href="/jobs" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" />일손
            </Link>
            <Link href="/board" className="text-sm text-foreground hover:text-primary transition-colors font-bold flex items-center gap-1.5">
              <Newspaper className="w-4 h-4 text-primary" />전원 소식통
            </Link>
          </nav>

          {/* Right Side - Desktop */}
          <div className="hidden xl:flex items-center gap-1">
            {/* 글쓰기 — 매물등록 포함 */}
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground hover:text-primary hover:bg-secondary"
              onClick={() => setRegisterSheetOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-1" />
              글쓰기
            </Button>

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
            <MobileNavDrawer
              user={user ? { id: user.id } : null}
              plazaName={siteBranding.name}
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
