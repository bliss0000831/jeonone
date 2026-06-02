"use client"

/**
 * AI 홍보영상 생성 모달 (Phase A — UI only + Mock API)
 *   - 매물 등록 페이지에서 사진 업로드 후 호출
 *   - 공인중개사 계정 전용 (상위에서 필터)
 *   - 백엔드는 아직 Mock: 3초 딜레이 후 샘플 영상 URL 반환
 */
import { useEffect, useState } from "react"
import { Sparkles, Loader2, X, Check, Play, Download, RotateCw, Plus, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  IS_BETA_FREE,
  POINTS_PER_CREDIT,
  creditCostForDuration,
  formatCredits,
  isBetaLocked,
} from "@/lib/ai-video/pricing"

type Duration = 15 | 30 | 60
type Ratio = "9:16" | "1:1" | "16:9"
type Style = "emotional" | "speedy" | "premium" | "info"
type Voice = "none" | "female_bright" | "female_calm" | "male_deep"
type Bgm = "piano" | "citypop" | "cinematic" | "upbeat" | "none"

export interface AiVideoOptions {
  duration: Duration
  ratio: Ratio
  style: Style
  voice: Voice
  bgm: Bgm
  highlights: string[]
  ctaText: string
}

const DEFAULT_OPTIONS: AiVideoOptions = {
  // BETA: 15초만 무료 개방. 정식 출시 시 30초로 복귀.
  duration: IS_BETA_FREE ? 15 : 30,
  ratio: "9:16",
  style: "emotional",
  voice: "female_bright",
  bgm: "piano",
  highlights: [],
  ctaText: "자세히 보기",
}

const HIGHLIGHT_OPTIONS = [
  "역세권/교통편리",
  "신축/리모델링",
  "풍경/채광 좋음",
  "시세 대비 저렴",
  "주차 편리",
  "상권 중심지",
  "조용한 환경",
  "고급 인테리어",
]

export interface AiVideoPropertyData {
  title?: string
  propertyType?: string
  transactionType?: string // 매매/전세/월세
  price?: string
  deposit?: string
  monthlyRent?: string
  address?: string
  addressDetail?: string
  area?: string
  floor?: string
  totalFloors?: string
  description?: string
}

interface Props {
  open: boolean
  onClose: () => void
  images: string[]
  property?: AiVideoPropertyData
  /**
   * 기존 매물 수정 페이지에서 전달. 있을 경우 완성 후
   * "이 영상 매물 상세페이지에 추가" 버튼이 노출됨.
   */
  propertyId?: string
  /**
   * 매물에 영상이 첨부되었을 때 부모에게 알림 (UI 업데이트용).
   */
  onAttached?: (videoUrl: string) => void
  /** @deprecated — use property.title */
  propertyTitle?: string
  /** @deprecated — use property.propertyType */
  propertyType?: string
}

type Phase = "form" | "generating" | "done" | "failed"

// ─── 가격 포맷터 (만원 단위 → "1억 2,000만원") ────────
function formatKRWFromMan(value?: string) {
  if (!value) return ""
  const num = parseInt(value) || 0
  if (num === 0) return ""
  if (num >= 10000) {
    const uk = Math.floor(num / 10000)
    const man = num % 10000
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
  }
  return `${num.toLocaleString()}만원`
}

function formatPriceSummary(p: AiVideoPropertyData | undefined) {
  if (!p?.transactionType) return ""
  if (p.transactionType === "매매") return `매매 ${formatKRWFromMan(p.price)}`
  if (p.transactionType === "전세") return `전세 ${formatKRWFromMan(p.deposit)}`
  if (p.transactionType === "월세") {
    const d = formatKRWFromMan(p.deposit)
    const m = formatKRWFromMan(p.monthlyRent)
    return `월세 ${d || "0"} / ${m || "0"}`
  }
  return p.transactionType
}

export function AiVideoModal({
  open,
  onClose,
  images,
  property,
  propertyId,
  onAttached,
  propertyTitle,
  propertyType,
}: Props) {
  // 하위호환: 개별 props 로 받은 경우 property 로 합성
  const prop: AiVideoPropertyData = {
    title: property?.title ?? propertyTitle,
    propertyType: property?.propertyType ?? propertyType,
    transactionType: property?.transactionType,
    price: property?.price,
    deposit: property?.deposit,
    monthlyRent: property?.monthlyRent,
    address: property?.address,
    addressDetail: property?.addressDetail,
    area: property?.area,
    floor: property?.floor,
    totalFloors: property?.totalFloors,
    description: property?.description,
  }
  const effectivePropertyType = prop.propertyType
  const [options, setOptions] = useState<AiVideoOptions>(() => ({
    ...DEFAULT_OPTIONS,
    // 매물 종류에 따라 기본 스타일 추천
    style:
      effectivePropertyType === "상가" || effectivePropertyType === "사무실" || effectivePropertyType === "오피스텔"
        ? "speedy"
        : "emotional",
  }))
  const [phase, setPhase] = useState<Phase>("form")
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [attachState, setAttachState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [attachError, setAttachError] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [balance, setBalance] = useState<number | null>(null) // 포인트
  const [downloading, setDownloading] = useState(false)

  // 열릴 때 크레딧 잔액 조회
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from("profiles")
        .select("video_credits")
        .eq("id", user.id)
        .single()
      setBalance(data?.video_credits ?? 0)
    })
  }, [open])

  // ESC 로 닫기 + body 스크롤 잠금 (생성 중 닫기는 handleClose 가 확인 처리)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const costPoints = creditCostForDuration(options.duration)
  const hasEnough = IS_BETA_FREE || (balance ?? 0) >= costPoints
  const canGenerate = images.length >= 1 && phase === "form" && agreed && hasEnough

  const toggleHighlight = (h: string) => {
    setOptions((o) => {
      const has = o.highlights.includes(h)
      if (has) return { ...o, highlights: o.highlights.filter((x) => x !== h) }
      if (o.highlights.length >= 3) return o // 최대 3개
      return { ...o, highlights: [...o.highlights, h] }
    })
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    setPhase("generating")
    setProgress(0)
    setErrorMsg(null)
    setResultUrl(null)

    try {
      // 1) 작업 제출 — 즉시 jobId 반환
      const res = await fetch("/api/ai-video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          ratio: options.ratio,
          duration: options.duration,
          style: options.style,
          property: {
            title: prop.title || "",
            propertyType: prop.propertyType || "",
            transactionType: prop.transactionType || "",
            price: prop.price ?? null,
            deposit: prop.deposit ?? null,
            monthlyRent: prop.monthlyRent ?? null,
            address: prop.address || "",
            addressDetail: prop.addressDetail || "",
            area: prop.area ?? null,
            floor: prop.floor ?? null,
            totalFloors: prop.totalFloors ?? null,
            description: prop.description || "",
          },
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "영상 생성에 실패했습니다")
      const jobId: string = json.jobId
      if (!jobId) throw new Error("jobId 를 받지 못했습니다")
      setCurrentJobId(jobId)

      setProgress(8)

      // 2) 폴링 — 3초 간격, 최대 10분
      const started = Date.now()
      const TIMEOUT_MS = 10 * 60 * 1000
      while (true) {
        await new Promise((r) => setTimeout(r, 3000))
        if (Date.now() - started > TIMEOUT_MS) {
          throw new Error("영상 생성이 시간 내에 완료되지 않았습니다")
        }
        const sRes = await fetch(`/api/ai-video/status?jobId=${jobId}`)
        const sJson = await sRes.json().catch(() => ({}))
        if (!sRes.ok) continue // 일시적 오류는 다시 시도

        if (typeof sJson.progress === "number") {
          setProgress(sJson.progress)
        }
        if (sJson.status === "completed" && sJson.resultUrl) {
          setProgress(100)
          setResultUrl(sJson.resultUrl)
          setPhase("done")
          return
        }
        if (sJson.status === "failed") {
          throw new Error(sJson.errorMessage || "영상 생성에 실패했습니다")
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "알 수 없는 오류")
      setPhase("failed")
    }
  }

  const reset = () => {
    setPhase("form")
    setProgress(0)
    setResultUrl(null)
    setAgreed(false)
    setErrorMsg(null)
    setCurrentJobId(null)
    setAttachState("idle")
    setAttachError(null)
  }

  const handleDownload = async () => {
    if (!resultUrl || downloading) return
    setDownloading(true)
    try {
      // 크로스 오리진 URL 에서 `<a download>` 는 브라우저가 무시하고
      // 그냥 해당 페이지로 이동시킴. fetch → Blob 로 강제 다운로드.
      const res = await fetch(resultUrl, { mode: "cors" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `ai-video-${currentJobId || Date.now()}.mp4`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (e) {
      // CORS 차단 등으로 blob 실패 시 — 새 탭에서 열어주는 폴백
      console.warn("[ai-video-modal] blob download failed, opening in new tab:", e)
      window.open(resultUrl, "_blank", "noopener,noreferrer")
    } finally {
      setDownloading(false)
    }
  }

  const handleAttach = async () => {
    if (!propertyId || !currentJobId || !resultUrl) return
    setAttachState("loading")
    setAttachError(null)
    try {
      const res = await fetch("/api/ai-video/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: currentJobId, propertyId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // detail 이 있으면 함께 표시 (ex: "column ai_video_url does not exist")
        const msg = json.detail
          ? `${json.error || "영상 추가 실패"} — ${json.detail}`
          : json.error || "영상 추가에 실패했습니다"
        throw new Error(msg)
      }
      setAttachState("success")
      onAttached?.(resultUrl)
    } catch (e: any) {
      setAttachState("error")
      setAttachError(e?.message || "알 수 없는 오류")
    }
  }

  const handleClose = () => {
    if (phase === "generating") {
      if (!confirm("생성을 취소하시겠습니까?")) return
    }
    reset()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="relative w-full md:max-w-xl max-h-[90vh] bg-card rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">AI 홍보영상 생성</h2>
              <p className="text-xs text-muted-foreground">BETA · 무료</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 -mr-2 rounded-full hover:bg-secondary"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* ─── form phase ─── */}
          {phase === "form" && (
            <>
              {images.length < 1 && (
                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 text-sm text-yellow-900 dark:text-yellow-100">
                  영상 생성에는 사진이 최소 1장 이상 필요합니다. 먼저 사진을 등록해주세요.
                </div>
              )}

              {/* 📋 이 정보로 만들어집니다 — 데이터 프리뷰 */}
              <PropertyDataPreview property={prop} imagesCount={images.length} />

              {/* 사진 미리보기 */}
              <div>
                <div className="text-sm font-medium mb-2">사용될 사진 · {images.length}장</div>
                {images.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.slice(0, 10).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`사진 ${i + 1}`}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-border"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">등록된 사진이 없습니다</div>
                )}
              </div>

              {/* 길이 */}
              <FieldGroup
                label="영상 길이"
                hint={IS_BETA_FREE ? "🎁 BETA: 15초만 무료 개방" : undefined}
              >
                <OptionRow>
                  <Pill
                    selected={options.duration === 15}
                    onClick={() => setOptions({ ...options, duration: 15 })}
                  >
                    15초 <span className="text-[10px] opacity-70">쇼츠</span>
                  </Pill>
                  <Pill
                    selected={options.duration === 30}
                    disabled={isBetaLocked(30)}
                    title={isBetaLocked(30) ? "정식 출시 후 이용 가능합니다" : undefined}
                    onClick={() => {
                      if (isBetaLocked(30)) return
                      setOptions({ ...options, duration: 30 })
                    }}
                  >
                    30초{" "}
                    <span className="text-[10px] opacity-70">
                      {isBetaLocked(30) ? "🔒 정식 출시 후" : "추천"}
                    </span>
                  </Pill>
                  <Pill
                    selected={options.duration === 60}
                    disabled={isBetaLocked(60)}
                    title={isBetaLocked(60) ? "정식 출시 후 이용 가능합니다" : undefined}
                    onClick={() => {
                      if (isBetaLocked(60)) return
                      setOptions({ ...options, duration: 60 })
                    }}
                  >
                    60초{" "}
                    {isBetaLocked(60) && (
                      <span className="text-[10px] opacity-70">🔒 정식 출시 후</span>
                    )}
                  </Pill>
                </OptionRow>
              </FieldGroup>

              {/* 비율 */}
              <FieldGroup label="화면 비율">
                <OptionRow>
                  <Pill selected={options.ratio === "9:16"} onClick={() => setOptions({ ...options, ratio: "9:16" })}>
                    세로 9:16 <span className="text-[10px] opacity-70">릴스</span>
                  </Pill>
                  <Pill selected={options.ratio === "1:1"} onClick={() => setOptions({ ...options, ratio: "1:1" })}>
                    정사각 1:1
                  </Pill>
                  <Pill selected={options.ratio === "16:9"} onClick={() => setOptions({ ...options, ratio: "16:9" })}>
                    가로 16:9
                  </Pill>
                </OptionRow>
              </FieldGroup>

              {/* 스타일 */}
              <FieldGroup label="스타일 톤">
                <OptionRow wrap>
                  <Pill selected={options.style === "emotional"} onClick={() => setOptions({ ...options, style: "emotional" })}>
                    🌸 감성형
                  </Pill>
                  <Pill selected={options.style === "speedy"} onClick={() => setOptions({ ...options, style: "speedy" })}>
                    ⚡ 스피디
                  </Pill>
                  <Pill selected={options.style === "premium"} onClick={() => setOptions({ ...options, style: "premium" })}>
                    💎 프리미엄
                  </Pill>
                  <Pill selected={options.style === "info"} onClick={() => setOptions({ ...options, style: "info" })}>
                    📋 정보형
                  </Pill>
                </OptionRow>
              </FieldGroup>

              {/* 나레이션 */}
              <FieldGroup label="AI 나레이션">
                <OptionRow wrap>
                  <Pill selected={options.voice === "none"} onClick={() => setOptions({ ...options, voice: "none" })}>
                    사용 안 함
                  </Pill>
                  <Pill selected={options.voice === "female_bright"} onClick={() => setOptions({ ...options, voice: "female_bright" })}>
                    여성 · 밝은
                  </Pill>
                  <Pill selected={options.voice === "female_calm"} onClick={() => setOptions({ ...options, voice: "female_calm" })}>
                    여성 · 차분
                  </Pill>
                  <Pill selected={options.voice === "male_deep"} onClick={() => setOptions({ ...options, voice: "male_deep" })}>
                    남성 · 중저음
                  </Pill>
                </OptionRow>
              </FieldGroup>

              {/* BGM */}
              <FieldGroup label="배경음악">
                <OptionRow wrap>
                  <Pill selected={options.bgm === "piano"} onClick={() => setOptions({ ...options, bgm: "piano" })}>
                    🎹 피아노
                  </Pill>
                  <Pill selected={options.bgm === "citypop"} onClick={() => setOptions({ ...options, bgm: "citypop" })}>
                    🎵 시티팝
                  </Pill>
                  <Pill selected={options.bgm === "cinematic"} onClick={() => setOptions({ ...options, bgm: "cinematic" })}>
                    🎬 시네마틱
                  </Pill>
                  <Pill selected={options.bgm === "upbeat"} onClick={() => setOptions({ ...options, bgm: "upbeat" })}>
                    🔥 업비트
                  </Pill>
                  <Pill selected={options.bgm === "none"} onClick={() => setOptions({ ...options, bgm: "none" })}>
                    무음
                  </Pill>
                </OptionRow>
              </FieldGroup>

              {/* 강조 포인트 */}
              <FieldGroup
                label="강조하고 싶은 포인트"
                hint={`최대 3개 선택 (${options.highlights.length}/3)`}
              >
                <OptionRow wrap>
                  {HIGHLIGHT_OPTIONS.map((h) => (
                    <Pill key={h} selected={options.highlights.includes(h)} onClick={() => toggleHighlight(h)}>
                      {h}
                    </Pill>
                  ))}
                </OptionRow>
              </FieldGroup>

              {/* CTA */}
              <FieldGroup label="마지막 화면 문구" hint="연락처와 QR 코드는 자동으로 삽입됩니다">
                <input
                  type="text"
                  value={options.ctaText}
                  onChange={(e) => setOptions({ ...options, ctaText: e.target.value.slice(0, 20) })}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                  maxLength={20}
                  placeholder="자세히 보기"
                />
              </FieldGroup>

              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 text-xs text-purple-900 dark:text-purple-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span>⏱️ 생성까지 약 <b>2~5분</b> 소요</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/30">
                    {options.duration}초 영상
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-purple-200/50 dark:border-purple-800/50 pt-1.5">
                  <span>💎 차감 크레딧</span>
                  <span className="font-bold">
                    {IS_BETA_FREE ? (
                      <>
                        <s className="opacity-60 font-normal mr-1">{formatCredits(costPoints)}</s>
                        <span className="text-green-700 dark:text-green-400">BETA 무료 🎁</span>
                      </>
                    ) : (
                      <>
                        {formatCredits(costPoints)} 크레딧
                        {balance !== null && (
                          <span className="font-normal opacity-70 ml-1">
                            (잔액: {formatCredits(balance)})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {!IS_BETA_FREE && !hasEnough && balance !== null && (
                  <div className="pt-1.5 border-t border-purple-200/50 dark:border-purple-800/50 text-red-700 dark:text-red-400 flex items-center justify-between">
                    <span>⚠️ 크레딧이 부족합니다</span>
                    <a
                      href="/mypage/credits"
                      className="underline font-semibold hover:opacity-80"
                    >
                      충전하기 →
                    </a>
                  </div>
                )}
              </div>

              {/* ⚠️ 경고: 입력 데이터 기반으로 영상이 만들어짐 + 크레딧 환불 불가 */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5">
                  ⚠️ 영상 생성 전 반드시 확인해주세요
                </p>
                <ul className="pl-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    영상은 앞 단계에서 입력하신{" "}
                    <b>제목 · 주소 · 가격 · 면적 · 매물 종류 · 상세설명 · 사진</b>을
                    기반으로 자동 생성됩니다.
                  </li>
                  <li>
                    정보가 <b>부정확하거나 누락</b>되면 영상에도 그대로 반영되어
                    이상하게 나올 수 있습니다. 생성 전 각 항목을 꼭 다시
                    확인해주세요.
                  </li>
                  <li>
                    생성이 <b>시작되면 취소/환불이 불가</b>하며, 결과물이
                    마음에 들지 않더라도 크레딧은 차감됩니다.
                    <span className="text-amber-700 dark:text-amber-300">
                      {" "}
                      (BETA 기간 중에는 무료)
                    </span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* ─── generating phase ─── */}
          {phase === "generating" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold text-base">AI가 영상을 만들고 있어요</p>
                <p className="text-xs text-muted-foreground mt-1">
                  사진 분석 → 클립 생성 → 자막 합성 → 출력
                </p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {Math.floor(progress)}%
                </p>
              </div>
            </div>
          )}

          {/* ─── done phase ─── */}
          {phase === "done" && resultUrl && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="w-5 h-5" />
                <span className="font-semibold">영상이 완성되었습니다!</span>
              </div>

              {/* 미리보기 */}
              <div
                className={cn(
                  "relative bg-black rounded-xl overflow-hidden mx-auto",
                  options.ratio === "9:16" && "aspect-[9/16] max-w-[240px]",
                  options.ratio === "1:1" && "aspect-square max-w-xs",
                  options.ratio === "16:9" && "aspect-video w-full",
                )}
              >
                <video
                  src={resultUrl}
                  controls
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              {/* 액션 버튼 */}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="bg-primary text-primary-foreground hover:opacity-90"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      다운로드 중...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      영상 다운로드
                    </>
                  )}
                </Button>

                {/* 매물에 추가 (수정 페이지에서만 노출) */}
                {propertyId && attachState !== "success" && (
                  <Button
                    type="button"
                    onClick={handleAttach}
                    disabled={attachState === "loading"}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                  >
                    {attachState === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        추가하는 중...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        이 영상 매물 상세페이지에 추가
                      </>
                    )}
                  </Button>
                )}

                {/* 추가 성공 */}
                {propertyId && attachState === "success" && (
                  <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    매물 상세페이지에 추가되었습니다
                  </div>
                )}

                {/* 추가 실패 */}
                {propertyId && attachState === "error" && attachError && (
                  <p className="text-xs text-center text-red-600 dark:text-red-400">
                    {attachError}
                  </p>
                )}

                <Button type="button" variant="outline" onClick={reset}>
                  <RotateCw className="w-4 h-4 mr-2" />
                  다른 옵션으로 다시 만들기
                </Button>
              </div>

              {!propertyId && (
                <p className="text-xs text-center text-muted-foreground">
                  💡 매물 등록 완료 후 수정 페이지에서 매물에 첨부할 수 있어요
                </p>
              )}
            </div>
          )}

          {/* ─── failed phase ─── */}
          {phase === "failed" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <p className="font-semibold text-red-900 dark:text-red-100">
                  영상 생성에 실패했습니다
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  {errorMsg}
                </p>
              </div>
              <Button type="button" onClick={reset} className="w-full">
                다시 시도
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "form" && (
          <footer className="px-5 py-4 border-t border-border bg-card rounded-b-2xl sticky bottom-0 space-y-3">
            {/* 최종 동의 체크박스 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs leading-relaxed text-foreground group-hover:text-foreground/80">
                위에 표시된 <b>매물 정보가 정확함</b>을 확인했으며,{" "}
                <b>생성 후 취소 · 환불이 불가</b>하다는 점에 동의합니다.
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                취소
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex-[2] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {agreed ? "영상 만들기" : "동의 후 생성"}
              </Button>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

// ─── 작은 하위 컴포넌트들 ───────────────────────────

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function OptionRow({
  children,
  wrap,
}: {
  children: React.ReactNode
  wrap?: boolean
}) {
  return (
    <div className={cn("flex gap-2", wrap ? "flex-wrap" : "overflow-x-auto")}>{children}</div>
  )
}

function Pill({
  children,
  selected,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-colors flex items-center gap-1",
        disabled
          ? "bg-secondary/50 text-muted-foreground border-transparent cursor-not-allowed opacity-60"
          : selected
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/70",
      )}
    >
      {children}
    </button>
  )
}

/**
 * 트리거 버튼 (매물 등록 페이지에서 사용)
 *   사진 등록 섹션 하단에 인라인으로 놓을 배너 스타일
 */
export function AiVideoTriggerCard({
  onClick,
  disabled,
  imagesCount,
}: {
  onClick: () => void
  disabled?: boolean
  imagesCount: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || imagesCount < 1}
      className={cn(
        "w-full rounded-xl p-4 text-left transition-all",
        "bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10",
        "border border-purple-200 dark:border-purple-900",
        "hover:from-purple-500/20 hover:via-pink-500/20 hover:to-orange-500/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm">AI 홍보영상 자동 생성</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500 text-white">
              BETA
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-700 dark:text-green-400">
              무료
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            업로드한 사진으로 30초 홍보영상을 자동으로 만들어드려요.
            {imagesCount < 1 && " 먼저 사진을 등록해주세요."}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
            ⚠️ 앞서 입력한 제목·주소·가격·설명을 기반으로 생성되니 정확히 입력해주세요.
            생성 후 크레딧은 환불되지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 text-xs font-semibold flex-shrink-0">
          <Play className="w-3 h-3" />
          생성
        </div>
      </div>
    </button>
  )
}

/**
 * 매물 정보 프리뷰 — 모달 form 단계 최상단
 *   앞 단계에서 입력된 데이터를 한눈에 보여주고,
 *   누락된 항목은 눈에 띄게 경고 표시
 */
function PropertyDataPreview({
  property,
  imagesCount,
}: {
  property: AiVideoPropertyData
  imagesCount: number
}) {
  const address =
    [property.address, property.addressDetail].filter(Boolean).join(" ").trim() || null
  const priceStr = formatPriceSummary(property) || null
  const area = property.area ? `${property.area}㎡` : null
  const floor =
    property.floor && property.totalFloors
      ? `${property.floor}층 / ${property.totalFloors}층`
      : property.floor
        ? `${property.floor}층`
        : null

  const rows: { label: string; value: string | null; required?: boolean }[] = [
    { label: "제목", value: property.title || null, required: true },
    { label: "매물 종류", value: property.propertyType || null, required: true },
    { label: "거래/가격", value: priceStr, required: true },
    { label: "주소", value: address, required: true },
    { label: "면적", value: area },
    { label: "층수", value: floor },
    { label: "사진", value: imagesCount > 0 ? `${imagesCount}장` : null, required: true },
    {
      label: "상세설명",
      value: property.description ? `${property.description.slice(0, 40)}${property.description.length > 40 ? "…" : ""}` : null,
    },
  ]

  const missingRequired = rows.filter((r) => r.required && !r.value).length

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold">📋 이 정보로 영상이 만들어집니다</span>
        {missingRequired > 0 ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            누락 {missingRequired}개
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
            ✓ 모두 입력됨
          </span>
        )}
      </div>
      <dl className="divide-y divide-border bg-card">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 px-4 py-2 text-xs">
            <dt className="w-16 flex-shrink-0 text-muted-foreground">{r.label}</dt>
            <dd
              className={cn(
                "flex-1 min-w-0 truncate",
                r.value ? "text-foreground font-medium" : "text-red-600 dark:text-red-400",
              )}
            >
              {r.value ?? (r.required ? "⚠️ 누락" : "—")}
            </dd>
          </div>
        ))}
      </dl>
      {missingRequired > 0 && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-900 text-[11px] text-red-800 dark:text-red-300">
          ⚠️ 필수 항목이 누락되어 있습니다. 모달을 닫고 앞 단계에서 먼저
          입력해주세요.
        </div>
      )}
    </div>
  )
}
