/**
 * 테마 훅 — 사용자 선택 light/dark (기본 light).
 *
 * 저장소: AsyncStorage("gwangjang.theme.pref")
 * useColors() 헬퍼로 lightColors/darkColors 토글.
 */

import { useEffect, useState } from "react"
import { Appearance } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { lightColors, darkColors } from "@gwangjang/tokens"

const STORAGE_KEY = "gwangjang.theme.pref"

export type ThemePref = "light" | "dark" | "system"

let memPref: ThemePref = "light"
let hydrated = false
const listeners = new Set<() => void>()
function notify() {
  for (const l of listeners) l()
}

async function hydrate() {
  if (hydrated) return
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY)
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

export function useThemePref(): ThemePref {
  const [tick, setTick] = useState(0)
  useEffect(() => themePref.subscribe(() => setTick((x) => x + 1)), [])
  void tick
  return memPref
}

/** 실제 사용할 컬러 스킴 — system 이면 OS 설정 따름 */
export function useColorScheme(): "light" | "dark" {
  const pref = useThemePref()
  const [systemScheme, setSystemScheme] = useState<"light" | "dark">(
    () => Appearance.getColorScheme() ?? "light",
  )
  useEffect(() => {
    if (pref !== "system") return
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? "light")
    })
    return () => sub.remove()
  }, [pref])
  if (pref === "system") return systemScheme
  return pref
}

/** 현재 테마에 맞는 컬러 객체 — lightColors 또는 darkColors */
export function useColors() {
  const scheme = useColorScheme()
  return scheme === "dark" ? darkColors : lightColors
}

/**
 * useThemedStyles — StyleSheet.create() 를 테마에 반응하게 wrap.
 *
 * 사용:
 *   const styles = useThemedStyles((colors) => StyleSheet.create({
 *     wrap: { backgroundColor: colors.background },
 *     text: { color: colors.ink900 },
 *   }))
 *
 * 효과: 사용자가 다크 모드 토글 시 자동 재생성 → 즉시 다크 색상 적용
 */
import { useMemo } from "react"
export function useThemedStyles<T>(
  factory: (colors: any) => T,
): T {
  const colors = useColors()
  return useMemo(() => factory(colors), [colors])
}
