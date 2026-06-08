"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import type { User } from "@supabase/supabase-js"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { WeatherWidget } from "@/components/weather-widget"
import { BoardNavButtons } from "@/components/board-nav-buttons"
import { MainNavButtons } from "@/components/main-nav-buttons"
import { NoticeSection } from "@/components/notice-section"
import { RegionProvider } from "@/lib/region-context"
import { UserLocation } from "@/components/location-selector"

export interface NoticeItem {
  id: string
  title: string
  category?: string | null
  created_at?: string | null
  is_new?: boolean
}

interface FarmHomeProps {
  user: User | null
  userRole?: string | null
  userAccountType?: string | null
  plazaName: string
  plazaCity: string
  notices?: NoticeItem[]
}

const LOCATION_STORAGE_KEY = "user-location"

export function FarmHome({ user, userRole, userAccountType, plazaName, notices = [] }: FarmHomeProps) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
      if (saved) setUserLocation(JSON.parse(saved))
    } catch {}
  }, [])

  const handleLocationChange = (loc: UserLocation) => {
    setUserLocation(loc)
    try { localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc)) } catch {}
  }

  return (
    <RegionProvider defaultRegion="홍천군">
      <div className="min-h-screen flex flex-col pb-20 md:pb-0">
        <Header
          user={user}
          location={userLocation}
          onLocationChange={handleLocationChange}
          userRole={userRole}
          userAccountType={userAccountType}
        />

        <main className="relative flex-1 flex flex-col overflow-hidden">
          {/* 강원 풍경 배경 */}
          <div className="pointer-events-none select-none absolute inset-0 z-0" aria-hidden>
            <Image src="/images/gangwon-bg.jpg" alt="" fill className="object-cover opacity-20" priority />
          </div>

          {/* 히어로 */}
          <section className="relative z-10 pt-6 pb-4 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 mb-6">
                <Image src="/images/logo-farmer.png" alt={`${plazaName} 로고`} width={136} height={136} className="flex-shrink-0 rounded-full object-cover" priority />
                <div className="text-center md:text-left">
                  <h1 className="text-3xl md:text-5xl font-black text-primary mb-2">{plazaName}</h1>
                  <p className="text-lg md:text-xl text-secondary font-bold">강원도 농업인을 위한 따뜻한 마을 장터</p>
                </div>
              </div>

              <div className="mb-8"><WeatherWidget /></div>
            </div>
          </section>

          {/* 농기구·로컬푸드·경매·일손 (소통과 나눔 위) */}
          <div className="relative z-10"><MainNavButtons /></div>
          {/* 소통과 나눔 · 정보와 혜택 */}
          <div className="relative z-10 max-w-4xl mx-auto w-full px-4 mb-8"><BoardNavButtons /></div>
          <div className="relative z-10"><NoticeSection notices={notices} /></div>
        </main>

        <BottomNav />
      </div>
    </RegionProvider>
  )
}
