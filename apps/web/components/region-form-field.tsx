"use client"

/**
 * 지역(시/군) 자동 태깅 폼 필드.
 *
 * - 마운트 시 profile.sub_region (가입 시 선택한 지역) 으로 자동 채움
 * - 현재 광장의 coverage 목록을 옵션으로
 * - 사용자가 변경 가능
 *
 * 모바일 RegionFormField 와 1:1 — 글 작성/수정 시 sub_region 컬럼에 저장.
 */

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { MapPin } from "lucide-react"

interface Props {
  value: string
  onChange: (next: string) => void
  /** 라벨 텍스트 (기본 "지역") */
  label?: string
  /** required (기본 false) */
  required?: boolean
}

export function RegionFormField({
  value,
  onChange,
  label = "지역",
  required = false,
}: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    ;(async () => {
      // 1) profile.sub_region 으로 기본값 — 비어있으면만
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && !value) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("sub_region")
            .eq("id", user.id)
            .maybeSingle()
          const def = (profile as any)?.sub_region
          if (def && !cancelled) onChange(def)
        }
      } catch {}

      // 2) 광장 coverage 옵션 로드
      try {
        const plaza = getCurrentPlazaClient()
        if (!plaza) {
          setLoading(false)
          return
        }
        const { data: row } = await supabase
          .from("plazas")
          .select("coverage")
          .eq("id", plaza)
          .maybeSingle()
        const cov = (row as any)?.coverage
        const list: string[] = Array.isArray(cov) ? cov.filter((x) => typeof x === "string") : []
        if (!cancelled) setOptions(list)
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={loading}
        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
      >
        <option value="">{loading ? "지역 로딩 중..." : "지역 선택"}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
