import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { uploadImageToR2, uploadRawToR2 } from '@/lib/integrations/r2'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'
import { validateUploadedFile, verifyFileContent } from '@gwangjang/api-client/file-validation'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 게시판 업로드 → Cloudflare R2
 *   - 이미지: WebP 변환 + 1920px 리사이즈
 *   - 동영상: 원본 그대로
 */
export async function POST(request: NextRequest) {
  try {
    // 사용자 인증 (쿠키 + Bearer 모두 지원 — 모바일 앱 호환)
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    // 차단 사용자 체크
    const banRes = await banGuardResponse(user.id)
    if (banRes) return banRes

    // Rate limit — 유저당 5분 20개
    const limited = await enforceRateLimit(request, 'upload', user.id)
    if (limited) return limited

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    // MIME 화이트리스트 + SVG/실행파일 차단
    const validation = validateUploadedFile(file)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }
    const { kind } = validation
    const isImage = kind === 'image'
    const isVideo = kind === 'video'

    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: isVideo ? '동영상은 100MB 이하' : '이미지는 10MB 이하' },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 매직바이트 — 클라가 신고한 MIME 위장 차단
    if (!verifyFileContent(buffer, kind)) {
      return NextResponse.json(
        { error: '파일 형식이 올바르지 않습니다 (확장자 위조 의심)' },
        { status: 400 },
      )
    }

    const result = isImage
      ? await uploadImageToR2({ folder: 'board', userId: user.id, file: buffer, originalName: file.name })
      : await uploadRawToR2({
          folder: 'board',
          userId: user.id,
          file: buffer,
          originalName: file.name,
          contentType: file.type,
        })

    return NextResponse.json({
      url: result.url,
      type: isVideo ? 'video' : 'image',
      size: result.size,
    })
  } catch (err: any) {
    console.error('[board/upload] error:', err)
    return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
  }
}
