import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"

export const runtime = "nodejs"

/**
 * job 상태 폴링용
 *   GET /api/ai-video/status?jobId=xxx
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const jobId = new URL(request.url).searchParams.get("jobId")
  if (!jobId) {
    return NextResponse.json({ error: "missing jobId" }, { status: 400 })
  }

  const { data: job, error } = await supabase
    .from("ai_video_jobs")
    .select(
      "id, user_id, status, stage, clips, result_url, error_message, script_text, duration_seconds, created_at, completed_at",
    )
    .eq("id", jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // 진행률 계산
  const clips: any[] = Array.isArray(job.clips) ? job.clips : []
  const total = clips.length || 1
  const doneClips = clips.filter((c) => c.status === "completed").length

  let progress = 0
  if (job.stage === "preparing") progress = 5
  else if (job.stage === "generating_clips") {
    // 10% → 70% 사이를 클립 진행률로 매핑
    progress = 10 + Math.round((doneClips / total) * 60)
  } else if (job.stage === "compositing") progress = 75
  else if (job.stage === "burning_subtitles") progress = 90
  else if (job.stage === "done" || job.status === "completed") progress = 100
  if (job.status === "failed") progress = 0

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progress,
    clips: {
      total,
      done: doneClips,
    },
    resultUrl: job.result_url,
    scriptText: job.script_text,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  })
}
