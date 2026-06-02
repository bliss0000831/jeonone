/**
 * 광장별 사업자 정보 (RN) — 약관·면책 띠·결제 동의 등에 주입.
 *
 * 현재 광장의 plazas.business_info 를 Supabase 에서 직접 조회.
 * 5분 메모리 캐시 (광장 전환 시 자동 무효화).
 */

import { useEffect, useState } from "react"
import { getSupabase } from "./supabase"
import { useCurrentPlaza } from "./plaza"
import type { LegalBusinessInfo } from "@gwangjang/features/legal"

const EMPTY: LegalBusinessInfo = {
  business_name: "",
  ceo_name: "",
  business_number: "",
  mailorder_number: "",
  address: "",
  phone: "",
  email: "",
  job_info_number: "",
  privacy_officer: "",
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: LegalBusinessInfo }>()

/** 로그아웃 시 호출 — stale 사업자 정보 방지 */
export function clearPlazaBusinessInfoCache() {
  cache.clear()
}

function normalize(raw: unknown): LegalBusinessInfo {
  if (!raw || typeof raw !== "object") return EMPTY
  const r = raw as Record<string, unknown>
  return {
    business_name:    typeof r.business_name === "string" ? r.business_name : "",
    ceo_name:         typeof r.ceo_name === "string" ? r.ceo_name : "",
    business_number:  typeof r.business_number === "string" ? r.business_number : "",
    mailorder_number: typeof r.mailorder_number === "string" ? r.mailorder_number : "",
    address:          typeof r.address === "string" ? r.address : "",
    phone:            typeof r.phone === "string" ? r.phone : "",
    email:            typeof r.email === "string" ? r.email : "",
    job_info_number:  typeof r.job_info_number === "string" ? r.job_info_number : "",
    privacy_officer:  typeof r.privacy_officer === "string" ? r.privacy_officer : "",
  }
}

export async function fetchPlazaBusinessInfo(plazaId: string): Promise<LegalBusinessInfo> {
  const hit = cache.get(plazaId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data

  try {
    const { data } = await getSupabase()
      .from("plazas")
      .select("business_info")
      .eq("id", plazaId)
      .single()
    const info = normalize((data as { business_info?: unknown } | null)?.business_info)
    cache.set(plazaId, { at: Date.now(), data: info })
    return info
  } catch {
    return EMPTY
  }
}

/** React hook — 현재 광장 사업자 정보. 광장 전환 시 자동 갱신. */
export function usePlazaBusinessInfo(): LegalBusinessInfo {
  const plazaId = useCurrentPlaza()
  const [info, setInfo] = useState<LegalBusinessInfo>(() => {
    const hit = cache.get(plazaId)
    return hit?.data ?? EMPTY
  })

  useEffect(() => {
    let mounted = true
    fetchPlazaBusinessInfo(plazaId).then((next) => {
      if (mounted) setInfo(next)
    })
    return () => {
      mounted = false
    }
  }, [plazaId])

  return info
}
