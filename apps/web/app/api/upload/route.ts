import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { uploadImageToR2, uploadRawToR2 } from '@/lib/integrations/r2'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'
import { SUPER_ADMIN_COOKIE, verifySuperAdminToken } from '@/lib/services/super-admin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 범용 파일 업로드 → Cloudflare R2
 *   - 이미지: WebP 변환 + 1920px 리사이즈 (용량 60~70% ↓)
 *   - 동영상/기타: 원본 그대로
 *
 * 인증:
 *   1) Supabase 일반 사용자 (대부분의 경우)
 *   2) 슈퍼어드민 쿠키 (gwangjang.app/admin 콘솔에서 hub_background 같은 글로벌
 *      에셋 업로드 시 — supabase 계정 없이도 통과)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    // 슈퍼어드민 쿠키 fallback — 허브 콘솔에서 supabase 계정 없이 업로드 가능하게
    let isSuperAdmin = false
    if (!user) {
      const c = await cookies()
      const token = c.get(SUPER_ADMIN_COOKIE)?.value
      isSuperAdmin = await verifySuperAdminToken(token)
    }

    if (!user && !isSuperAdmin) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    // 차단 사용자 체크 (슈퍼어드민은 제외)
    if (user) {
      const banRes = await banGuardResponse(user.id)
      if (banRes) return banRes
    }

    // Rate limit — 유저당 5분 20개 (슈퍼어드민은 'super' sentinel 로 별도 카운트)
    const rateLimitKey = user?.id ?? 'super-admin'
    const limited = await enforceRateLimit(request, 'upload', rateLimitKey)
    if (limited) return limited

    const formData = await request.formData()
    const file = formData.get('file') as File
    // 폴더 화이트리스트 — 임의 폴더 키 생성 방어 (R2 키 조작/저장소 비용 폭증 방지)
    const ALLOWED_FOLDERS = new Set([
      'misc', 'property', 'secondhand', 'sharing', 'group_buying', 'local_food',
      'jobs', 'new_store', 'club', 'interior', 'moving', 'cleaning', 'repair',
      'board', 'avatar', 'profile', 'highlight', 'review',
      'hub', // 슈퍼어드민 hub_background
      'hero', 'banner',
    ])
    const rawFolder = ((formData.get('folder') as string) || 'misc')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32) || 'misc'
    const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : 'misc'

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    // ── MIME 화이트리스트 (클라 신고 MIME 그대로 신뢰하지 않음)
    const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
    const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'])

    const isImage = ALLOWED_IMAGE.has(file.type)
    const isVideo = ALLOWED_VIDEO.has(file.type)

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: '이미지(JPEG/PNG/WebP/GIF/HEIC) 또는 동영상(MP4/WebM/MOV) 만 업로드 가능합니다' },
        { status: 400 },
      )
    }
    // SVG 는 <script> 주입 / onerror XSS 벡터 → 업로드 전면 차단
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      return NextResponse.json(
        { error: '보안상 SVG 는 업로드할 수 없습니다. PNG/JPG/WEBP 를 사용해 주세요.' },
        { status: 400 },
      )
    }

    // 슈퍼관리자 토큰은 탈취 시 무제한 업로드 폭주 위험 → 엄격한 cap
    // 이미지 5MB / 비디오 비허용 (hub_background 등은 이미지로 충분)
    const maxSize = isSuperAdmin && !user
      ? (isVideo ? 0 : 5 * 1024 * 1024)
      : (isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024)
    if (isSuperAdmin && !user && isVideo) {
      return NextResponse.json(
        { error: '슈퍼 업로드는 이미지만 허용됩니다' },
        { status: 400 },
      )
    }
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: isVideo ? '동영상은 100MB 이하여야 합니다' : '이미지는 10MB 이하여야 합니다',
        },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // ── 매직바이트 검증 — MIME 위장 차단
    const verifyMagicBytes = (): boolean => {
      if (buffer.length < 4) return false
      const b = buffer
      if (isImage) {
        // JPEG: FF D8 FF
        if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true
        // PNG: 89 50 4E 47
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true
        // GIF: 47 49 46 38
        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true
        // WebP: RIFF .... WEBP
        if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length >= 12 &&
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true
        // HEIC: ftyp box at offset 4 (헤더 12바이트 안에 'ftyp' 시그니처)
        if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true
        return false
      }
      if (isVideo) {
        // MP4 / MOV / m4v: ftyp box (offset 4)
        if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true
        // WebM: 1A 45 DF A3
        if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true
        return false
      }
      return false
    }
    if (!verifyMagicBytes()) {
      return NextResponse.json(
        { error: '파일 형식이 올바르지 않습니다 (확장자 위조 의심)' },
        { status: 400 },
      )
    }

    // 슈퍼어드민 업로드는 'hub' 폴더의 'super' 서브로 — 일반 사용자 폴더와 격리
    const userIdForKey = user?.id ?? 'super'
    const folderForKey = isSuperAdmin && !user ? 'hub' : folder

    const result = isImage
      ? await uploadImageToR2({ folder: folderForKey, userId: userIdForKey, file: buffer, originalName: file.name })
      : await uploadRawToR2({
          folder: folderForKey,
          userId: userIdForKey,
          file: buffer,
          originalName: file.name,
          contentType: file.type,
        })

    return NextResponse.json({
      url: result.url,
      type: isVideo ? 'video' : 'image',
      size: result.size,
    })
  } catch (error: any) {
    console.error('[upload] error:', error)
    return NextResponse.json(
      { error: '업로드에 실패했습니다' },
      { status: 500 },
    )
  }
}
