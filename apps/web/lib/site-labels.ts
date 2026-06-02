// 사이트 라벨 — 슈퍼관리자가 전역 변경 가능한 텍스트 (서버 전용)
//
// 서버: getAllLabels() 로 한번에 fetch (React cache + Next ISR)
// 클라이언트: components/site-labels-client.tsx 의 SiteLabelsProvider 사용
//
// 이 파일은 next/headers 를 transitively 사용하므로 client 컴포넌트에서
// 절대 import 하지 말 것 — 빌드 에러 (Pages Router 호환성).

import "server-only"
import { createClient } from "@/lib/supabase/server"

export interface SiteLabel {
  key: string
  value: string
  fallback: string
  description: string | null
  group_name: string
  sort_order: number
  max_length: number | null
  image_url: string | null
  recommended_size: string | null
}

// LabelMap 타입은 components/site-labels-client.tsx 에 동일하게 정의됨
// (이 파일을 client 에서 import 하면 빌드 깨지므로 별도 정의)
export type LabelMap = Record<string, string>

/**
 * 서버에서 모든 라벨을 한번에 fetch.
 * 결과를 page/layout 의 SiteLabelsProvider 로 흘려보냄.
 */
export async function getAllLabels(): Promise<LabelMap> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("site_labels")
      .select("key, value, fallback")
    if (!data) return {}
    const map: LabelMap = {}
    for (const row of data) {
      map[row.key] = row.value || row.fallback
    }
    return map
  } catch {
    return {}
  }
}

/** 이미지 URL 만 따로 fetch — 라벨 텍스트와는 별개로 관리 */
export async function getAllLabelImages(): Promise<LabelMap> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("site_labels")
      .select("key, image_url")
    if (!data) return {}
    const map: LabelMap = {}
    for (const row of data) {
      if (row.image_url) map[row.key] = row.image_url
    }
    return map
  } catch {
    return {}
  }
}

/**
 * 모든 라벨 + 메타 (슈퍼관리자 페이지용)
 */
export async function getAllLabelsWithMeta(): Promise<SiteLabel[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("site_labels")
      .select("*")
      .order("group_name", { ascending: true })
      .order("sort_order", { ascending: true })
    return (data as SiteLabel[]) ?? []
  } catch {
    return []
  }
}

/**
 * 토큰 치환 — 현재 광장 도시명 등을 동적으로 채움
 */
export function interpolateLabel(
  text: string,
  vars: Record<string, string | undefined>,
): string {
  if (!text) return ""
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v == null ? "" : String(v)
  })
}
