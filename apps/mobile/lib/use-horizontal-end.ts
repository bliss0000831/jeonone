/**
 * useHorizontalEnd — 가로 스크롤 캐러셀이 끝에 도달했는지 추적.
 *
 * 사용:
 *   const { atEnd, onScroll, onContentSize, onLayout } = useHorizontalEnd()
 *   <ScrollView
 *     horizontal
 *     onScroll={onScroll}
 *     onContentSizeChange={(w) => onContentSize(w)}
 *     onLayout={(e) => onLayout(e.nativeEvent.layout.width)}
 *     scrollEventThrottle={32}
 *   >
 *     ...
 *   </ScrollView>
 */

import { useCallback, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

export function useHorizontalEnd(tolerancePx = 4) {
  const [atEnd, setAtEnd] = useState(false)
  const contentW = useRef(0)
  const viewW = useRef(0)
  const scrollX = useRef(0)

  /** 현재 위치에서 viewport 의 80% 만큼 오른쪽으로 스크롤 (page-by-page 느낌). */
  const advance = useCallback((scrollRef: any) => {
    const target = Math.min(
      contentW.current - viewW.current,
      scrollX.current + viewW.current * 0.8,
    )
    const r: any = scrollRef?.current
    if (!r) return
    if (typeof r.scrollTo === "function")
      r.scrollTo({ x: target, animated: true })
    else if (typeof r.scrollToOffset === "function")
      r.scrollToOffset({ offset: target, animated: true })
  }, [])

  const recompute = useCallback(() => {
    const remain = contentW.current - viewW.current - scrollX.current
    setAtEnd(remain <= tolerancePx)
  }, [tolerancePx])

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.current = e.nativeEvent.contentOffset.x
      recompute()
    },
    [recompute],
  )
  const onContentSize = useCallback(
    (w: number) => {
      contentW.current = w
      recompute()
    },
    [recompute],
  )
  const onLayout = useCallback(
    (w: number) => {
      viewW.current = w
      recompute()
    },
    [recompute],
  )

  return { atEnd, onScroll, onContentSize, onLayout, advance }
}
