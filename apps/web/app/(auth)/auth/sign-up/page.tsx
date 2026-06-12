'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loginWithKakao } from '@gwangjang/auth'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { plazaCityName } from '@/lib/plaza/city-name'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'

// 카카오 로고 SVG 컴포넌트
function KakaoLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 01-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3z"/>
    </svg>
  )
}

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [nickname, setNickname] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  // 광장 내 세부 지역 (춘천/홍천/화천/양구/인제) — plazas.coverage 에서 로드
  const [coverage, setCoverage] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [sentCode, setSentCode] = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isPhoneVerified, setIsPhoneVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { name: plazaName } = useSiteBranding()

  // 광장 coverage 로드 (가입 시 거주 지역 선택용)
  useEffect(() => {
    const plaza = getCurrentPlazaClient()
    if (!plaza) return
    supabase
      .from('plazas')
      .select('coverage')
      .eq('id', plaza)
      .maybeSingle()
      .then(({ data }) => {
        const cov = (data as any)?.coverage
        if (Array.isArray(cov)) setCoverage(cov)
      })
  }, [supabase])

  // 휴대폰 번호 포맷팅
  const formatPhone = (value: string) => {
    const numbers = value.replace(/[^\d]/g, '')
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  }

  // 인증번호 전송 (임시 구현 - SMS API 연동 전 개발용)
  // ⚠️ 프로덕션에서도 동작하도록 인증번호를 input 영역에 안내 표시
  const sendVerificationCode = async () => {
    if (!phone || phone.replace(/[^\d]/g, '').length < 10) {
      setError('올바른 휴대폰 번호를 입력하세요')
      return
    }

    setSendingCode(true)
    setError(null)
    setSendingCode(false)

    // SMS API 미연동 — 정식 출시 전까지 이메일/SMS 가입은 비활성 (카카오 가입만 지원)
    if (process.env.NODE_ENV === "development") {
      // 개발 환경에서만 임시 인증번호 발급 (테스트용)
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      setSentCode(code)
      setIsCodeSent(true)
      setError(`[개발 모드] 인증번호: ${code}`)
      return
    }
    setError("휴대폰 인증이 점검 중이에요. 카카오로 가입해주세요.")
  }

  // 인증번호 확인
  const verifyCode = () => {
    if (verificationCode === sentCode) {
      setIsPhoneVerified(true)
      setError(null)
    } else {
      setError('인증번호가 일치하지 않습니다')
    }
  }

  // 카카오 로그인/회원가입 — 회원가입 페이지에서 호출하면 ?signup=1 마커 부여
  const handleKakaoSignUp = async () => {
    setKakaoLoading(true)
    setError(null)

    // M9: packages/auth 추상화 + signup=1 마커 query 전달.
    const result = await loginWithKakao(supabase, {
      redirectQuery: { signup: '1' },
    })

    if (!result.ok) {
      setError(result.errorMessage ?? '카카오 로그인에 실패했습니다')
      setKakaoLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // 비밀번호 강도 — 모바일과 동일 (8자 이상 + 영문 + 숫자)
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다')
      return
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('비밀번호는 영문과 숫자를 모두 포함해야 합니다')
      return
    }

    // 비밀번호 확인
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }

    // 휴대폰 인증 확인
    if (!isPhoneVerified) {
      setError('휴대폰 인증을 완료해주세요')
      return
    }

    // 거주 지역 선택 확인 (광장 coverage 가 정의돼 있을 때만)
    if (coverage.length > 0 && !subRegion) {
      setError('거주 지역을 선택해주세요')
      return
    }

    setLoading(true)

    // 현재 도메인 기반으로 리다이렉트 URL 설정
    const redirectUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/auth/callback`
      : undefined

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          nickname,
          full_name: fullName,
          phone,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.user) {
      // 광장별 독립 계정 — 현재 광장에 가입 row 생성
      const plaza = getCurrentPlazaClient()
      if (plaza) {
        await supabase.from('plaza_profiles').insert({
          user_id: data.user.id,
          plaza_id: plaza,
          nickname,
          is_active: true,
          ...(subRegion ? { sub_region: subRegion } : {}),
        }).then(() => {}, () => {})
      }
      // profile 에도 기본 sub_region 저장 (뉴스 페이지 기본값으로 사용)
      if (subRegion) {
        await supabase
          .from('profiles')
          .update({ sub_region: subRegion })
          .eq('id', data.user.id)
          .then(() => {}, () => {})
      }

      // 이메일 인증 없이 바로 로그인 시도
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // 이메일 인증이 필수인 경우 — 성공 안내(초록)로 표시 (에러 아님)
        setError(null)
        setNotice('회원가입이 완료되었습니다! 이메일로 발송된 인증 링크를 클릭한 후 로그인해주세요.')
        setLoading(false)
      } else {
        router.push('/')
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold">회원가입</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl overflow-hidden mb-4">
              <Image src="/logo.png?v=3" alt={plazaName} width={48} height={48} className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-2xl">{plazaName} 회원가입</CardTitle>
            <CardDescription>이웃과 함께하는 농촌 생활</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 카카오 간편 가입 */}
            <Button
              type="button"
              onClick={handleKakaoSignUp}
              disabled={kakaoLoading}
              className="w-full bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] font-medium mb-4"
            >
              {kakaoLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <KakaoLogo className="w-5 h-5 mr-2" />
              )}
              카카오로 간편 가입
            </Button>

            {/* 시범 운영 중 — 휴대폰 인증 미연동이라 카카오 가입만 안내 */}
            <p className="mt-5 text-sm text-center text-muted-foreground">
              현재 시범 운영 중이라 <strong className="text-foreground">카카오로 가입</strong>만 가능해요. 휴대폰·이메일 가입은 정식 출시 후 열립니다.
            </p>

            <div className="hidden">
            <form onSubmit={handleSignUp} className="space-y-4">
              {notice && (
                <div
                  className="p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg"
                  role="status"
                  aria-live="polite"
                >
                  {notice}{" "}
                  <Link href="/auth/login" className="font-semibold underline">로그인하러 가기</Link>
                </div>
              )}
              {error && (
                <div
                  className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="fullName">이름</Label>
                <Input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="홍길동"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">닉네임</Label>
                <Input
                  id="nickname"
                  type="text"
                  autoComplete="username"
                  placeholder={`${plazaCityName(plazaName)}이웃`}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
              </div>

              {/* 거주 지역 — 광장 coverage 정의돼 있을 때만 노출 */}
              {coverage.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="sub_region">거주 지역</Label>
                  <select
                    id="sub_region"
                    value={subRegion}
                    onChange={(e) => setSubRegion(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">지역 선택</option>
                    {coverage.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    선택한 지역의 뉴스가 기본으로 표시됩니다
                  </p>
                </div>
              )}

              {/* 휴대폰 인증 */}
              <div className="space-y-2">
                <Label htmlFor="phone">휴대폰 번호</Label>
                <div className="flex gap-2">
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    disabled={isPhoneVerified}
                    required
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant={isPhoneVerified ? "outline" : "secondary"}
                    onClick={sendVerificationCode}
                    disabled={sendingCode || isPhoneVerified}
                    className="whitespace-nowrap"
                  >
                    {sendingCode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isPhoneVerified ? (
                      '인증완료'
                    ) : isCodeSent ? (
                      '재전송'
                    ) : (
                      '인증요청'
                    )}
                  </Button>
                </div>
              </div>

              {/* 인증번호 입력 */}
              {isCodeSent && !isPhoneVerified && (
                <div className="space-y-2">
                  <Label htmlFor="verificationCode">인증번호</Label>
                  <div className="flex gap-2">
                    <Input
                      id="verificationCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="인증번호 6자리"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                      maxLength={6}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={verifyCode}
                      disabled={verificationCode.length !== 6}
                    >
                      확인
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              {/* 비밀번호 */}
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="8자 이상 (영문+숫자 필수)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* 비밀번호 강도 표시기 */}
                {password.length > 0 && (() => {
                  let score = 0
                  if (password.length >= 8) score++
                  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++
                  if (password.length >= 12) score++
                  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++
                  const level = score <= 1 ? 0 : score === 2 ? 1 : score === 3 ? 2 : 3
                  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"]
                  const labels = ["매우 약함", "약함", "보통", "강함"]
                  const textColors = ["text-red-600 dark:text-red-400", "text-orange-600 dark:text-orange-400", "text-yellow-600 dark:text-yellow-400", "text-emerald-600 dark:text-emerald-400"]
                  return (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[0,1,2,3].map((i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= level ? colors[level] : "bg-muted"}`} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-medium ${textColors[level]}`}>{labels[level]}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {password.length < 8 ? "8자 이상 필요" : !/[A-Za-z]/.test(password) || !/\d/.test(password) ? "영문+숫자 필수" : "특수문자 추가 시 강함"}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* 비밀번호 확인 */}
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                <div className="relative">
                  <Input
                    id="passwordConfirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="비밀번호를 다시 입력하세요"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    minLength={8}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordConfirm && password !== passwordConfirm && (
                  <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다</p>
                )}
                {passwordConfirm && password === passwordConfirm && (
                  <p className="text-xs text-primary">비밀번호가 일치합니다</p>
                )}
              </div>

              {/* 약관 동의 (PIPA 개인정보보호법 필수) */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer"
                />
                <label htmlFor="agree-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  <Link href="/terms" target="_blank" className="text-primary underline hover:text-primary/80">이용약관</Link>
                  {' '}및{' '}
                  <Link href="/privacy" target="_blank" className="text-primary underline hover:text-primary/80">개인정보처리방침</Link>
                  에 동의합니다. <span className="text-destructive">*</span>
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={loading || !isPhoneVerified || password !== passwordConfirm || !agreedTerms}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    가입 중...
                  </>
                ) : (
                  '회원가입'
                )}
              </Button>
            </form>
            </div>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              이미 계정이 있으신가요?{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:underline">
                로그인
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
