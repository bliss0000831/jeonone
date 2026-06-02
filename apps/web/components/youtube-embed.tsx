"use client"

import { useState } from "react"
import { ExternalLink, Youtube } from "lucide-react"
import { toYouTubeEmbedUrl, parseYouTubeUrl } from "@/lib/integrations/youtube"
import { cn } from "@/lib/utils"

interface YouTubeEmbedProps {
  url: string
  className?: string
  /** aspect: "video" (16:9) or "shorts" (9:16). 기본 자동 판정 */
  aspect?: "video" | "shorts"
}

/**
 * 유튜브 영상 임베드 (iframe 기반, nocookie)
 * - 일반 영상: 16:9
 * - 쇼츠: 9:16 비율로 중앙 정렬
 */
export function YouTubeEmbed({ url, className, aspect }: YouTubeEmbedProps) {
  const [loaded, setLoaded] = useState(false)
  const embedSrc = toYouTubeEmbedUrl(url)
  const parsed = parseYouTubeUrl(url)

  if (!embedSrc || !parsed) return null

  const isShorts = aspect ? aspect === "shorts" : parsed.kind === "shorts"

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "relative mx-auto w-full",
          isShorts ? "max-w-[360px] aspect-[9/16]" : "max-w-[720px] aspect-video",
        )}
      >
        {!loaded && (
          <div className="absolute inset-0 rounded-xl bg-muted animate-pulse flex items-center justify-center">
            <Youtube className="w-12 h-12 text-muted-foreground/40" />
          </div>
        )}

        <iframe
          src={embedSrc}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 w-full h-full rounded-xl border border-border bg-background"
        />
      </div>

      <div className="mt-2 flex justify-end max-w-[720px] mx-auto">
        <a
          href={parsed.canonical}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Youtube className="w-3.5 h-3.5" />
          유튜브에서 열기
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
