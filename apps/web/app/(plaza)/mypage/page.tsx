"use client"

/**
 * 마이페이지 대시보드 — 앱(RN) MY 탭과 동일 구성.
 *   녹색 프로필 헤더 + 서비스 그리드 + 나의 거래 + 나의 관심 + 고객지원 + 로그아웃
 *   전체 프로필(글/찜)은 /mypage/profile (ProfileShell)
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { getProfileCard, getPointBalance, type ProfileCardData } from "@gwangjang/features/profile"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import {
  User, Settings, ChevronRight, Leaf, LogOut, Megaphone, HelpCircle, Mail,
  Coins, FileText, Shield, Tractor, Gavel, Truck, Users, Newspaper, Gift,
  ShoppingBag, Receipt, ShoppingCart, Wallet, Heart, Diamond,
} from "lucide-react"

const SERVICES = [
  { label: "농기구/자재", icon: Tractor, href: "/secondhand" },
  { label: "로컬푸드", icon: Leaf, href: "/local-food" },
  { label: "경매장", icon: Gavel, href: "/auction" },
  { label: "농기구 대여", icon: Truck, href: "/rental" },
  { label: "일손찾기", icon: Users, href: "/jobs" },
  { label: "마을소식", icon: Newspaper, href: "/board" },
  { label: "무료나눔", icon: Gift, href: "/sharing" },
]

const TX_MENU = [
  { label: "내 거래", icon: Tractor, href: "/mypage/trades" },
  { label: "판매 내역", icon: Receipt, href: "/mypage/sales" },
  { label: "구매 내역", icon: ShoppingCart, href: "/mypage/orders" },
  { label: "포인트 내역", icon: Wallet, href: "/mypage/points" },
]

const SUPPORT_MENU = [
  { label: "공지사항", icon: Megaphone, href: "/notice" },
  { label: "자주 묻는 질문", icon: HelpCircle, href: "/faq" },
  { label: "고객센터", icon: Mail, href: "/support" },
  { label: "포인트 제도", icon: Coins, href: "/points-guide" },
  { label: "이용약관", icon: FileText, href: "/terms" },
  { label: "개인정보처리방침", icon: Shield, href: "/privacy" },
]

export default function MyPageDashboard() {
  const router = useRouter()
  const { name: plazaName } = useSiteBranding()
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [card, setCard] = useState<ProfileCardData | null>(null)
  const [points, setPoints] = useState<number>(0)

  useEffect(() => {
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login?redirect=/mypage")
        return
      }
      setUserId(user.id)
      setChecking(false)
      try {
        const [c, p] = await Promise.all([
          getProfileCard(supabase, user.id, plaza ?? undefined),
          getPointBalance(supabase, user.id, plaza ?? undefined),
        ])
        setCard(c)
        setPoints(p ?? 0)
      } catch { /* noop */ }
    })
  }, [router])

  if (checking || !userId) {
    return (
      <div className="min-h-screen bg-[#f7f6f0] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const nickname = card?.nickname || "농부"
  const avatar = card?.avatar_url || null
  const trustScore = card?.trustScore ?? null

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f6f0] pb-20 md:pb-0">
      <Header />

      {/* 녹색 프로필 헤더 */}
      <div className="bg-primary px-4 pt-6 pb-10">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/mypage/profile" className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/20 border-2 border-white/35 flex items-center justify-center flex-shrink-0">
              {avatar ? (
                <Image src={avatar} alt="" width={64} height={64} className="w-full h-full object-cover" />
              ) : (
                <User className="w-9 h-9 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-white truncate">{nickname}님</h1>
              <p className="text-sm text-white/80 mt-0.5">{plazaName} 회원</p>
              {typeof trustScore === "number" && (
                <span className="inline-flex items-center gap-1 mt-1.5 bg-white/20 rounded-full px-2.5 py-0.5">
                  <Leaf className="w-3 h-3 text-white" />
                  <span className="text-[11px] font-bold text-white">신뢰도 {trustScore}</span>
                </span>
              )}
            </div>
          </Link>
          <Link href="/mypage/settings" className="p-2 rounded-full hover:bg-white/15 transition-colors" aria-label="설정">
            <Settings className="w-6 h-6 text-white" />
          </Link>
        </div>
      </div>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 -mt-4 space-y-3 pb-8">
        {/* 포인트 카드 */}
        <Link href="/mypage/points" className="flex items-center justify-between bg-card rounded-2xl shadow-sm border border-border px-5 py-4 hover:bg-muted/40 transition-colors">
          <span className="inline-flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center"><Diamond className="w-3.5 h-3.5 text-white" /></span>
            <span className="text-xl font-black text-foreground">{points.toLocaleString()}<span className="text-sm font-bold text-muted-foreground"> P</span></span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">적립·사용 내역<ChevronRight className="w-4 h-4" /></span>
        </Link>

        {/* 서비스 그리드 */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-4">
          <h2 className="text-base font-black text-foreground mb-3">서비스</h2>
          <div className="grid grid-cols-4 gap-y-4">
            {SERVICES.map((s) => {
              const Icon = s.icon
              return (
                <Link key={s.label} href={s.href} className="flex flex-col items-center gap-1.5">
                  <span className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><Icon className="w-6 h-6 text-primary" /></span>
                  <span className="text-xs font-semibold text-foreground text-center">{s.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* 내가 올린 글 / 나의 거래 */}
        <MenuCard title="나의 거래" items={TX_MENU} />

        {/* 나의 관심 */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <h2 className="text-base font-black text-foreground px-5 pt-4 pb-1">나의 관심</h2>
          <Link href="/mypage/profile?tab=saved" className="flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors border-t border-border">
            <Heart className="w-5 h-5 text-primary" />
            <span className="flex-1 font-medium text-foreground">관심목록 (찜)</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link href="/mypage/profile" className="flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors border-t border-border">
            <FileText className="w-5 h-5 text-primary" />
            <span className="flex-1 font-medium text-foreground">내 글 / 프로필 보기</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>

        {/* 고객지원 */}
        <MenuCard title="고객지원" items={SUPPORT_MENU} />

        {/* 로그아웃 */}
        <button
          onClick={async () => {
            if (!window.confirm("정말 로그아웃 하시겠어요?")) return
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push("/")
            router.refresh()
          }}
          className="w-full flex items-center justify-center gap-2 bg-card border border-border rounded-2xl py-4 text-muted-foreground font-bold hover:bg-muted/40 transition-colors"
        >
          <LogOut className="w-5 h-5" /> 로그아웃
        </button>
      </main>

      <BottomNav />
    </div>
  )
}

function MenuCard({ title, items }: { title: string; items: { label: string; icon: any; href: string }[] }) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      <h2 className="text-base font-black text-foreground px-5 pt-4 pb-1">{title}</h2>
      {items.map((m) => {
        const Icon = m.icon
        return (
          <Link key={m.label} href={m.href} className="flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors border-t border-border">
            <Icon className="w-5 h-5 text-foreground" />
            <span className="flex-1 font-medium text-foreground">{m.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        )
      })}
    </div>
  )
}
