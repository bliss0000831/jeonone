"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { createClient } from "@/lib/supabase/client"
import {
  PlusCircle,
  MessageSquare,
  Gift,
  Users,
  Leaf,
  ShoppingCart,
  Store,
  Paintbrush,
  Truck,
  SprayCan,
  Wrench,
  HelpCircle,
  X,
  Lock,
  HandHeart,
  ShoppingBag,
  Briefcase,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface RegisterSheetProps {
  open: boolean
  onClose: () => void
  /** 현재 로그인 사용자의 계정 유형 (없으면 'user' 로 취급) */
  accountType?: string | null
}

interface RegisterAction {
  href: string
  label: string
  icon: any
  iconClass: string
  bgClass: string
  /** 허용 계정 타입 (undefined = 모두 공통) */
  roles?: string[]
}

/**
 * 계정별 "무엇을 등록할까요?" 메뉴 매트릭스
 *
 * [일반 권한 5개 — 공인중개사 제외 모든 계정 공통]
 *   1. 일반 매물 등록  (개인 거주자 매물)
 *   2. 게시판 글쓰기
 *   3. 나눔 글쓰기
 *   4. 모임 글쓰기
 *   5. 신장개업 등록
 *
 * [역할 전용 대체/추가]
 *   • agent     → "일반 매물 등록" 대신 "공인중개사 매물 등록"
 *   • producer  → 위 5개 + 로컬 푸드
 *   • business  → 위 5개 + 공동구매
 *   • interior  → 위 5개 + 인테리어
 *   • moving    → 위 5개 + 이사 서비스
 *   • cleaning  → 위 5개 + 청소 서비스
 *   • repair    → 위 5개 + 수리 서비스
 *
 * 일반인(user) 에게는 정확히 일반 권한 5개만 노출.
 */
const NON_AGENT_ROLES = [
  "user",
  "producer",
  "business",
  "interior",
  "moving",
  "cleaning",
  "repair",
] as const

const REGISTER_ACTIONS: RegisterAction[] = [
  // ── 매물 등록 (계정별로 라벨/대상 분기) ─────────────────────
  {
    href: "/register",
    label: "매물 등록",
    icon: PlusCircle,
    iconClass: "text-primary",
    bgClass: "bg-primary/10",
    roles: [...NON_AGENT_ROLES], // 공인중개사 제외 전원
  },
  {
    href: "/register",
    label: "공인중개사 매물 등록",
    icon: PlusCircle,
    iconClass: "text-blue-600",
    bgClass: "bg-blue-600/10",
    roles: ["agent"],
  },
  {
    href: "/requests/new",
    label: "구해주세요(의뢰)",
    icon: HandHeart,
    iconClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
    roles: [...NON_AGENT_ROLES], // 공인중개사 제외 전원
  },
  {
    href: "/service-requests/new",
    label: "도와주세요(홈서비스)",
    icon: HelpCircle,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    // 모든 계정 가능 — roles 생략
  },

  // ── 역할 전용 플러스 카드 ─────────────────────────────
  {
    href: "/local-food/register",
    label: "로컬 푸드 등록",
    icon: Leaf,
    iconClass: "text-green-500",
    bgClass: "bg-green-500/10",
    roles: ["producer"],
  },
  {
    href: "/group-buying/register",
    label: "공동구매",
    icon: ShoppingCart,
    iconClass: "text-violet-500",
    bgClass: "bg-violet-500/10",
    roles: ["business"],
  },
  {
    href: "/interior/register",
    label: "인테리어 등록",
    icon: Paintbrush,
    iconClass: "text-purple-500",
    bgClass: "bg-purple-500/10",
    roles: ["interior"],
  },
  {
    href: "/moving/register",
    label: "이사 서비스 등록",
    icon: Truck,
    iconClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
    roles: ["moving"],
  },
  {
    href: "/cleaning/register",
    label: "청소 서비스 등록",
    icon: SprayCan,
    iconClass: "text-pink-500",
    bgClass: "bg-pink-500/10",
    roles: ["cleaning"],
  },
  {
    href: "/repair/register",
    label: "수리 서비스 등록",
    icon: Wrench,
    iconClass: "text-orange-600",
    bgClass: "bg-orange-600/10",
    roles: ["repair"],
  },

  // ── 공통 (모든 계정) ─────────────────────────────────
  {
    href: "/board/create",
    label: "게시판",
    icon: MessageSquare,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
  },
  {
    href: "/sharing/register",
    label: "나눔",
    icon: Gift,
    iconClass: "text-red-500",
    bgClass: "bg-red-500/10",
  },
  {
    href: "/secondhand/register",
    label: "중고거래",
    icon: ShoppingBag,
    iconClass: "text-amber-600",
    bgClass: "bg-amber-500/10",
  },
  {
    href: "/jobs/register",
    label: "구인구직",
    icon: Briefcase,
    iconClass: "text-teal-600",
    bgClass: "bg-teal-500/10",
  },
  {
    href: "/clubs/register",
    label: "모임",
    icon: Users,
    iconClass: "text-indigo-500",
    bgClass: "bg-indigo-500/10",
  },
  {
    href: "/new-store/register",
    label: "신장개업 등록",
    icon: Store,
    iconClass: "text-orange-500",
    bgClass: "bg-orange-500/10",
  },
]

export function RegisterSheet({ open, onClose, accountType }: RegisterSheetProps) {
  const [mounted, setMounted] = useState(false)
  // accountType prop 이 없을 때 직접 조회해서 캐싱
  const [fetchedType, setFetchedType] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  // 시트 열릴 때, props 로 계정 타입이 안 넘어오면 직접 조회
  useEffect(() => {
    if (!open) return
    if (accountType) return
    if (fetchedType) return
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setFetchedType("user")
        return
      }
      const { data } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle()
      setFetchedType(data?.account_type || "user")
    })()
  }, [open, accountType, fetchedType])

  // ESC 로 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  // 권한 필터: roles 가 명시된 항목은 해당 계정에만 노출
  // 알 수 없는 role 은 "user" 로 폴백(일반 권한 5개 노출)
  const rawRole = (accountType || fetchedType || "user").toLowerCase()
  // DB에 일반인이 "individual"로 저장된 경우가 있어 "user"로 정규화
  const normalizedRole = rawRole === "individual" ? "user" : rawRole
  const KNOWN_ROLES = new Set<string>([
    "user",
    "agent",
    ...NON_AGENT_ROLES,
  ])
  const role = KNOWN_ROLES.has(normalizedRole) ? normalizedRole : "user"
  const actions = REGISTER_ACTIONS.filter(
    (a) => !a.roles || a.roles.includes(role),
  )

  // 일반인(user) 에게만 잠긴 카드들을 함께 노출 — 클릭 시 계정 유형 신청 페이지로 유도.
  // 이미 다른 계정인 사용자에겐 잠금 카드 숨김 (유형 변경은 고객센터 문의).
  // "공인중개사 매물 등록"은 일반 "매물 등록" 과 기능상 중복이므로 잠금 카드에서도 제외.
  const lockedActions: Array<RegisterAction & { requiredRole: string; requiredRoleLabel: string }> =
    role === "user"
      ? [
          { href: "/local-food/register",    label: "로컬 푸드 등록",    icon: Leaf,         iconClass: "text-green-500",   bgClass: "bg-green-500/10",   roles: ["producer"], requiredRole: "producer", requiredRoleLabel: "생산자" },
          { href: "/group-buying/register",  label: "공동구매",           icon: ShoppingCart, iconClass: "text-violet-500",  bgClass: "bg-violet-500/10",  roles: ["business"], requiredRole: "business", requiredRoleLabel: "사장님" },
          { href: "/interior/register",      label: "인테리어 등록",     icon: Paintbrush,   iconClass: "text-purple-500",  bgClass: "bg-purple-500/10",  roles: ["interior"], requiredRole: "interior", requiredRoleLabel: "인테리어" },
          { href: "/moving/register",        label: "이사 서비스 등록",  icon: Truck,        iconClass: "text-yellow-500",  bgClass: "bg-yellow-500/10",  roles: ["moving"],   requiredRole: "moving",   requiredRoleLabel: "이사" },
          { href: "/cleaning/register",      label: "청소 서비스 등록",  icon: SprayCan,     iconClass: "text-pink-500",    bgClass: "bg-pink-500/10",    roles: ["cleaning"], requiredRole: "cleaning", requiredRoleLabel: "청소" },
          { href: "/repair/register",        label: "수리 서비스 등록",  icon: Wrench,       iconClass: "text-orange-600",  bgClass: "bg-orange-600/10",  roles: ["repair"],   requiredRole: "repair",   requiredRoleLabel: "수리" },
        ]
      : []

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" />
      <div
        className="relative w-full sm:w-auto sm:min-w-[360px] max-w-md mx-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">무엇을 등록할까요?</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const ActionIcon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                onClick={onClose}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border/60 hover:bg-muted/60 active:scale-[0.98] transition-all"
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", a.bgClass)}>
                  <ActionIcon className={cn("w-5 h-5", a.iconClass)} />
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            )
          })}
        </div>

        {/* 잠긴 카테고리 — 한 줄 CTA 로 슬쩍 안내 (일반인 전용) */}
        {lockedActions.length > 0 && (
          <Link
            href="/mypage/account-upgrade"
            onClick={onClose}
            className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-border/70 hover:border-primary/40 hover:bg-muted/40 transition-colors"
          >
            {/* 아이콘 스택 (살짝 보여주기만) */}
            <div className="flex -space-x-1.5 flex-shrink-0">
              {lockedActions.slice(0, 4).map((a) => {
                const ActionIcon = a.icon
                return (
                  <div
                    key={a.href}
                    className={cn(
                      "w-6 h-6 rounded-full ring-2 ring-card flex items-center justify-center",
                      a.bgClass,
                    )}
                  >
                    <ActionIcon className={cn("w-3 h-3", a.iconClass)} />
                  </div>
                )
              })}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground/80 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                전문가 · 사업자 계정 전환 시 더 많은 등록 가능
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                로컬푸드 · 공동구매 · 인테리어 · 이사 · 청소 · 수리
              </p>
            </div>
            <span className="text-xs font-medium text-primary flex-shrink-0">신청 →</span>
          </Link>
        )}
      </div>
    </div>,
    document.body,
  )
}
