/**
 * Kakao JavaScript SDK 로더 + 공유 유틸
 *
 * 사용처: 모든 상세페이지 공유 시트의 "카카오톡 공유" 버튼
 *
 * 루트 레이아웃에서 kakao.js 를 afterInteractive 로 이미 주입하므로,
 * 여기서는 window.Kakao 가 나타날 때까지 대기 → init → resolve 만 담당.
 */

declare global {
  interface Window {
    Kakao: any
  }
}

const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"

let loadPromise: Promise<any> | null = null

async function waitForKakao(timeoutMs = 4000): Promise<any> {
  const start = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (typeof window !== "undefined" && window.Kakao) return window.Kakao
    if (Date.now() - start > timeoutMs) return null
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** Kakao SDK를 한 번만 로드하고 init 까지 보장 */
export function loadKakaoSdk(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"))
  if (window.Kakao?.isInitialized?.()) return Promise.resolve(window.Kakao)
  if (loadPromise) return loadPromise

  loadPromise = new Promise(async (resolve, reject) => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_ID
    if (!appKey) {
      reject(new Error("NEXT_PUBLIC_KAKAO_APP_ID 가 설정되지 않았습니다"))
      return
    }

    // 1) 루트 레이아웃이 이미 주입한 SDK 를 기다린다
    let Kakao = await waitForKakao(2000)

    // 2) 없으면 직접 주입
    if (!Kakao) {
      await new Promise<void>((res, rej) => {
        const script = document.createElement("script")
        script.src = KAKAO_SDK_URL
        script.async = true
        script.onload = () => res()
        script.onerror = () => rej(new Error("Kakao SDK 로드 실패"))
        document.head.appendChild(script)
      }).catch(reject)
      Kakao = await waitForKakao(3000)
    }

    if (!Kakao) {
      reject(new Error("Kakao SDK 를 불러올 수 없습니다"))
      return
    }

    try {
      if (!Kakao.isInitialized?.()) Kakao.init(appKey)
      resolve(Kakao)
    } catch (err) {
      reject(err)
    }
  })

  return loadPromise
}

export interface KakaoShareMeta {
  title: string
  description?: string
  imageUrl?: string
  /** 생략시 현재 페이지 URL */
  url?: string
}

/** 카카오톡 공유 — Feed 템플릿 */
export async function shareToKakao(meta: KakaoShareMeta) {
  const Kakao = await loadKakaoSdk()
  const url =
    meta.url ?? (typeof window !== "undefined" ? window.location.href : "")
  const imageUrl =
    meta.imageUrl ||
    (typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "")
  Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: meta.title,
      description: meta.description || "",
      imageUrl,
      link: { mobileWebUrl: url, webUrl: url },
    },
    buttons: [
      {
        title: "자세히 보기",
        link: { mobileWebUrl: url, webUrl: url },
      },
    ],
  })
}
