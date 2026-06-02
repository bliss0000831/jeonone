/**
 * 카메라 / 갤러리 추상화.
 *
 *   web:    HTML <input type="file" accept="image/*"> 트리거
 *   native: Capacitor Camera (카메라 / 갤러리 선택 modal)
 *
 * 호출자는 항상 같은 인터페이스 사용:
 *   const file = await pickImage({ source: 'camera' | 'gallery' | 'prompt' })
 *   if (file) uploadToR2(file)
 *
 * 결과: web/native 모두 File 또는 Blob 반환.
 */

import { isNativeSync } from "./platform"

export type ImageSource = "camera" | "gallery" | "prompt"

export interface PickImageOptions {
  source?: ImageSource
  quality?: number       // 0-100, 기본 80
  maxWidth?: number      // px, 기본 1920
  maxHeight?: number     // px, 기본 1920
  multiple?: boolean     // web 전용, native 는 single
}

export interface PickedImage {
  blob: Blob
  filename: string
  mimeType: string
}

/**
 * 단일 이미지 선택. 사용자 취소 시 null.
 */
export async function pickImage(opts: PickImageOptions = {}): Promise<PickedImage | null> {
  const {
    source = "prompt",
    quality = 80,
    maxWidth = 1920,
    maxHeight = 1920,
  } = opts

  if (isNativeSync()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera")
      const sourceMap = {
        camera: CameraSource.Camera,
        gallery: CameraSource.Photos,
        prompt: CameraSource.Prompt,
      } as const
      const photo = await Camera.getPhoto({
        quality,
        width: maxWidth,
        height: maxHeight,
        resultType: CameraResultType.Uri,
        source: sourceMap[source],
        correctOrientation: true,
      })
      if (!photo.webPath) return null
      // webPath 를 fetch 해서 Blob
      const res = await fetch(photo.webPath)
      const blob = await res.blob()
      const ext = (photo.format || "jpeg").toLowerCase()
      return {
        blob,
        filename: `image-${Date.now()}.${ext}`,
        mimeType: blob.type || `image/${ext}`,
      }
    } catch (err: any) {
      // 사용자 취소는 throw 하므로 null 반환
      if (err?.message?.includes("cancelled") || err?.message?.includes("denied")) {
        return null
      }
      throw err
    }
  }

  // Web — input file
  return new Promise((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    if (source === "camera") {
      // 모바일 web 에서 카메라 강제
      input.capture = "environment"
    }
    const timeout = setTimeout(() => {
      reject(new Error("pickImage timeout: no file selected within 30 seconds"))
    }, 30_000)
    input.onchange = () => {
      clearTimeout(timeout)
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve({
        blob: file,
        filename: file.name,
        mimeType: file.type,
      })
    }
    input.oncancel = () => {
      clearTimeout(timeout)
      resolve(null)
    }
    input.click()
  })
}

/**
 * 다중 이미지 선택 (web). native 는 단일만 지원하므로 array 반환이지만 1개.
 */
export async function pickImages(opts: PickImageOptions = {}): Promise<PickedImage[]> {
  if (isNativeSync()) {
    const single = await pickImage(opts)
    return single ? [single] : []
  }

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.multiple = true
    if (opts.source === "camera") input.capture = "environment"
    input.onchange = () => {
      const files = Array.from(input.files || [])
      resolve(
        files.map((f) => ({
          blob: f,
          filename: f.name,
          mimeType: f.type,
        })),
      )
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}
