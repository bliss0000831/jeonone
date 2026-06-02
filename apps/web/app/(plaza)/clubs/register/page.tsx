"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Loader2, Users } from "lucide-react"
import { RegionFormField } from "@/components/region-form-field"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { toast } from "sonner"

const CATEGORIES = ["러닝", "배드민턴", "축구", "농구", "테니스", "등산", "수영", "자전거", "요가", "기타"]
const SKILL_LEVELS = ["누구나", "초급", "중급", "고급"]

export default function ClubsRegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [consented, setConsented] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [authLoading, setAuthLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("러닝")
  const [sportType, setSportType] = useState("러닝")
  const [location, setLocation] = useState("")
  const [meetingDate, setMeetingDate] = useState("")
  const [meetingTime, setMeetingTime] = useState("")
  const [maxMembers, setMaxMembers] = useState(10)
  const [skillLevel, setSkillLevel] = useState("누구나")
  const [subRegion, setSubRegion] = useState("")

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        toast("로그인이 필요합니다")
        router.push("/auth/login?redirect=/clubs/register")
      }
      setAuthLoading(false)
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return // 더블서밋 방지 — 중복 모임 생성 차단
    if (!title.trim()) { toast("제목을 입력해주세요"); return }

    setLoading(true)
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          content: content.trim() || null,
          category,
          sport_type: sportType,
          location: location.trim() || null,
          meeting_date: meetingDate || null,
          meeting_time: meetingTime || null,
          max_members: maxMembers,
          skill_level: skillLevel,
          sub_region: subRegion || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "등록 실패"); return }
      toast.success("등록되었습니다")
      setFormDirty(false)
      router.push(`/clubs/${data.post.id}`)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-10">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          뒤로가기
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">모임 만들기</h1>
            <p className="text-xs text-muted-foreground">함께할 이웃을 모집해보세요</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">제목 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="모임 제목을 입력하세요"
              maxLength={60}
              required
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{title.length}/60</p>
          </div>

          {/* Category / Sport type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">종목 *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setCategory(cat); setSportType(cat) }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Skill level */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">실력 수준</label>
            <div className="flex gap-2">
              {SKILL_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSkillLevel(level)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    skillLevel === level
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">한줄 소개</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="모임을 한 줄로 소개해주세요"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{description.length}/100</p>
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">상세 내용</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="모임에 대해 자세히 소개해주세요&#10;- 어떤 활동을 하나요?&#10;- 준비물이 있나요?&#10;- 참여 방법은?"
              maxLength={3000}
              rows={6}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{content.length}/3000</p>
          </div>

          {/* Region (sub_region) — 자동 태깅 */}
          <RegionFormField value={subRegion} onChange={setSubRegion} />

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">장소</label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 춘천 공지천 공원"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">날짜</label>
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">시간</label>
              <Input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
              />
            </div>
          </div>

          {/* Max members */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">최대 인원</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMaxMembers((n) => Math.max(2, n - 1))}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors font-bold"
              >
                -
              </button>
              <span className="text-lg font-bold text-foreground w-12 text-center">{maxMembers}명</span>
              <button
                type="button"
                onClick={() => setMaxMembers((n) => Math.min(100, n + 1))}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors font-bold"
              >
                +
              </button>
            </div>
          </div>

          <RegisterConsentBlock serviceKind="club" onChange={setConsented} />

          <Button type="submit" disabled={loading || !consented} className="w-full h-11">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                등록 중...
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                모임 만들기
              </>
            )}
          </Button>
        </form>
      </main>
      <BottomNav />
    </div>
  )
}
