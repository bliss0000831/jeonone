"use client"

import Link from "next/link"
import { Megaphone, BookOpen, Sprout, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRegion } from "@/lib/region-context"

const noticesByRegion: Record<string, Array<{ id: number; type: string; title: string; date: string; isNew: boolean }>> = {
  "홍천군": [
    { id: 1, type: "공지", title: "홍천군 농업인 수당 신청 안내", date: "2026.04.15", isNew: true },
    { id: 2, type: "지원금", title: "홍천군 친환경농업 직접지불금 신청", date: "2026.04.14", isNew: true },
    { id: 3, type: "교육", title: "홍천 스마트팜 교육 수강생 모집", date: "2026.04.12", isNew: false },
  ],
  "춘천시": [
    { id: 1, type: "공지", title: "춘천시 농기계 임대사업소 운영 안내", date: "2026.04.15", isNew: true },
    { id: 2, type: "지원금", title: "춘천시 청년농업인 정착지원금 신청", date: "2026.04.14", isNew: true },
    { id: 3, type: "교육", title: "춘천 도시농업 교육 프로그램", date: "2026.04.11", isNew: false },
  ],
  "원주시": [
    { id: 1, type: "공지", title: "원주시 로컬푸드 직매장 입점 안내", date: "2026.04.15", isNew: true },
    { id: 2, type: "지원금", title: "원주시 농업인 면세유 신청 기간", date: "2026.04.13", isNew: true },
    { id: 3, type: "교육", title: "원주 유기농 인증 교육 안내", date: "2026.04.10", isNew: false },
  ],
  "강릉시": [
    { id: 1, type: "공지", title: "강릉시 해양수산 축제 참가 농가 모집", date: "2026.04.15", isNew: true },
    { id: 2, type: "지원금", title: "강릉시 농어촌민박 지원사업 신청", date: "2026.04.14", isNew: true },
    { id: 3, type: "교육", title: "강릉 커피농장 체험 프로그램", date: "2026.04.12", isNew: false },
  ],
}

const farmDiary = [
  { id: 1, icon: Sprout, title: "감자 심기 적기", description: "이번 주가 감자 파종 최적기입니다. 토양 온도 10도 이상 확인하세요." },
  { id: 2, icon: Calendar, title: "4월 농사 일정", description: "고추 모종 정식, 마늘 웃거름, 사과나무 적과 작업" },
  { id: 3, icon: BookOpen, title: "이번 달 교육", description: "4/20 스마트팜 기초반, 4/25 친환경 인증 교육" },
]

export function NoticeSection() {
  const { selectedRegion } = useRegion()
  const notices = noticesByRegion[selectedRegion] || noticesByRegion["홍천군"]

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
            {notices.map((notice) => (
              <div key={notice.id} className="flex items-start gap-2 md:gap-3 p-2 md:p-3 rounded-xl bg-background hover:bg-primary/5 cursor-pointer transition-colors">
                <Badge variant={notice.type === "공지" ? "default" : "secondary"} className="text-xs md:text-sm font-bold shrink-0">{notice.type}</Badge>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm md:text-lg font-semibold text-foreground truncate">{notice.title}</p>
                  <p className="text-xs md:text-base text-muted-foreground">{notice.date}</p>
                </div>
                {notice.isNew && <Badge variant="destructive" className="shrink-0 text-xs">NEW</Badge>}
              </div>
            ))}
            <Link href="/notice" className="block w-full py-2 md:py-3 text-center text-base md:text-lg font-bold text-primary hover:underline">더보기 →</Link>
          </CardContent>
        </Card>

        <Card className="border-2 border-secondary/20 shadow-md overflow-hidden">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="flex items-center gap-2 md:gap-3 text-lg md:text-2xl font-black text-foreground">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0"><Sprout className="w-4 h-4 md:w-6 md:h-6 text-secondary" /></div>
              <span className="truncate">오늘의 농사 일지</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 px-4 md:px-6">
            {farmDiary.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.id} className="p-3 md:p-4 rounded-xl bg-secondary/5 hover:bg-secondary/10 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2 mb-1 md:mb-2"><Icon className="w-4 h-4 md:w-5 md:h-5 text-secondary flex-shrink-0" /><p className="text-sm md:text-lg font-bold text-secondary truncate">{item.title}</p></div>
                  <p className="text-xs md:text-base text-foreground line-clamp-2">{item.description}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
