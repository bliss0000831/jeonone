"use client"

import { useState, useRef } from "react"
import { Camera, X, Loader2, Plus, Star, Film } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  images?: string[]
  onChange: (images: string[]) => void
  maxImages?: number
  /** 동영상 업로드 허용 (기본 true) */
  allowVideo?: boolean
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|ogv|avi)(\?|$)/i

function isVideoUrl(url: string) {
  return VIDEO_EXT_RE.test(url)
}

export function ImageUpload({
  images = [],
  onChange,
  maxImages = 10,
  allowVideo = true,
}: ImageUploadProps) {
  const imageList = images ?? []
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // 최대 개수 체크
    const remainingSlots = maxImages - imageList.length
    if (remainingSlots <= 0) {
      setError(`최대 ${maxImages}개까지만 업로드 가능합니다`)
      return
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots)
    setUploading(true)
    setError(null)

    const newUrls: string[] = []
    let failCount = 0
    let lastError = ""

    for (const file of filesToUpload) {
      try {
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || "업로드 실패")
        }

        newUrls.push(data.url)
      } catch (err) {
        console.error("Upload error:", err)
        lastError = err instanceof Error ? err.message : "업로드에 실패했습니다"
        failCount++
      }
    }

    if (newUrls.length > 0) {
      onChange([...imageList, ...newUrls])
    }
    if (failCount > 0) {
      setError(failCount > 1 ? `${failCount}개 파일 업로드에 실패했습니다` : lastError)
    }

    setUploading(false)

    // 파일 input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeImage = (index: number) => {
    const newImages = [...imageList]
    newImages.splice(index, 1)
    onChange(newImages)
  }

  const setAsCover = (index: number) => {
    if (index === 0) return
    const newImages = [...imageList]
    const [picked] = newImages.splice(index, 1)
    newImages.unshift(picked)
    onChange(newImages)
  }

  const coverIsVideo = imageList.length > 0 && isVideoUrl(imageList[0])
  const accept = allowVideo ? "image/*,video/*" : "image/*"

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {/* 기존 미디어들 */}
        {imageList.map((url, index) => {
          const video = isVideoUrl(url)
          return (
            <div
              key={url}
              className={cn(
                "relative aspect-square rounded-lg overflow-hidden border border-border bg-black",
                index === 0 && "col-span-2 row-span-2 ring-2 ring-primary",
              )}
            >
              {video ? (
                <video
                  src={url}
                  muted
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <img
                  src={url}
                  alt={`사진 ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* 동영상 표시 뱃지 */}
              {video && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] inline-flex items-center gap-1 pointer-events-none">
                  <Film className="w-3 h-3" />
                  동영상
                </div>
              )}

              {/* 삭제 버튼 */}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors"
                aria-label="삭제"
              >
                <X className="w-4 h-4" />
              </button>

              {/* 대표 지정 버튼 (첫 번째가 아닌 경우만) */}
              {index !== 0 && (
                <button
                  type="button"
                  onClick={() => setAsCover(index)}
                  className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded bg-background/90 text-foreground text-[11px] font-medium inline-flex items-center justify-center gap-1 hover:bg-background transition-colors border border-border"
                >
                  <Star className="w-3 h-3" />
                  대표로 지정
                </button>
              )}

              {/* 대표 뱃지 */}
              {index === 0 && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded inline-flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  {video ? "대표 동영상" : "대표 사진"}
                </div>
              )}
            </div>
          )
        })}

        {/* 업로드 버튼 */}
        {imageList.length < maxImages && (
          <label
            className={cn(
              "aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary",
              uploading && "pointer-events-none opacity-50",
            )}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Plus className="w-6 h-6" />
                <span className="text-xs">
                  {imageList.length}/{maxImages}
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Camera className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          대표로 쓰고 싶은 사진/동영상을 골라{" "}
          <b>별 모양 "대표로 지정"</b> 버튼을 눌러주세요. 최대 {maxImages}개
          {allowVideo ? " (사진 10MB, 동영상 100MB 이하)" : ", 각 파일당 10MB 이하"}
          까지 업로드할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
