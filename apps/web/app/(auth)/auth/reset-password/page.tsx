"use client"

/**
 * 비밀번호 찾기 — Supabase resetPasswordForEmail.
 * 이메일로 reset 링크 전송 → 사용자가 클릭 → recovery flow → 새 비밀번호 입력.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Mail, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email.trim()) {
      setError("이메일을 입력해주세요.")
      return
    }
    setLoading(true)
    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=/auth/change-password`
        : undefined
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    })
    setLoading(false)
    if (resetError) {
      setError("비밀번호 재설정 메일 전송에 실패했습니다.")
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">비밀번호 찾기</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {sent ? (
          <div className="mt-8 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">메일을 발송했습니다</h2>
            <p className="text-muted-foreground text-sm">
              {email} 으로 비밀번호 재설정 링크를 보냈습니다.
              <br />
              메일을 확인해주세요. (스팸함도 확인)
            </p>
            <Link href="/auth/login">
              <Button variant="outline" className="mt-6">
                로그인 페이지로
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <p className="text-sm text-muted-foreground">
              가입 시 사용한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">이메일</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="pl-10"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full h-12" disabled={loading || !email.trim()}>
              {loading ? "전송 중..." : "재설정 메일 보내기"}
            </Button>

            <p className="text-center text-sm">
              <Link href="/auth/login" className="text-primary hover:underline">
                로그인으로 돌아가기
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
