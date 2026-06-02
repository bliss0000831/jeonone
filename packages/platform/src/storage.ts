/**
 * KV 저장 추상화.
 *
 *   web:    localStorage (5MB 한도 / 동기)
 *   native: Capacitor Preferences (iOS UserDefaults / Android SharedPreferences)
 *
 * native 의 Preferences 가 더 안정적 (localStorage 는 WebView 에서 클리어 위험).
 * 보안 데이터(토큰 등)는 별도 secure storage 권장 (capacitor-secure-storage-plugin).
 */

import { isNativeSync } from "./platform"

export const storage = {
  async get(key: string): Promise<string | null> {
    if (isNativeSync()) {
      try {
        const { Preferences } = await import("@capacitor/preferences")
        const { value } = await Preferences.get({ key })
        return value ?? null
      } catch {
        return null
      }
    }
    if (typeof localStorage === "undefined") return null
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (isNativeSync()) {
      try {
        const { Preferences } = await import("@capacitor/preferences")
        await Preferences.set({ key, value })
        return
      } catch {
        // fallback to localStorage
      }
    }
    if (typeof localStorage === "undefined") return
    try {
      localStorage.setItem(key, value)
    } catch {
      // quota exceeded 등 무시
    }
  },

  async remove(key: string): Promise<void> {
    if (isNativeSync()) {
      try {
        const { Preferences } = await import("@capacitor/preferences")
        await Preferences.remove({ key })
        return
      } catch {}
    }
    if (typeof localStorage === "undefined") return
    try {
      localStorage.removeItem(key)
    } catch {}
  },

  async clear(): Promise<void> {
    if (isNativeSync()) {
      try {
        const { Preferences } = await import("@capacitor/preferences")
        await Preferences.clear()
        return
      } catch {}
    }
    if (typeof localStorage === "undefined") return
    try {
      localStorage.clear()
    } catch {}
  },

  /** JSON 편의 — 파싱 실패 시 null */
  async getJSON<T = any>(key: string): Promise<T | null> {
    const v = await storage.get(key)
    if (!v) return null
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  },

  async setJSON(key: string, value: any): Promise<void> {
    await storage.set(key, JSON.stringify(value))
  },
}
