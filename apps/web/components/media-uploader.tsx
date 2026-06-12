"use client"

/**
 * 범용 미디어 업로더 (이미지 + 동영상 혼합).
 *
 * 모바일과 1:1 — 사진/동영상 최대 N장 (기본 10), 대표이미지 지정(별 아이콘),
 * 개별 삭제, 미리보기, 동영상 재생 컨트롤.
 *
 * 사용:
 *   <MediaUploader
 *     value={images}           // string[] — URL 배열 (대표는 0번)
 *     onChange={setImages}
 *     maxItems={10}
 *     folder="property"
 *     videoEnabled
 *   />
 */

import { useState } from "react"
import Image from "next/image"
import { Upload, X, Star, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  maxItems?: number
  folder: string
  /** true 면 동영상도 허용 (사진+동영상 혼합) */
  videoEnabled?: boolean
  /** 대표이미지 지정 별 아이콘 표시 (기본 true) */
  thumbnailEnabled?: boolean
  className?: string
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

export function MediaUploader({
  value,
  onChange,
  maxItems = 10,
  folder,
  videoEnabled = false,
  thumbnailEnabled = true,
  className,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const remaining = maxItems - value.length
      const toUpload = Array.from(files).slice(0, remaining)
      const next = [...value]
      let failCount = 0
      let lastError = ""
      for (const file of toUpload) {
        // 클라이언트 측 사전 사이즈 체크 — 서버 cap 과 동일 (UX)
        const isVid = file.type.startsWith("video/")
        const max = isVid ? 100 * 1024 * 1024 : 10 * 1024 * 1024
        if (file.size > max) {
          lastError = isVid ? "동영상은 100MB 이하만 업로드 가능합니다" : "이미지는 10MB 이하만 업로드 가능합니다"
          failCount++
          continue
        }
        try {
          const fd = new FormData()
          fd.append("file", file)
          fd.append("folder", folder)
          const res = await fetch("/api/upload", { method: "POST", body: fd })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.url) {
            next.push(data.url)
          } else {
            lastError = data?.error || "업로드 실패"
            failCount++
          }
        } catch {
          lastError = "업로드 중 오류가 발생했습니다"
          failCount++
        }
      }
      onChange(next)
      if (failCount > 0) {
        setError(failCount > 1 ? `${failCount}개 파일 업로드에 실패했습니다` : lastError)
      }
    } catch (err) {
      setError((err as Error)?.message || "업로드에 실패했습니다")
    } finally {
      setUploading(false)
      // 같은 파일 재선택 가능하도록 input value 리셋
      e.target.value = ""
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function setAsThumbnail(idx: number) {
    if (idx === 0) return
    const next = [...value]
    const [picked] = next.splice(idx, 1)
    next.unshift(picked)
    onChange(next)
  }

  const accept = videoEnabled ? "image/*,video/*" : "image/*"
  const labelText = videoEnabled ? "사진 / 동영상 추가" : "사진 추가"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {value.map((url, idx) => {
          const video = isVideoUrl(url)
          return (
            <div
              key={`${url}-${idx}`}
              className="relative w-24 h-24 rounded-lg overflow-hidden border bg-muted group"
            >
              {video ? (
                <>
                  <video
                    src={url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Play className="w-6 h-6 text-white drop-shadow" fill="white" />
                  </div>
                </>
              ) : (
                <Image src={url} alt="" fill className="object-cover" unoptimized />
              )}

              {/* 삭제 */}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-md"
                aria-label="삭제"
              >
                <X className="w-4 h-4" />
              </button>

              {/* 대표 뱃지 또는 대표 지정 버튼 */}
              {thumbnailEnabled && !video && (
                idx === 0 ? (
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    <Star className="w-2.5 h-2.5 fill-yellow-900" />
                    대표
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsThumbnail(idx)}
                    className="absolute bottom-1 left-1 w-8 h-8 rounded-full bg-black/50 hover:bg-yellow-400 text-white hover:text-yellow-900 flex items-center justify-center transition-colors shadow-md"
                    aria-label="대표 이미지로 지정"
                    title="대표 이미지로 지정"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          )
        })}

        {value.length < maxItems && (
          <label
            className={cn(
              "w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary transition-colors",
              uploading && "opacity-50 pointer-events-none",
            )}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span className="text-[10px] mt-1 text-center px-1">{labelText}</span>
              </>
            )}
            <input
              type="file"
              accept={accept}
              multiple
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {value.length} / {maxItems}
          {videoEnabled && " · 동영상 최대 100MB"}
        </span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  )
}
