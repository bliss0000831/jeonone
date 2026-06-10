"use client"

/**
 * 모바일 햄버거 드로어 — 앱(RN HamburgerMenu) 과 동일한 전원일기 디자인.
 *   녹색 헤더 + 메인 6메뉴 + 커뮤니티 + 로그인/마이페이지+로그아웃
 */

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import {
  Menu, Home, Tractor, Leaf, Gavel, Truck, Users, Newspaper, User, LogOut,
} from "lucide-react"

const MAIN = [
  { icon: Home, label: "홈으로", href: "/" },
  { icon: Tractor, label: "농기구/자재 사고팔기", href: "/secondhand" },
  { icon: Truck, label: "농기구 대여", href: "/rental" },
  { icon: Leaf, label: "강원 로컬푸드", href: "/local-food" },
  { icon: Gavel, label: "만물 경매장", href: "/auction" },
  { icon: Users, label: "일손 찾기", href: "/jobs" },
  { icon: Newspaper, label: "전원 소식통", href: "/board" },
]

const COMMUNITY = [
  { label: "마을 사랑방", href: "/board/c/free" },
  { label: "무료 나눔", href: "/board/c/share" },
  { label: "농업 일기", href: "/board/c/daily" },
  { label: "정부지원금", href: "/board/c/subsidy" },
  { label: "살림 정보", href: "/board/c/life" },
  { label: "궁금해요", href: "/board/c/qna" },
]

export function MobileNavDrawer({
  user,
  plazaName,
  region,
}: {
  user: { id: string } | null
  plazaName: string
  region?: string | null
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="전체 메뉴">
          <Menu className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 max-w-[85vw] p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">메뉴</SheetTitle>
        <div className="flex flex-col h-full bg-[#f7f6f0]">
          {/* 녹색 헤더 */}
          <div className="p-6 bg-primary text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-white/40">
                <Image src="/images/logo-farmer.png" alt="" fill className="object-cover" />
              </div>
              <div>
                <h2 className="text-xl font-black">{plazaName}</h2>
                {region ? <p className="text-sm opacity-80">{region}</p> : null}
              </div>
            </div>
          </div>

          {/* 메인 + 커뮤니티 */}
          <div className="flex-1 overflow-y-auto py-3">
            {MAIN.map((m) => {
              const Icon = m.icon
              return (
                <Link key={m.label} href={m.href} onClick={() => setOpen(false)}>
                  <div className="flex items-center gap-4 px-4 py-2.5 mx-2 rounded-xl hover:bg-primary/10 transition-colors">
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-lg font-bold text-foreground">{m.label}</span>
                  </div>
                </Link>
              )
            })}

            <div className="border-t border-border my-3 mx-4" />
            <p className="px-6 py-2 text-sm font-bold text-muted-foreground tracking-wide">커뮤니티</p>
            {COMMUNITY.map((c) => (
              <Link key={c.label} href={c.href} onClick={() => setOpen(false)}>
                <div className="px-6 py-2.5 hover:bg-primary/5 border-l-2 border-transparent hover:border-primary/50 transition-colors">
                  <span className="text-base font-medium text-foreground/70">{c.label}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* 하단 로그인 / 마이페이지 */}
          <div className="px-4 py-4 border-t border-border bg-card space-y-2.5">
            {user ? (
              <>
                <Link href="/mypage" onClick={() => setOpen(false)}>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-xl hover:bg-primary/10 transition-colors">
                    <User className="w-6 h-6 text-primary" />
                    <span className="font-bold">마이페이지</span>
                  </div>
                </Link>
                <Button variant="outline" className="w-full h-12 font-bold text-destructive border-destructive/30" onClick={handleLogout}>
                  <LogOut className="w-5 h-5 mr-2" />로그아웃
                </Button>
              </>
            ) : (
              <Link href="/auth/login" onClick={() => setOpen(false)}>
                <Button className="w-full h-12 text-base font-bold">
                  <User className="w-5 h-5 mr-2" />로그인 / 회원가입
                </Button>
              </Link>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
