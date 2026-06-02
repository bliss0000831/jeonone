"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Sparkles,
  Play,
  Download,
  Clock,
  AlertCircle,
  Loader2,
  Film,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import { formatCredits, AI_VIDEO_UI_ENABLED } from "@/lib/ai-video/pricing"

interface JobRow {
  id: string
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  input: any
  credits_used: number
  beta_free: boolean
  result_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  error_message: string | null
  provider: string | null
  created_at: string
  completed_at: string | null
}

export default function MyVideosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [accountType, setAccountType] = useState<string | null>(null)
  const [preview, setPreview] = useState<JobRow | null>(null)

  useEffect(() => {
    // AI 영상 기능 비활성 — 사용자 직접 진입 시 마이페이지로 보냄
    if (!AI_VIDEO_UI_ENABLED) {
      router.replace("/mypage")
      return
    }
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/auth/login?redirect=/mypage/my-videos")
        return
      }
      const [profileRes, jobsRes] = await Promise.all([
        supabase.from("profiles").select("account_type").eq("id", user.id).single(),
        supabase
          .from("ai_video_jobs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
      setAccountType(profileRes.data?.account_type ?? null)
      setJobs((jobsRes.data as JobRow[]) ?? [])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (accountType !== "agent") {
    return (
      <div className="min-h-screen bg-background">
        <Header title="내 AI 영상" />
        <div className="px-5 py-10 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="font-bold text-lg">공인중개사 전용 기능입니다</h2>
          <p className="text-sm text-muted-foreground">
            AI 홍보영상은 공인중개사 계정만 이용할 수 있습니다.
          </p>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header title="내 AI 영상" />

      {jobs.length === 0 ? (
        <div className="px-5 py-16 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center mx-auto">
            <Film className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="font-bold text-lg">아직 생성한 영상이 없습니다</h2>
          <p className="text-sm text-muted-foreground">
            매물 등록 페이지에서 AI 홍보영상을 만들어보세요.
          </p>
          <Link href="/register">
            <Button className="mt-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              <Sparkles className="w-4 h-4 mr-1.5" />
              매물 등록하러 가기
            </Button>
          </Link>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onPlay={() => setPreview(job)} />
          ))}
        </div>
      )}

      {/* 영상 재생 오버레이 */}
      {preview && preview.result_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-md bg-black rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={preview.result_url}
              controls
              autoPlay
              className="w-full aspect-[9/16] object-contain bg-black"
            />
            <div className="p-4 bg-card space-y-2">
              <p className="font-semibold text-sm truncate">
                {preview.input?.title || "제목 없음"}
              </p>
              <div className="flex gap-2">
                <a href={preview.result_url} download className="flex-1">
                  <Button className="w-full" variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-1.5" />
                    다운로드
                  </Button>
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPreview(null)}
                >
                  닫기
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="safe-top px-4 py-3 border-b border-border flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-10">
      <Link href="/mypage" className="p-2 -ml-2 rounded-full hover:bg-secondary">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-semibold">{title}</h1>
    </header>
  )
}

function JobCard({ job, onPlay }: { job: JobRow; onPlay: () => void }) {
  const title = job.input?.title || "(제목 없음)"
  const ratio = job.input?.ratio || "9:16"
  const duration = job.duration_seconds || job.input?.duration || 30
  const createdAt = new Date(job.created_at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const statusMap: Record<
    JobRow["status"],
    { label: string; color: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "대기 중",
      color: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
      icon: <Clock className="w-3 h-3" />,
    },
    processing: {
      label: "생성 중",
      color: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    completed: {
      label: "완료",
      color: "bg-green-500/15 text-green-700 dark:text-green-300",
      icon: <Play className="w-3 h-3" />,
    },
    failed: {
      label: "실패",
      color: "bg-red-500/15 text-red-700 dark:text-red-300",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    cancelled: {
      label: "취소됨",
      color: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  }
  const s = statusMap[job.status]

  const isPlayable = job.status === "completed" && !!job.result_url

  return (
    <button
      type="button"
      onClick={isPlayable ? onPlay : undefined}
      disabled={!isPlayable}
      className={cn(
        "w-full rounded-xl border border-border bg-card p-3 text-left transition-all",
        isPlayable ? "hover:border-purple-300 hover:shadow-md cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex gap-3">
        {/* 썸네일 자리 */}
        <div
          className={cn(
            "relative rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center",
            ratio === "9:16" ? "w-16 h-24" : ratio === "1:1" ? "w-20 h-20" : "w-28 h-16",
          )}
        >
          {job.thumbnail_url ? (
            <Image src={job.thumbnail_url} alt="" fill className="object-cover" unoptimized />
          ) : (
            <Film className="w-6 h-6 text-white/80" />
          )}
          {isPlayable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                  s.color,
                )}
              >
                {s.icon}
                {s.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {duration}초 · {ratio}
              </span>
              {job.beta_free ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-700 dark:text-green-400 font-semibold">
                  BETA 무료
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  💎 {formatCredits(job.credits_used)} 크레딧
                </span>
              )}
            </div>
            <p className="font-semibold text-sm truncate">{title}</p>
            {job.status === "failed" && job.error_message && (
              <p className="text-[11px] text-red-600 mt-0.5 truncate">
                {job.error_message}
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{createdAt}</p>
        </div>
      </div>
    </button>
  )
}
