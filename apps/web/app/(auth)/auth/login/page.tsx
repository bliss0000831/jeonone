'use client'

import { Suspense, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loginWithKakao } from '@gwangjang/auth'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Eye, EyeOff, Mail, Lock } from 'lucide-react'

// 카카오 로고 SVG 컴포넌트
function KakaoLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 01-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3z"/>
    </svg>
  )
}

function LoginPageContent() {
  const [identifier, setIdentifier] = useState('') // 아이디 또는 이메일
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { name: plazaName } = useSiteBranding()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const plaza = getCurrentPlazaClient()
    if (!plaza) {
      setError('광장 도메인에서 로그인해주세요')
      setLoading(false)
      return
    }

    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    })

    if (error || !signInData.user) {
      setError('이메일 또는 비밀번호가 일치하지 않습니다')
      setLoading(false)
      return
    }

    // 광장 통합 인증(plaza_profiles 생성)은 백그라운드로 — 로그인 즉시 이동(지연 방지)
    if (plaza) {
      const uid = signInData.user.id
      void import("@gwangjang/features/profile/ensure-plaza-profile")
        .then(({ ensurePlazaProfile }) => ensurePlazaProfile(supabase, uid, plaza))
        .catch(() => {})
    }

    // H3: 로그인 후 redirect 파라미터가 있으면 해당 페이지로 이동
    // 미들웨어/콜백은 'next'로 보내므로 둘 다 허용 (관리자 보호 라우트 진입 보존)
    const redirect = searchParams.get('redirect') ?? searchParams.get('next')
    const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
    router.push(safeRedirect)
    router.refresh()
  }

  // 카카오 로그인
  const handleKakaoLogin = async () => {
    setKakaoLoading(true)
    setError(null)

    // M9: packages/auth 추상화 사용. 동작은 기존과 동일 (Supabase OAuth 외부 redirect).
    const result = await loginWithKakao(supabase)

    if (!result.ok) {
      setError(result.errorMessage ?? '카카오 로그인에 실패했습니다')
      setKakaoLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f6f0] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 홈으로 돌아가기
        </Link>

        <Card className="w-full shadow-sm">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto w-16 h-16 rounded-full overflow-hidden mb-3 ring-2 ring-primary/20 shadow-sm">
              <Image src="/images/logo-farmer.png" alt={plazaName} width={64} height={64} className="w-full h-full object-cover" priority />
            </div>
            <CardTitle className="text-2xl text-primary">로그인</CardTitle>
            <CardDescription>이메일로 로그인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div
                  className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="flex items-center gap-1.5 font-semibold">
                  <Mail className="w-4 h-4 text-primary" />이메일
                </Label>
                <Input
                  id="identifier"
                  type="email"
                  autoComplete="email"
                  placeholder="example@email.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="flex items-center gap-1.5 font-semibold">
                  <Lock className="w-4 h-4 text-primary" />비밀번호
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="비밀번호를 입력하세요"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full font-bold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  '로그인'
                )}
              </Button>
            </form>

            {/* 소셜 로그인 구분선 */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">또는</span>
              </div>
            </div>

            {/* 카카오 로그인 버튼 */}
            <Button
              type="button"
              onClick={handleKakaoLogin}
              disabled={kakaoLoading}
              className="w-full bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] font-bold"
            >
              {kakaoLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <KakaoLogo className="w-5 h-5 mr-2" />
              )}
              카카오로 로그인
            </Button>

            <div className="mt-5 text-center text-sm">
              <Link href="/auth/reset-password" className="text-muted-foreground hover:text-primary hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
            <div className="mt-3 text-center text-sm text-muted-foreground">
              아직 회원이 아니신가요?{' '}
              <Link href="/auth/sign-up" className="text-primary font-bold hover:underline">
                회원가입
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginPageContent />
    </Suspense>
  )
}
