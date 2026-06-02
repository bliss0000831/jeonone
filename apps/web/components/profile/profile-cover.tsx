"use client"

import { useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RoleConfig } from "./role-config"

interface ProfileCoverProps {
  coverUrl: string | null
  role: RoleConfig
  className?: string
  editable?: boolean
  onUpload?: (file: File) => Promise<void>
}

export function ProfileCover({
  coverUrl,
  role,
  className,
  editable,
  onUpload,
}: ProfileCoverProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const handleClick = () => {
    if (!editable || busy) return
    inputRef.current?.click()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // 같은 파일 재선택 허용
    if (!file || !onUpload) return
    setBusy(true)
    try {
      await onUpload(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        "relative h-32 sm:h-40 md:h-48 w-full overflow-hidden",
        !coverUrl && role.coverGradient,
        editable && "cursor-pointer group",
        className,
      )}
      onClick={handleClick}
      role={editable ? "button" : undefined}
      aria-label={editable ? "커버 이미지 변경" : undefined}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt="커버 이미지"
          className="w-full h-full object-cover"
        />
      )}
      {/* 하단 페이드 */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/15 via-black/5 to-transparent" />

      {/* 편집 오버레이 */}
      {editable && (
        <>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          <div className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-2 backdrop-blur-sm shadow-md">
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </div>
  )
}
