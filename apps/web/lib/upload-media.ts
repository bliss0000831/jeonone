/**
 * 파일을 서버 API로 업로드. 서버에서 서비스 롤 키로 Supabase Storage에 저장.
 * RLS/인증 이슈 완전 우회.
 * 주의: Vercel serverless는 ~4.5MB 요청 본문 제한. 더 큰 파일은 추후 별도 처리.
 */
export async function uploadMedia(
  file: File,
  options?: { onProgress?: (percent: number) => void },
): Promise<{ url: string; type: 'image' | 'video' }> {
  // 클라이언트 사전 사이즈 체크 — 서버 전송 전 빠른 실패
  const isVideo = file.type.startsWith('video/')
  const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error(
      isVideo
        ? `동영상은 100MB 이하만 업로드 가능합니다 (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`
        : `이미지는 10MB 이하만 업로드 가능합니다 (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
    )
  }

  const formData = new FormData()
  formData.append('file', file)

  // onProgress 콜백이 있으면 XMLHttpRequest로 진행률 전달
  if (options?.onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) options.onProgress!(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        try {
          const parsed = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ url: parsed.url, type: parsed.type ?? (isVideo ? 'video' : 'image') })
          } else {
            reject(new Error(parsed?.error || `업로드 실패 (HTTP ${xhr.status})`))
          }
        } catch {
          reject(new Error(
            file.size > 4 * 1024 * 1024
              ? `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 이미지는 4MB 이하로 올려주세요.`
              : `업로드 실패 (HTTP ${xhr.status})`,
          ))
        }
      })
      xhr.addEventListener('error', () => reject(new Error('업로드 중 네트워크 오류가 발생했습니다')))
      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  // 응답이 JSON이 아닐 수도 있으므로 안전하게 파싱
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    if (!res.ok) {
      throw new Error(
        file.size > 4 * 1024 * 1024
          ? `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 이미지는 4MB 이하로 올려주세요.`
          : `업로드 실패 (HTTP ${res.status})`,
      )
    }
    throw new Error('업로드 응답을 읽지 못했습니다')
  }

  if (!res.ok) {
    throw new Error(parsed?.error || `업로드 실패 (HTTP ${res.status})`)
  }

  return { url: parsed.url, type: parsed.type ?? (isVideo ? 'video' : 'image') }
}
