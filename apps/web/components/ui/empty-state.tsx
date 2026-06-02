import { type LucideIcon, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * 공용 빈 상태 컴포넌트.
 * 페이지마다 인라인 EmptyState 정의하던 패턴을 통일.
 *
 * 사용:
 *   <EmptyState
 *     icon={Search}
 *     title="검색 결과가 없습니다"
 *     description="다른 키워드로 다시 검색해보세요"
 *     action={<Button onClick={...}>다시 시도</Button>}
 *   />
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "데이터가 없습니다",
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6",
        className,
      )}
    >
      <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground max-w-xs mb-4">{description}</p>
      )}
      {action}
    </div>
  )
}
