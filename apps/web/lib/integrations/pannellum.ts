/**
 * Pannellum (오픈소스 360° 파노라마 뷰어) 스크립트 로더.
 *
 * 한 번만 <link> + <script> 삽입. 여러 컴포넌트에서 호출해도 안전.
 * https://pannellum.org/
 */

const SCRIPT_ID = "pannellum-sdk"
const STYLE_ID = "pannellum-css"
const VERSION = "2.5.6"
const SCRIPT_SRC = `https://cdn.jsdelivr.net/npm/pannellum@${VERSION}/build/pannellum.js`
const STYLE_SRC = `https://cdn.jsdelivr.net/npm/pannellum@${VERSION}/build/pannellum.css`

let scriptPromise: Promise<void> | null = null

export function loadPannellumScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if ((window as any).pannellum) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    // CSS
    if (!document.getElementById(STYLE_ID)) {
      const link = document.createElement("link")
      link.id = STYLE_ID
      link.rel = "stylesheet"
      link.href = STYLE_SRC
      document.head.appendChild(link)
    }

    // JS
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("Pannellum 로드 실패")))
      return
    }

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Pannellum 로드 실패"))
    document.head.appendChild(script)
  }).catch((err) => {
    scriptPromise = null
    throw err
  })

  return scriptPromise
}
