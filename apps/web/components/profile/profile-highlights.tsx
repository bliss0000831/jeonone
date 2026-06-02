"use client"

import { Plus, Play } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Highlight {
  id: string
  title: string
  cover_url: string | null
  media_url?: string | null
  media_type?: "image" | "video" | null
  duration_ms?: number | null
  link_url?: string | null
}

interface ProfileHighlightsProps {
  items: Highlight[]
  mode: "self" | "other"
  onAdd?: () => void
  onOpen?: (h: Highlight, index: number) => void
}

export function ProfileHighlights({
  items,
  mode,
  onAdd,
  onOpen,
}: ProfileHighlightsProps) {
  // 타인 프로필 + 빈: 섹션 자체 숨김
  if (items.length === 0 && mode !== "self") return null

  // 본인 + 빈: 큰 원 버튼 대신 작은 링크 한 줄로 대체
  if (items.length === 0 && mode === "self") {
    return (
      <div className="px-4 sm:px-6 py-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          하이라이트 추가
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-4 overflow-x-auto scrollbar-hide">
      <div className="flex gap-4">
        {mode === "self" && (
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-secondary/40 hover:bg-secondary transition-colors">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">
              {items.length > 0 ? "추가/수정" : "추가"}
            </span>
          </button>
        )}

        {items.map((h, i) => {
          const thumb = h.cover_url || h.media_url
          const isVideo = h.media_type === "video"
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onOpen?.(h, i)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
            >
              <div
                className={cn(
                  "relative w-16 h-16 rounded-full p-0.5",
                  "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
                  "group-hover:scale-105 transition-transform",
                )}
              >
                <div className="w-full h-full rounded-full bg-background p-0.5">
                  {thumb ? (
                    isVideo && !h.cover_url ? (
                      // 비디오에 별도 커버가 없으면 video 태그로 첫 프레임 사용
                      <video
                        src={thumb}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={h.title}
                        className="w-full h-full rounded-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-[10px] font-medium text-muted-foreground truncate px-1">
                        {h.title.slice(0, 3)}
                      </span>
                    </div>
                  )}
                </div>
                {isVideo && (
                  <div className="absolute bottom-0 right-0 bg-black/70 text-white rounded-full p-1 shadow-sm">
                    <Play className="w-2.5 h-2.5 fill-white" />
                  </div>
                )}
              </div>
              <span className="text-xs text-foreground max-w-[64px] truncate">
                {h.title}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
