"use client"

/**
 * Pull-to-Refresh 래퍼 — Capacitor 앱에서만 활성, 웹은 no-op.
 *
 * 동작:
 *   - 웹 브라우저: children 그대로 (브라우저 자체 새로고침 사용)
 *   - 앱 (Android/iOS): 화면 상단에서 아래로 당기면 router.refresh() 트리거
 *
 * 효과 (라이브 URL 모드 약점 해결):
 *   - force-dynamic SSR 페이지의 stale 데이터를 사용자가 직접 갱신 가능
 *   - 카톡/당근/토스 동일 패턴 (앱답게 만드는 핵심 UX)
 *
 * 햅틱:
 *   - 당기기 시작: impactLight (가볍게 톡)
 *   - 새로고침 완료: notification('success')
 *
 * 사용:
 *   <PullToRefreshWrapper>
 *     <HomePage ... />
 *   </PullToRefreshWrapper>
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { isNativeSync } from "@/lib/native/platform"
import { impactLight, notification } from "@/lib/native/haptics"

// 라이브러리 자체가 window 의존이라 SSR off
const PullToRefresh = dynamic(
  () => import("react-simple-pull-to-refresh").then((m) => m.default),
  { ssr: false },
)

interface PullToRefreshWrapperProps {
  children: React.ReactNode
  /** 새로고침 동작 커스터마이즈 (default: router.refresh) */
  onRefresh?: () => Promise<void> | void
  /** 비활성화 (입력 폼 페이지 등에서 의도적으로 끄고 싶을 때) */
  disabled?: boolean
}

export function PullToRefreshWrapper({
  children,
  onRefresh,
  disabled = false,
}: PullToRefreshWrapperProps) {
  const router = useRouter()
  // SSR/hydration 안전 — 클라이언트 마운트 후 native 여부 결정
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (disabled) return
    setEnabled(isNativeSync())
  }, [disabled])

  // 웹 또는 비활성: 그대로 통과 (래퍼 비용 0)
  if (!enabled) return <>{children}</>

  const handleRefresh = async () => {
    try {
      await impactLight()
      if (onRefresh) {
        await onRefresh()
      } else {
        // RSC 리프레시 — server component 재실행 + 클라 상태 유지
        router.refresh()
        // router.refresh 는 fire-and-forget — 사용자에게 피드백 줄 시간 확보
        await new Promise((r) => setTimeout(r, 700))
      }
      await notification("success")
      toast.success("새로고침 완료", { duration: 1200 })
    } catch (err) {
      console.error("[pull-to-refresh]", err)
      toast.error("새로고침 실패")
    }
  }

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      pullDownThreshold={80}
      resistance={2}
      // 당기는 동안 표시
      pullingContent={
        <div className="flex items-center justify-center py-3 text-ink-500">
          <span className="text-xs font-medium">↓ 당겨서 새로고침</span>
        </div>
      }
      // 새로고침 중 (광장 primary 컬러 스피너)
      refreshingContent={
        <div className="flex items-center justify-center py-3 text-primary">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-xs font-medium">새로고침 중...</span>
        </div>
      }
    >
      {/* PullToRefresh 가 div 로 감싸므로 children 그대로 */}
      <>{children}</>
    </PullToRefresh>
  )
}
