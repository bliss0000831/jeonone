"use client"

import { useState } from "react"
import { ExternalLink, Instagram } from "lucide-react"
import { toInstagramEmbedUrl, parseInstagramUrl } from "@/lib/integrations/instagram"
import { cn } from "@/lib/utils"

interface InstagramEmbedProps {
  url: string
  className?: string
  /** 높이 (기본 560px). 캐러셀/릴스 대응 */
  height?: number
}

/**
 * 인스타그램 포스트/릴스 임베드 (iframe 기반)
 *
 * - 비로그인 사용자도 게시물 1건을 그 자리에서 볼 수 있음
 * - 캐러셀(여러 장) / 영상 / 릴스 전부 지원 (인스타 공식 embed/captioned endpoint)
 * - 유효하지 않은 URL → 폴백 링크만 노출
 * - 비공개/삭제 게시물 → iframe 내부에서 인스타가 자체 메시지 표시
 */
export function InstagramEmbed({ url, className, height = 560 }: InstagramEmbedProps) {
  const [loaded, setLoaded] = useState(false)
  const embedSrc = toInstagramEmbedUrl(url)
  const parsed = parseInstagramUrl(url)

  // 유효하지 않으면 아무것도 렌더하지 않음
  if (!embedSrc || !parsed) return null

  return (
    <div className={cn("w-full", className)}>
      <div className="relative w-full max-w-[540px] mx-auto">
        {/* 로딩 스켈레톤 */}
        {!loaded && (
          <div
            className="absolute inset-0 rounded-xl bg-muted animate-pulse flex items-center justify-center"
            style={{ height }}
          >
            <Instagram className="w-10 h-10 text-muted-foreground/40" />
          </div>
        )}

        <iframe
          src={embedSrc}
          title="Instagram post"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          scrolling="no"
          onLoad={() => setLoaded(true)}
          className="w-full rounded-xl border border-border bg-background"
          style={{ height }}
        />

        {/* 폴백 오픈 링크 (스크립트 차단/로드 실패 대비) */}
        <div className="mt-2 flex justify-end">
          <a
            href={parsed.canonical}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Instagram className="w-3.5 h-3.5" />
            인스타그램에서 열기
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
