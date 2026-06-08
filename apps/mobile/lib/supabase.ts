/**
 * Supabase RN 클라이언트.
 *
 * 광장 web 의 lib/supabase/client.ts 와 동일 anon key + URL 사용,
 * 단 RN 환경에 맞춰 AsyncStorage 기반 세션 영속화.
 *
 * 환경변수:
 *   - EXPO_PUBLIC_SUPABASE_URL
 *   - EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * 둘 다 apps/mobile/.env 에 정의 필요 (값은 광장 web 의 .env.local 과 동일).
 *
 * Bearer token 으로 광장 API 호출 시:
 *   const { data: { session } } = await supabase.auth.getSession()
 *   fetch('https://jeonwondiary.vercel.app/api/...', {
 *     headers: { Authorization: `Bearer ${session?.access_token}` }
 *   })
 */

import "react-native-url-polyfill/auto"
import { Platform } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@gwangjang/types/database"

const isWeb = Platform.OS === "web"

/**
 * 보안 어댑터 — JWT 를 native 에선 SecureStore (Keychain/Keystore) 에 저장.
 *
 * 점진 마이그레이션: 처음 getItem 호출 시 SecureStore 가 비어 있고 AsyncStorage 에
 * 레거시 값이 있으면 SecureStore 로 1회 이관 후 AsyncStorage 에서 제거.
 * 기존 로그인 세션 강제 만료 없음 — 다음 앱 실행 시 자동 이관.
 *
 * Web 은 SecureStore 가 없으므로 AsyncStorage (localStorage 래퍼) 그대로.
 */
const SecureAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key)
    let v = await SecureStore.getItemAsync(key).catch(() => null)
    if (v == null) {
      const legacy = await AsyncStorage.getItem(key).catch(() => null)
      if (legacy != null) {
        await SecureStore.setItemAsync(key, legacy).catch(() => {})
        await AsyncStorage.removeItem(key).catch(() => {})
        v = legacy
      }
    }
    return v
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      await AsyncStorage.setItem(key, value)
      return
    }
    await SecureStore.setItemAsync(key, value).catch(() => {})
  },
  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      await AsyncStorage.removeItem(key)
      return
    }
    await SecureStore.deleteItemAsync(key).catch(() => {})
    await AsyncStorage.removeItem(key).catch(() => {})
  },
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // dev 시 즉시 알아채게 명시적 throw
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다. " +
      "apps/mobile/.env 에 광장 web 의 .env.local 과 동일 값을 넣어주세요.",
  )
}

let _client: SupabaseClient<Database> | null = null

/**
 * 싱글톤 — 모듈 레벨에서 한 번만 생성.
 * RN Hot Reload 시 다중 인스턴스 방지.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client
  _client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      storage: SecureAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // web (Expo web) 은 OAuth redirect 의 ?code= / #access_token= 자동 감지 ON
      // native 는 URL 기반이 아니라 expo-web-browser 직접 처리하므로 OFF
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  })
  return _client
}

/**
 * 광장 API 호출용 fetch wrapper.
 * 자동으로 Bearer token + Content-Type 부착.
 *
 * 사용:
 *   const res = await gwangjangFetch('/api/account-upgrade', {
 *     method: 'POST',
 *     body: JSON.stringify({ requested_type, business_name }),
 *   })
 *   if (!res.ok) throw new Error(...)
 *   return res.json()
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://jeonwondiary.vercel.app"

export async function gwangjangFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = new Headers(init.headers ?? {})
  // FormData 는 fetch 가 boundary 포함된 multipart Content-Type 을 자동 생성 —
  // 우리가 application/json 으로 강제로 박으면 업로드가 깨짐. body 가 FormData
  // 인 경우 Content-Type 자동 결정에 맡김.
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json")
  }
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`)
  }
  // 현재 광장 컨텍스트를 헤더로 전달 — web getCurrentPlaza() 가 x-plaza 헤더 읽음
  // (lib/plaza 의 cached 값 사용; circular import 회피용 dynamic import)
  try {
    const { getCachedPlaza } = await import("./plaza")
    const plaza = getCachedPlaza()
    if (plaza?.id && !headers.has("x-plaza")) {
      headers.set("x-plaza", plaza.id)
    }
  } catch (e) {
    console.warn("[gwangjangFetch] plaza header not set:", (e as Error)?.message)
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })
}

/**
 * 이미지 업로드 — 광장 web POST /api/upload 와 동일.
 * @param localUri expo-image-picker URI
 * @param folder web ALLOWED_FOLDERS 키 (avatar/profile/property/secondhand/...)
 *               미지정 시 'misc' 로 들어감 → R2 정리/CDN 정책 깨짐
 */
// 웹 /api/upload 와 동일한 사이즈 제한
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024 // 100MB

export async function uploadImage(
  localUri: string,
  folder?: string,
): Promise<string | null> {
  try {
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const filename = localUri.split("/").pop() ?? `upload-${Date.now()}.jpg`
    const ext = (filename.split(".").pop() ?? "jpg").toLowerCase()
    // web /api/upload 허용 MIME 과 1:1 — iOS HEIC/HEIF + 동영상 포함
    const mime =
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "gif" ? "image/gif" :
      ext === "heic" ? "image/heic" :
      ext === "heif" ? "image/heif" :
      ext === "mp4" ? "video/mp4" :
      ext === "mov" ? "video/quicktime" :
      ext === "webm" ? "video/webm" :
      ext === "m4v" ? "video/x-m4v" :
      "image/jpeg"

    const isVideo = mime.startsWith("video/")
    const maxBytes = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES

    // 파일 사이즈 사전 검증 — fetch HEAD 로 content-length 또는 RN expo-file-system 사용
    // expo-file-system 없이는 정확한 사이즈 측정 어려움 → 일단 fetch 로 blob 조회 + size 확인
    try {
      const probe = await fetch(localUri)
      const blob = await probe.blob()
      if (blob.size > maxBytes) {
        const limitMB = Math.floor(maxBytes / (1024 * 1024))
        const actualMB = (blob.size / (1024 * 1024)).toFixed(1)
        const kind = isVideo ? "동영상" : "이미지"
        console.warn(
          `[uploadImage] ${kind} 파일이 너무 큽니다: ${actualMB}MB (한도 ${limitMB}MB)`,
        )
        // 호출부가 size error 를 인지하도록 throw — alert 표시 책임은 호출부
        throw new Error(`${kind}은(는) ${limitMB}MB 이하만 업로드 가능합니다 (현재 ${actualMB}MB)`)
      }
    } catch (sizeErr) {
      // probe 실패는 무시 (네트워크 URI 가 아닐 수도 있음). 단, 명시적 size 오류면 throw.
      if ((sizeErr as Error)?.message?.includes("MB")) throw sizeErr
    }

    const form = new FormData()
    form.append("file", { uri: localUri, name: filename, type: mime } as any)
    if (folder) form.append("folder", folder)
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const r = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers,
      body: form,
    })
    if (!r.ok) return null
    const data = await r.json().catch(() => ({}))
    return (data?.url as string) ?? null
  } catch (err) {
    // size 검증 실패 등 — null 대신 에러를 호출부로 전파해서 alert
    if ((err as Error)?.message?.includes("MB")) throw err
    return null
  }
}

