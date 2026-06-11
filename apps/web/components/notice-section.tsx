"use client"

import Link from "next/link"
import { Megaphone, Sprout } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRegion } from "@/lib/region-context"
import type { NoticeItem } from "@/components/farm-home"

const farmTips = [
  { id: 1, title: "흙 살리기", description: "퇴비와 유기물을 꾸준히 넣어 땅심을 키워 주세요." },
  { id: 2, title: "물 주기", description: "한낮은 피하고 아침이나 해질녘에 충분히 주는 게 좋아요." },
  { id: 3, title: "병해충 살피기", description: "잎의 앞뒤를 자주 들여다보면 일찍 발견할 수 있어요." },
]

export function NoticeSection({ notices = [] }: { notices?: NoticeItem[] }) {
  const { selectedRegion } = useRegion()

  // 내 시군 공지 + 전체(도 전역) 공지만 표시, 내 시군 공지를 먼저
  const visible = notices
    .filter((n) => !n.region || !selectedRegion || n.region === selectedRegion)
    .sort((a, b) => {
      const am = a.region && a.region === selectedRegion ? 0 : 1
      const bm = b.region && b.region === selectedRegion ? 0 : 1
      return am - bm
    })
    .slice(0, 5)

  return (
    <section className="py-8 px-4 bg-muted/50 overflow-hidden">
      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4 md:gap-6">
        <Card className="border-2 border-primary/20 shadow-md overflow-hidden">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="flex items-center gap-2 md:gap-3 text-lg md:text-2xl font-black text-foreground">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Megaphone className="w-4 h-4 md:w-6 md:h-6 text-primary" /></div>
              <span className="truncate">{selectedRegion} 공지사항</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 md:space-y-3 px-4 md:px-6">
            {visible.length === 0 ? (
              <div className="py-6 text-center text-sm md:text-lg text-muted-foreground">아직 등록된 공지가 없어요.</div>
            ) : (
              visible.map((notice) => (
                <Link
                  key={notice.id}
                  href="/notice"
                  className="flex items-start gap-2 md:gap-3 p-2 md:p-3 rounded-xl bg-background hover:bg-primary/5 cursor-pointer transition-colors"
                >
                  {notice.category && (
                    <Badge variant="secondary" className="text-xs md:text-sm font-bold shrink-0">{notice.category}</Badge>
                  )}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-sm md:text-lg font-semibold text-foreground truncate">{notice.title}</p>
                    {notice.created_at && (
                      <p className="text-xs md:text-base text-muted-foreground">{new Date(notice.created_at).toLocaleDateString("ko-KR")}</p>
                    )}
                  </div>
                  {notice.is_new && <Badge variant="destructive" className="shrink-0 text-xs">NEW</Badge>}
                </Link>
              ))
            )}
            <Link href="/notice" className="block w-full py-2 md:py-3 text-center text-base md:text-lg font-bold text-primary hover:underline">더보기 →</Link>
          </CardContent>
        </Card>

        <Card className="border-2 border-secondary/20 shadow-md overflow-hidden">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="flex items-center gap-2 md:gap-3 text-lg md:text-2xl font-black text-foreground">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0"><Sprout className="w-4 h-4 md:w-6 md:h-6 text-secondary" /></div>
              <span className="truncate">농사 꿀팁</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 px-4 md:px-6">
            {farmTips.map((item) => (
              <div key={item.id} className="p-3 md:p-4 rounded-xl bg-secondary/5">
                <div className="flex items-center gap-2 mb-1 md:mb-2"><Sprout className="w-4 h-4 md:w-5 md:h-5 text-secondary flex-shrink-0" /><p className="text-sm md:text-lg font-bold text-secondary truncate">{item.title}</p></div>
                <p className="text-xs md:text-base text-foreground line-clamp-2">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
