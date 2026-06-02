/**
 * "더 보기" 페이지네이션 버튼 — 리스팅 페이지 하단에서 추가 항목을 불러올 때 사용.
 */
interface Props {
  hasMore: boolean
  loading: boolean
  onClick: () => void
}

export function LoadMoreButton({ hasMore, loading, onClick }: Props) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center py-6">
      <button
        onClick={onClick}
        disabled={loading}
        className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
      >
        {loading ? "불러오는 중..." : "더 보기"}
      </button>
    </div>
  )
}
