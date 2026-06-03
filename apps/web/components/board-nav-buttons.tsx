"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageSquare, Lightbulb, HelpCircle, Gift, Camera, Coins } from "lucide-react"
import { cn } from "@/lib/utils"

// 소통과 나눔 / 정보와 혜택 — href 는 우리 라우트로 매핑
const boardsRow1 = [
  { id: "free", label: "자유게시판", icon: MessageSquare, href: "/board/c/free" },
  { id: "daily", label: "일상 공유", icon: Camera, href: "/board/c/daily" },
  { id: "share", label: "무료 나눔", icon: Gift, href: "/board/c/share" },
]
const boardsRow2 = [
  { id: "life", label: "생활 정보", icon: Lightbulb, href: "/board/c/life" },
  { id: "subsidy", label: "정부 지원금", icon: Coins, href: "/board/c/subsidy" },
  { id: "qna", label: "질문 답변", icon: HelpCircle, href: "/board/c/qna" },
]

export function BoardNavButtons() {
  const pathname = usePathname()

  const renderBoardButton = (board: (typeof boardsRow1)[0]) => {
    const Icon = board.icon
    const isActive = pathname?.startsWith(board.href)
    return (
      <Link key={board.id} href={board.href}>
        <div className={cn(
          "rounded-2xl px-3 py-4 md:px-4 md:py-5 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 shadow-md cursor-pointer min-h-[90px] md:min-h-[100px]",
          isActive ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}>
          <Icon className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0" />
          <span className="text-sm sm:text-base md:text-lg font-bold text-center leading-tight">{board.label}</span>
        </div>
      </Link>
    )
  }

  return (
    <section className="py-2">
      <div className="space-y-5">
        <div>
          <div className="text-center mb-3"><span className="text-base md:text-lg font-bold text-foreground">소통과 나눔</span></div>
          <div className="grid grid-cols-3 gap-2 md:gap-3">{boardsRow1.map(renderBoardButton)}</div>
        </div>
        <div>
          <div className="text-center mb-3"><span className="text-base md:text-lg font-bold text-foreground">정보와 혜택</span></div>
          <div className="grid grid-cols-3 gap-2 md:gap-3">{boardsRow2.map(renderBoardButton)}</div>
        </div>
      </div>
    </section>
  )
}
