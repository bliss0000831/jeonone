import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// 내부 경로만 허용 — 외부 도메인으로의 open-redirect 차단.
// - 유니코드 정규화 (NFKC) 로 호모그래프/호환 문자 우회 차단
// - 제어문자·공백(BOM, 탭, CR/LF, zero-width 등) 전부 제거
// - "/" 로 시작하고 "//", "/\" 아닌 것만 통과
// - 그 외엔 홈으로 폴백
function sanitizeNext(raw: string | null): string {
  if (!raw) return '/'
  // NFKC 정규화 + 제어문자/공백류 제거
  //   [\u0000-\u001F\u007F]    — ASCII 제어
  //   [\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u2060\u3000\uFEFF]
  //                            — NBSP, 각종 zero-width, line/paragraph separator, BOM
  const cleaned = raw
    .normalize('NFKC')
    .replace(
      /[\u0000-\u001F\u007F\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u2060\u3000\uFEFF]/g,
      '',
    )
  if (!cleaned.startsWith('/')) return '/'
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\')) return '/'
  return cleaned
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

  const supabase = await createClient()

  // PKCE flow - code 파라미터 처리 (OAuth 포함)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      const user = data.user
      const metadata = user.user_metadata || {}
      
      // 카카오 OAuth의 경우 kakao_account에서 정보 추출
      const kakaoAccount = metadata.kakao_account || {}
      const kakaoProfile = kakaoAccount.profile || {}
      
      // 닉네임: 카카오 닉네임 또는 기존 메타데이터
      const nickname = kakaoProfile.nickname || metadata.nickname || metadata.name || null
      // 이름: 카카오 이름 또는 기존 메타데이터
      const fullName = metadata.full_name || metadata.name || kakaoProfile.nickname || null
      // 프로필 이미지: 카카오 프로필 이미지
      const avatarUrl = kakaoProfile.profile_image_url || metadata.avatar_url || null
      // 이메일: 카카오 이메일
      const email = kakaoAccount.email || user.email || null
      
      const phoneVal = metadata.phone || null
      await supabase.from('profiles').upsert({
        id: user.id,
        nickname: nickname,
        full_name: fullName,
        phone: phoneVal,
        avatar_url: avatarUrl,
        email: email,
        ...(phoneVal ? { is_verified_phone: true } : {}),
        updated_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      }, { onConflict: 'id' })

      // 광장 통합 인증 — plaza_profiles 자동 생성 (account_type: 'user')
      const plaza = await getCurrentPlaza()
      if (plaza) {
        const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
        await ensurePlazaProfile(supabase, user.id, plaza)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // 이메일 인증 - token_hash 파라미터 처리
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error && data.user) {
      // user_metadata에서 프로필 정보 가져와서 profiles 테이블에 저장
      const user = data.user
      const metadata = user.user_metadata || {}
      
      const phoneVal2 = metadata.phone || null
      await supabase.from('profiles').upsert({
        id: user.id,
        nickname: metadata.nickname || null,
        full_name: metadata.full_name || null,
        phone: phoneVal2,
        ...(phoneVal2 ? { is_verified_phone: true } : {}),
        updated_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      }, { onConflict: 'id' })
      
      // 이메일 인증 성공 - 성공 페이지로 리다이렉트
      return NextResponse.redirect(`${origin}/auth/confirmed`)
    }
  }

  // 에러가 있거나 파라미터가 없는 경우
  return NextResponse.redirect(`${origin}/auth/error`)
}
