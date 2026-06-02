/**
 * 업로드 파일 검증 — MIME 화이트리스트 + 매직 바이트.
 *
 * 클라가 신고한 Content-Type 만 믿으면 SVG/HTML/스크립트 위장 업로드 가능 →
 * R2 가 그 객체를 노출하면 stored XSS / phishing 호스팅 가능.
 * 모든 업로드 라우트에서 공유.
 */

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
])

export const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
])

/**
 * SVG 는 임의 자바스크립트 실행 가능 → 전면 차단.
 */
export function isBannedFile(file: { name?: string; type?: string }): boolean {
  if (file.type === "image/svg+xml") return true
  if (file.name && /\.svg$/i.test(file.name)) return true
  // 잠재적 실행 파일 차단
  if (file.name && /\.(php|exe|bat|sh|cmd|js|html|htm|jsp|asp|aspx)$/i.test(file.name)) return true
  return false
}

export type FileKind = "image" | "video"

/**
 * MIME 가 허용 목록에 있는지 + 매직 바이트가 실제로 그 형식인지 검증.
 */
export function verifyFileContent(buffer: Buffer, kind: FileKind): boolean {
  if (buffer.length < 4) return false
  const b = buffer
  if (kind === "image") {
    // JPEG: FF D8 FF
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true
    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true
    // GIF: 47 49 46 38
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true
    // WebP: RIFF .... WEBP
    if (
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b.length >= 12 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    ) {
      return true
    }
    // HEIC: ftyp box + brand verification to distinguish from MP4/MOV
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(...b.slice(8, 12))
      if (['heic', 'heix', 'mif1', 'hevc'].includes(brand)) return true
      return false
    }
    return false
  }
  if (kind === "video") {
    // MP4 / MOV / m4v: ftyp box (offset 4)
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true
    // WebM: 1A 45 DF A3
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true
    return false
  }
  return false
}

/**
 * 파일 검증 통합 헬퍼. 통과하면 { kind } 반환, 실패하면 { error, status } 반환.
 */
export function validateUploadedFile(
  file: File,
  buffer?: ArrayBuffer | Uint8Array,
): { kind: FileKind } | { error: string; status: number } {
  if (isBannedFile(file)) {
    return {
      error: "보안상 업로드할 수 없는 파일 형식입니다",
      status: 400,
    }
  }
  const isImage = ALLOWED_IMAGE_MIMES.has(file.type)
  const isVideo = ALLOWED_VIDEO_MIMES.has(file.type)
  if (!isImage && !isVideo) {
    return {
      error: "이미지(JPEG/PNG/WebP/GIF/HEIC) 또는 동영상(MP4/WebM/MOV) 만 업로드 가능합니다",
      status: 400,
    }
  }
  const kind: FileKind = isImage ? "image" : "video"
  if (buffer) {
    const buf = Buffer.from(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer)
    if (!verifyFileContent(buf, kind)) {
      return {
        error: "파일 내용이 확장자/MIME 타입과 일치하지 않습니다",
        status: 400,
      }
    }
  }
  return { kind }
}
