"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sun, AlertTriangle, Droplets, Sprout, Search, Mic } from "lucide-react"
import { useRegion } from "@/lib/region-context"

interface WeatherData {
  temp: number
  minTemp: number
  maxTemp: number
  humidity: number
  condition: string
  rainProbability: number
  windSpeed: number
}

interface FarmingTip { title: string; description: string; type: "good" | "warning" | "info" }

function generateFarmingTips(w: WeatherData): FarmingTip[] {
  const tips: FarmingTip[] = []
  if (w.minTemp <= 0) tips.push({ title: "내일 서리 주의!", description: `최저기온 ${w.minTemp}°C 예상`, type: "warning" })
  if (w.temp >= 10 && w.temp <= 22 && w.condition === "맑음") tips.push({ title: "감자 심기 좋은 날", description: `기온 ${w.temp}°C, 날씨 맑음`, type: "good" })
  if (w.temp >= 15 && w.humidity < 60 && w.condition === "맑음") tips.push({ title: "하우스 환기 좋은 날", description: "따뜻하고 건조한 날씨로 환기 적기", type: "good" })
  if (w.rainProbability >= 50) tips.push({ title: "비 예보 주의", description: `강수확률 ${w.rainProbability}%`, type: "warning" })
  if (w.windSpeed > 6) tips.push({ title: "강한 바람 주의", description: `풍속 ${w.windSpeed}m/s`, type: "warning" })
  if (tips.length === 0) tips.push({ title: "농사하기 좋은 날씨", description: "오늘도 힘내세요!", type: "info" })
  return tips
}

export function WeatherWidget() {
  const { selectedRegion } = useRegion()
  const fallback: WeatherData = { temp: 28, minTemp: 12, maxTemp: 24, humidity: 45, condition: "맑음", rainProbability: 0, windSpeed: 2 }
  const [weather, setWeather] = useState<WeatherData>(fallback)
  const [farmingTips, setFarmingTips] = useState<FarmingTip[]>(() => generateFarmingTips(fallback))
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  const handleVoiceSearch = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (SR) {
      const r = new SR()
      r.lang = "ko-KR"
      r.onresult = (ev: any) => {
        const t = ev.results[0][0].transcript
        setSearchQuery(t)
        router.push(`/search?q=${encodeURIComponent(t)}`)
      }
      r.start()
    } else {
      alert("음성 검색이 지원되지 않는 브라우저입니다.")
    }
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/weather?region=${encodeURIComponent(selectedRegion)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !d.ok) return
        // API 응답 구조: { ok, location, current:{temp,humidity,windSpeed}, forecast:[{min,max,rainProb,text}] }
        const cur = d.current ?? {}
        const today = Array.isArray(d.forecast) ? d.forecast[0] : null
        const tmrw = Array.isArray(d.forecast) ? d.forecast[1] : null
        const num = (v: any, fb: number) => (typeof v === "number" && !Number.isNaN(v) ? v : fb)
        const w: WeatherData = {
          temp: num(cur.temp, num(today?.max, fallback.temp)),
          humidity: num(cur.humidity, fallback.humidity),
          windSpeed: num(cur.windSpeed, fallback.windSpeed),
          condition: today?.text && today.text !== "-" ? today.text : fallback.condition,
          minTemp: num(tmrw?.min, num(today?.min, fallback.minTemp)),
          maxTemp: num(today?.max, fallback.maxTemp),
          rainProbability: num(today?.rainProb, fallback.rainProbability),
        }
        setWeather(w)
        setFarmingTips(generateFarmingTips(w))
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegion])

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/80 shadow-sm whitespace-nowrap">
          <Sun className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <span className="text-sm md:text-base font-semibold text-foreground">{selectedRegion}</span>
          <span className="text-base font-bold text-primary">{weather.temp}°</span>
          <span className="text-sm font-medium text-muted-foreground">{weather.condition}</span>
          <div className="flex items-center gap-1 ml-1 text-sm text-muted-foreground">
            <Droplets className="w-4 h-4" /><span>{weather.humidity}%</span>
          </div>
        </div>
        {farmingTips.slice(0, 2).map((tip, i) => {
          const isWarning = tip.type === "warning"
          const Icon = isWarning ? AlertTriangle : Sprout
          return (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-sm whitespace-nowrap ${isWarning ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm md:text-base font-semibold">{tip.title}</span>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSearch} className="mt-4 max-w-xl mx-auto">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-muted-foreground"><Search className="w-5 h-5" /></div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="무엇을 도와드릴까요?"
            className="w-full pl-12 pr-14 py-4 text-base md:text-lg rounded-full border-2 border-primary/30 bg-white shadow-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
          />
          <button type="button" onClick={handleVoiceSearch} className="absolute right-3 p-2 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors" title="음성으로 검색">
            <Mic className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">농기구, 로컬푸드, 지원금 등 원하시는 정보를 검색하세요</p>
      </form>
    </div>
  )
}
