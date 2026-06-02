/**
 * 웹용 테마 훅 — RN 모바일 버전의 web 미러.
 *
 * Metro 가 .web.ts 를 .ts 보다 우선 선택하므로, 같은 export 시그니처를 유지해야
 * settings.tsx 가 import 한 useThemePref / themePref 가 web 환경에서도 동작.
 *
 * 웹은 SSR 호환을 위해 클라이언트에서만 localStorage 접근.
 */

import { useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "gwangjang.theme.pref"

export type ThemePref = "light" | "dark" | "system"

let memPref: ThemePref = "light"
let hydrated = false
const listeners = new Set<() => void>()
function notify() {
  for (const l of listeners) l()
}

function hydrate() {
  if (hydrated) return
  if (typeof window === "undefined") {
    hydrated = true
    return
  }
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === "light" || v === "dark" || v === "system") memPref = v
  } catch {}
  hydrated = true
  notify()
}
if (typeof window !== "undefined") hydrate()

export const themePref = {
  get(): ThemePref {
    return memPref
  },
  async set(v: ThemePref) {
    memPref = v
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, v)
      }
    } catch {}
    notify()
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  ready: async () => hydrate(),
}

export function useThemePref(): ThemePref {
  const [tick, setTick] = useState(0)
  useEffect(() => themePref.subscribe(() => setTick((x) => x + 1)), [])
  void tick
  return memPref
}

export function useColorScheme(): "light" | "dark" {
  const pref = useThemePref()
  const [systemScheme, setSystemScheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light"
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
  })
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => setSystemScheme(e.matches ? "dark" : "light")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [pref])
  if (pref === "system") return systemScheme
  return pref
}

// useColors helper — light/dark colors 동적 반환
// require avoid circular
export function useColors() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tokens = require("@gwangjang/tokens")
  const scheme = useColorScheme()
  return scheme === "dark" ? tokens.darkColors : tokens.lightColors
}

/** useThemedStyles — StyleSheet.create() 를 테마 반응하게 wrap (web 미러). */
export function useThemedStyles<T>(
  factory: (colors: any) => T,
): T {
  const colors = useColors()
  return useMemo(() => factory(colors), [colors])
}
