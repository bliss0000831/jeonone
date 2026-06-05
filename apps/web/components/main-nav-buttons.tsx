"use client"

import { Tractor, Carrot, Users, Gavel, Phone, Camera, Mic, Megaphone, Cloud, Sprout, HandCoins } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

// href 는 우리(광장) 라우트로 매핑
const mainMenus = [
  { id: "marketplace", title: "농기구/자재", subtitle: "사고팔기", description: "트랙터, 경운기, 하우스 자재 등", icon: Tractor, variant: "dark" as const, href: "/secondhand", bgImage: "/images/card-farm-equipment.jpg" },
  { id: "localfood", title: "강원 로컬푸드", subtitle: "직거래 장터", description: "방금 수확한 신선한 농산물", icon: Carrot, variant: "light" as const, href: "/local-food", bgImage: "/images/card-local-food.jpg" },
  { id: "auction", title: "만물 경매장", subtitle: "경매 / 즉시 거래", description: "농산물·농기구 경매 거래소", icon: Gavel, variant: "dark" as const, href: "/auction", bgImage: "/images/card-auction.jpg" },
  { id: "labor", title: "일손 찾기", subtitle: "품앗이 / 인력", description: "구인·구직, 품앗이 게시판", icon: Users, variant: "dark" as const, href: "/jobs", bgImage: "/images/card-workers.jpg" },
]

const newsBannerItems = [
  { icon: Megaphone, label: "지역 공지", desc: "마을 게시판에서 확인" },
  { icon: Cloud, label: "오늘 날씨", desc: "홈 상단에서 확인" },
  { icon: Sprout, label: "농사 달력", desc: "제철 작물 정보" },
  { icon: HandCoins, label: "지원금 정보", desc: "농업 지원 안내" },
]

export function MainNavButtons() {
  return (
    <section className="py-10 md:py-14 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 빠른 기능 버튼들 */}
        <div className="mb-10 md:mb-14 grid grid-cols-3 gap-2 md:gap-6">
          <Link href="/secondhand/register" className="flex flex-col items-center gap-2 p-3 md:p-6 bg-white/90 backdrop-blur rounded-2xl border-2 border-primary/20 hover:bg-white hover:border-primary/40 transition-colors shadow-lg">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0"><Camera className="w-6 h-6 md:w-10 md:h-10 text-primary" /></div>
            <span className="text-sm md:text-xl font-bold text-foreground text-center leading-tight">사진으로<br className="md:hidden" /> 올리기</span>
          </Link>
          <Link href="/search" className="flex flex-col items-center gap-2 p-3 md:p-6 bg-white/90 backdrop-blur rounded-2xl border-2 border-primary/20 hover:bg-white hover:border-primary/40 transition-colors shadow-lg">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0"><Mic className="w-6 h-6 md:w-10 md:h-10 text-primary" /></div>
            <span className="text-sm md:text-xl font-bold text-foreground text-center leading-tight">음성으로<br className="md:hidden" /> 검색</span>
          </Link>
          <Link href="/support" className="flex flex-col items-center gap-2 p-3 md:p-6 bg-white/90 backdrop-blur rounded-2xl border-2 border-secondary/20 hover:bg-white hover:border-secondary/40 transition-colors shadow-lg">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0"><Phone className="w-6 h-6 md:w-10 md:h-10 text-secondary" /></div>
            <span className="text-sm md:text-xl font-bold text-foreground text-center leading-tight">고객<br className="md:hidden" /> 문의</span>
          </Link>
        </div>

        {/* 핵심 메뉴 4개 — 2열 (절반 크기) */}
        <div className="grid grid-cols-2 gap-3 md:gap-6">
          {mainMenus.map((menu) => {
            const IconComponent = menu.icon
            const isDark = menu.variant === "dark"
            return (
              <Link key={menu.id} href={menu.href} className="relative overflow-hidden cursor-pointer transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] rounded-2xl md:rounded-3xl shadow-lg min-h-[180px] md:min-h-[260px] flex flex-col items-center justify-center text-center group">
                <Image src={menu.bgImage} alt={menu.title} fill className="object-cover" />
                <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-b from-black/50 to-black/75" : "bg-gradient-to-b from-white/50 to-black/40"}`} />
                <div className="relative z-10 p-4 md:p-8 flex flex-col items-center justify-center flex-1">
                  <div className={`w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-2.5 md:mb-4 ${isDark ? "bg-neutral-700/80" : "bg-neutral-300/80"} shadow-lg`}>
                    <IconComponent className={`w-7 h-7 md:w-10 md:h-10 ${isDark ? "text-white" : "text-neutral-600"}`} />
                  </div>
                  <h2 className="text-lg md:text-2xl font-black mb-0.5 drop-shadow-lg text-white">{menu.title}</h2>
                  <p className="text-sm md:text-xl font-bold mb-1 md:mb-2 drop-shadow-lg text-neutral-100">{menu.subtitle}</p>
                  <p className="hidden md:block text-base drop-shadow-lg text-neutral-200">{menu.description}</p>
                </div>
                <div className="relative z-10 pb-4 md:pb-7">
                  <div className="flex items-center gap-1 px-4 py-2 md:px-7 md:py-3.5 bg-white rounded-full font-bold text-sm md:text-lg text-primary shadow-lg border-2 border-primary/30 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">보러가기<span className="text-base md:text-xl ml-1">→</span></div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* 전원 소식통 배너 */}
        <div className="mt-5 md:mt-8">
          <Link href="/board" className="block relative overflow-hidden rounded-3xl shadow-xl group cursor-pointer">
            <Image src="/images/banner-news.jpg" alt="전원 소식통" width={1200} height={280} className="w-full h-44 md:h-56 object-cover group-hover:scale-[1.02] transition-transform duration-300" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20" />
            <div className="absolute inset-0 flex items-center px-6 md:px-10 gap-6 md:gap-10">
              <div className="flex-shrink-0">
                <p className="text-white/80 text-sm md:text-base font-semibold mb-1">마을 커뮤니티</p>
                <h2 className="text-white text-3xl md:text-4xl font-black drop-shadow-lg mb-2">전원 소식통</h2>
                <div className="flex items-center gap-1 px-5 py-2 bg-white/90 rounded-full font-bold text-sm md:text-base text-primary w-fit group-hover:bg-primary group-hover:text-white transition-all shadow-lg">보러가기 →</div>
              </div>
              <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 flex-1">
                {newsBannerItems.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div key={i} className="bg-white/15 backdrop-blur border border-white/30 rounded-2xl p-3 md:p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4 text-yellow-300 flex-shrink-0" /><span className="text-yellow-300 text-xs font-bold">{item.label}</span></div>
                      <p className="text-white text-xs md:text-sm font-semibold leading-snug">{item.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  )
}
