/**
 * Capacitor 네이티브 환경 감지 헬퍼.
 *
 * 사용처:
 *   - 카메라: native 면 Capacitor Camera, 웹이면 file input
 *   - 푸시: native 만 등록
 *   - 카카오 로그인: native 면 SDK, 웹이면 OAuth redirect
 *
 * 동적 import 라 web 빌드에 capacitor 코드 안 끼움 (번들 절감).
 */

let _platform: 'web' | 'ios' | 'android' | null = null

export async function getPlatform(): Promise<'web' | 'ios' | 'android'> {
  if (_platform) return _platform
  if (typeof window === 'undefined') return 'web'
  try {
    const { Capacitor } = await import('@capacitor/core')
    const platform = Capacitor.getPlatform() as 'web' | 'ios' | 'android'
    _platform = platform
    return platform
  } catch {
    _platform = 'web'
    return 'web'
  }
}

export async function isNative(): Promise<boolean> {
  const p = await getPlatform()
  return p === 'ios' || p === 'android'
}

export async function isWeb(): Promise<boolean> {
  const p = await getPlatform()
  return p === 'web'
}

/** 동기 — SSR / 빌드 시점엔 항상 web. 클라이언트 mount 후엔 정확. */
export function isNativeSync(): boolean {
  if (typeof window === 'undefined') return false
  // window.Capacitor 가 native 환경에서 자동 주입됨
  const cap = (window as any).Capacitor
  if (!cap) return false
  const p = cap.getPlatform?.()
  return p === 'ios' || p === 'android'
}
