/**
 * 언어 설정 — 사용자 선호 locale 영속화 (AsyncStorage).
 *
 * 현재는 한국어 단일 지원, 향후 영어/중국어 추가 시 i18n 라이브러리(i18n-js 등) 연동.
 * 인프라만 마련하고 실제 번역 키는 차후 도입.
 *
 * 우선순위: 사용자 선택 > device locale > "ko"
 */

import { useEffect, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

const STORAGE_KEY = "gwangjang.locale.pref"

export type LocalePref = "auto" | "ko" | "en"
export const LOCALE_LABEL: Record<LocalePref, string> = {
  auto: "기기 설정 따름",
  ko: "한국어",
  en: "English (예정)",
}

let memPref: LocalePref = "auto"
let hydrated = false
const listeners = new Set<() => void>()
function notify() {
  for (const l of listeners) l()
}

async function hydrate() {
  if (hydrated) return
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY)
    if (v === "ko" || v === "en" || v === "auto") memPref = v
  } catch {}
  hydrated = true
  notify()
}
if (typeof window !== "undefined") hydrate()

export const localePref = {
  get(): LocalePref {
    return memPref
  },
  async set(v: LocalePref) {
    memPref = v
    try {
      await AsyncStorage.setItem(STORAGE_KEY, v)
    } catch {}
    notify()
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  ready: hydrate,
}

export function useLocalePref(): LocalePref {
  const [tick, setTick] = useState(0)
  useEffect(() => localePref.subscribe(() => setTick((x) => x + 1)), [])
  void tick
  return memPref
}

/** 실제 사용할 locale (auto 일 때 device locale 추정) */
export function useLocale(): "ko" | "en" {
  const pref = useLocalePref()
  if (pref === "ko") return "ko"
  if (pref === "en") return "en"
  // auto: 현재는 한국어 단일 지원이므로 ko 고정. 향후 i18n 도입 시 Localization.locale 사용.
  return "ko"
}
