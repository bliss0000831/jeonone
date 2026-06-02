"use client"

// 사이트 라벨 클라이언트 Provider + Hook
//
// 서버 layout 에서 getAllLabels() 결과를 initial 로 흘려보내고,
// 클라이언트에서는 useLabel("nav.realestate.label", "부동산") 으로 사용.
//
// 주의: 이 파일은 서버 전용 lib (next/headers 등) 를 import 하지 않는다.
// 타입과 토큰 치환 로직을 내부에 정의해 클라이언트 번들에 들어가도 안전.

import { createContext, useContext, useMemo } from "react"

export type LabelMap = Record<string, string>

function interpolateLabel(
  text: string,
  vars: Record<string, string | undefined>,
): string {
  if (!text) return ""
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v == null ? "" : String(v)
  })
}

interface Ctx {
  labels: LabelMap
  images: LabelMap
  vars: Record<string, string | undefined>
}

const SiteLabelsContext = createContext<Ctx>({ labels: {}, images: {}, vars: {} })

export function SiteLabelsProvider({
  initial,
  images,
  vars,
  children,
}: {
  initial: LabelMap
  images?: LabelMap
  vars?: Record<string, string | undefined>
  children: React.ReactNode
}) {
  const value = useMemo(
    () => ({ labels: initial, images: images ?? {}, vars: vars ?? {} }),
    [initial, images, vars],
  )
  return <SiteLabelsContext.Provider value={value}>{children}</SiteLabelsContext.Provider>
}

/**
 * useLabel — 라벨 키로 텍스트 조회. 미존재 시 fallback. 토큰 자동 치환.
 */
export function useLabel(key: string, fallback: string): string {
  const { labels, vars } = useContext(SiteLabelsContext)
  const raw = labels[key] ?? fallback
  return interpolateLabel(raw, vars)
}

/**
 * useLabelImage — 슈퍼관리자가 업로드한 이미지 URL. 없으면 null.
 */
export function useLabelImage(key: string): string | null {
  const { images } = useContext(SiteLabelsContext)
  return images[key] || null
}
