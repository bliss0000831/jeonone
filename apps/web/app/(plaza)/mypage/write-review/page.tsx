"use client"

/**
 * 후기 작성 — 광장 web 의 review 작성 폼 (모바일 mypage/write-review 1:1).
 *
 * 진입 query params:
 *   reviewed_user_id: 후기 대상 사용자
 *   source_type: 'local_food_order' | 'group_buying_order'
 *   source_id: 주문 ID
 *   target_name: (선택) 상대방 닉네임
 *
 * POST /api/reviews — 응답·정확·친절 3개 별점(1~5) + 내용(<500자).
 */

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, Star, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const STAR_LABELS = {
  response_speed: "응답 속도",
  accuracy: "정보 정확성",
  kindness: "친절도",
} as const

type StarKey = keyof typeof STAR_LABELS

function WriteReviewContent() {
  const router = useRouter()
  const params = useSearchParams()

  const reviewed_user_id = params.get("reviewed_user_id") || ""
  const source_type = params.get("source_type") || ""
  const source_id = params.get("source_id") || ""
  const targetName = params.get("target_name") || "거래 상대"

  const [scores, setScores] = useState<Record<StarKey, number>>({
    response_speed: 5,
    accuracy: 5,
    kindness: 5,
  })
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function setStar(key: StarKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!reviewed_user_id || !source_type || !source_id) {
      setError("거래 정보가 누락되었습니다. 거래 페이지에서 다시 진입해주세요.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewed_user_id,
          source_type,
          source_id,
          response_speed: scores.response_speed,
          accuracy: scores.accuracy,
          kindness: scores.kindness,
          content: content.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || "후기 등록에 실패했습니다")
        return
      }
      setSuccess(true)
      setTimeout(() => router.push("/mypage"), 2000)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-md mx-auto">
        <div className="mt-16 text-center">
          <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Star className="w-8 h-8 text-green-600 fill-green-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">후기가 등록되었습니다</h2>
          <p className="text-muted-foreground text-sm">잠시 후 마이페이지로 이동합니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">후기 작성</h1>
          <div className="w-10" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 max-w-md mx-auto space-y-6">
        <div className="bg-muted p-3 rounded-lg flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground">
            ?
          </div>
          <div>
            <p className="text-xs text-muted-foreground">후기 대상</p>
            <p className="font-bold text-foreground">{targetName}</p>
          </div>
        </div>

        {(Object.keys(STAR_LABELS) as StarKey[]).map((key) => (
          <div key={key} className="space-y-2">
            <p className="text-sm font-semibold">{STAR_LABELS[key]}</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStar(key, s)}
                  className="p-1"
                >
                  <Star
                    className={`w-8 h-8 ${
                      s <= scores[key]
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-semibold text-muted-foreground">
                {scores[key]} / 5
              </span>
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <p className="text-sm font-semibold">한줄 후기 (선택)</p>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="거래 경험을 자유롭게 적어주세요 (500자 이내)"
            rows={5}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">
            {content.length} / 500
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg flex gap-2 items-start">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            총 별점은 위 3가지 항목의 평균으로 자동 계산됩니다.
            <br />
            동일 거래에는 한 번만 후기를 남길 수 있습니다.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full h-12" disabled={submitting}>
          {submitting ? "등록 중..." : "후기 등록"}
        </Button>
      </form>
    </div>
  )
}

export default function WriteReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <WriteReviewContent />
    </Suspense>
  )
}
