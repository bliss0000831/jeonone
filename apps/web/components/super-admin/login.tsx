'use client'

import { useState } from 'react'
import { Crown, Loader2, KeyRound, Smartphone } from 'lucide-react'

export function SuperAdminLogin() {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/super-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password, totp: totp || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || '로그인 실패')
        setLoading(false)
        return
      }
      window.location.reload()
    } catch {
      setError('네트워크 오류')
      setLoading(false)
    }
  }

  return (
    // 화이트모드 강제 — 깔끔한 회색 배경 + 흰 카드
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* 로고 + 타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/30">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">슈퍼 관리자</h1>
          <p className="text-sm text-gray-500 mt-1.5">전 광장 통합 관리 콘솔</p>
        </div>

        {/* 카드 */}
        <form
          onSubmit={submit}
          className="rounded-2xl bg-white border border-gray-200 p-6 sm:p-8 space-y-5 shadow-xl shadow-gray-200/50"
        >
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <span className="text-red-500">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">아이디</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="off"
                autoFocus
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:bg-white transition"
              required
            />
          </div>

          {/* TOTP — 옵션. 입력 안 해도 backend 가 처리 (TOTP 미설정 환경) */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-gray-400" />
              인증 코드
              <span className="text-gray-400 font-normal">(옵션)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:bg-white transition tracking-widest text-center font-mono text-base"
            />
            <p className="text-[10px] text-gray-400 mt-1.5">
              Google Authenticator 등 OTP 앱의 6자리 코드 (TOTP 활성화된 경우)
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            로그인
          </button>

          <p className="text-[11px] text-gray-400 text-center pt-2 border-t border-gray-100">
            🔒 인가된 관리자만 접근 가능. 모든 시도는 기록됩니다.
          </p>
        </form>
      </div>
    </div>
  )
}
