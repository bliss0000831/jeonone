/**
 * 게시판 전용 리스트 아이템.
 *
 * 텍스트 중심 — 제목 + 메타 (작성자·날짜·조회수) 좌측, 썸네일 우측 작게,
 * 그리고 댓글 수 박스가 우측 끝.
 *
 * 클리앙 / 디시 게시판 스타일.
 */
import Link from 'next/link'
import { Play } from 'lucide-react'

export interface BoardListItemProps {
  href: string
  title: string
  authorName: string | null
  createdAt: string  // ISO 또는 표시용 문자열
  views: number
  commentCount: number
  thumbnailUrl?: string | null
  imagesCount?: number  // 1+, 2+ 같은 표시
  hasVideo?: boolean
  isPinned?: boolean
  region?: string | null  // 글 지역 (춘천/홍천 등) — 표시용 뱃지
}

function formatDate(iso: string): string {
  // "2024-04-06" → "04.06.", "2024-02-25" → "02.25."
  try {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}.${day}.`
  } catch {
    return iso.slice(5, 10).replace('-', '.')
  }
}

export function BoardListItem({
  href,
  title,
  authorName,
  createdAt,
  views,
  commentCount,
  thumbnailUrl,
  imagesCount,
  hasVideo,
  isPinned,
  region,
}: BoardListItemProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex items-start gap-3 px-4 py-3.5 active:bg-secondary/40 transition-colors border-b border-border"
    >
      {/* 좌측: 제목 + 메타 (flex-1 — 우측 영역 빼고 다 차지) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="text-[17px] text-foreground line-clamp-2 leading-snug font-medium break-keep">
          {isPinned && <span className="mr-1 text-amber-500">📌</span>}
          {region && (
            <span className="mr-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary align-middle">
              {region}
            </span>
          )}
          {title}
        </h3>
        <div className="text-[17px] text-muted-foreground mt-1.5 truncate">
          <span>{authorName || '익명'}</span>
          <span className="mx-1.5">·</span>
          <span>{formatDate(createdAt)}</span>
          <span className="mx-1.5">·</span>
          <span>조회 {views.toLocaleString()}</span>
        </div>
      </div>

      {/* 우측: 썸네일 (있을 때만) */}
      {thumbnailUrl && (
        <div className="relative w-[70px] h-[70px] flex-shrink-0 rounded-xl overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
          {/* 비디오면 좌하단 플레이 아이콘 */}
          {hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="w-5 h-5 text-white drop-shadow fill-white" />
            </div>
          )}
          {/* 이미지 여러 장이면 우상단 카운트 */}
          {imagesCount && imagesCount > 1 && (
            <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold">
              {imagesCount}+
            </span>
          )}
        </div>
      )}

      {/* 우측 끝: 댓글 수 박스 — self-center 로 행 세로 가운데 (썸네일/제목은 위 정렬 유지) */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[40px] self-center">
        <span className="text-[18px] font-bold text-foreground leading-none">
          {commentCount}
        </span>
        <span className="text-[12px] text-muted-foreground mt-1.5">댓글</span>
      </div>
    </Link>
  )
}
