/**
 * Chat 표시 포맷터.
 */

export function formatChatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}

export function formatChatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '어제'
  if (diffDays < 7) return d.toLocaleDateString('ko-KR', { weekday: 'long' })
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * 메시지 미리보기 (목록용) — 이미지면 [사진], 길면 truncate.
 */
export function previewMessage(content: string | null, imageUrl: string | null): string {
  if (imageUrl) return '[사진]'
  if (!content) return ''
  if (content.length > 30) return content.slice(0, 30) + '...'
  return content
}
