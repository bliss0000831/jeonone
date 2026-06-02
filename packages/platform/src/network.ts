/**
 * 네트워크 상태 추상화.
 *
 *   web:    navigator.onLine + online/offline 이벤트
 *   native: Capacitor Network (셀룰러 / WiFi / 4G/5G 구분 가능)
 */

import { isNativeSync } from "./platform"

export interface NetworkStatus {
  connected: boolean
  /** native 만 정확. web 은 unknown */
  type?: "wifi" | "cellular" | "none" | "unknown"
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (isNativeSync()) {
    try {
      const { Network } = await import("@capacitor/network")
      const status = await Network.getStatus()
      return {
        connected: status.connected,
        type: status.connectionType as any,
      }
    } catch {
      // fallback
    }
  }
  if (typeof navigator === "undefined") {
    return { connected: true, type: "unknown" }
  }
  return {
    connected: navigator.onLine,
    type: "unknown",
  }
}

export type NetworkListener = (status: NetworkStatus) => void

/**
 * 연결 상태 변화 구독. cleanup 함수 반환.
 */
export async function onNetworkChange(listener: NetworkListener): Promise<() => void> {
  if (isNativeSync()) {
    try {
      const { Network } = await import("@capacitor/network")
      const handle = await Network.addListener("networkStatusChange", (status) => {
        listener({
          connected: status.connected,
          type: status.connectionType as any,
        })
      })
      return () => handle.remove()
    } catch {}
  }
  if (typeof window === "undefined") return () => {}

  const onOnline = () => listener({ connected: true, type: "unknown" })
  const onOffline = () => listener({ connected: false, type: "none" })
  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOffline)
  return () => {
    window.removeEventListener("online", onOnline)
    window.removeEventListener("offline", onOffline)
  }
}
