"use client"

import { useEffect } from "react"

/**
 * H1: 폼 작성 중 페이지 이탈 경고
 *
 * @param isDirty - 폼이 수정된 상태인지 여부
 * @param message - 사용하지 않지만 시맨틱용 (브라우저가 기본 메시지 표시)
 *
 * 사용법:
 *   const [dirty, setDirty] = useState(false)
 *   useBeforeUnload(dirty)
 *   // 폼 필드 onChange 에서 setDirty(true)
 *   // submit 성공 후 setDirty(false)
 */
export function useBeforeUnload(isDirty: boolean, _message?: string) {
  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome 에선 returnValue 가 필요
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])
}
