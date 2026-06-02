"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Eye, EyeOff, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function ChangePasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  // 🅲 모바일과 동일 — 현재 비밀번호 재인증 후 변경 (보안 강화)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // 현재 비밀번호 확인
    if (!currentPassword) {
      setError("현재 비밀번호를 입력해주세요.")
      return
    }

    // 새 비밀번호 정책 — 모바일과 동일 (8자 이상 + 영문 + 숫자)
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.")
      return
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
      return
    }

    if (newPassword === currentPassword) {
      setError("새 비밀번호는 현재 비밀번호와 달라야 합니다.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    setLoading(true)

    // 1) 현재 비밀번호로 재인증 (signInWithPassword)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setLoading(false)
      setError("로그인 정보를 찾을 수 없습니다. 다시 로그인해주세요.")
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (signInError) {
      setLoading(false)
      setError("현재 비밀번호가 일치하지 않습니다.")
      return
    }

    // 2) 새 비밀번호로 업데이트
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    setLoading(false)

    if (updateError) {
      setError("비밀번호 변경에 실패했습니다. 다시 시도해주세요.")
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push("/mypage/settings")
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">비밀번호 변경</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {success ? (
          <div className="mt-8 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              비밀번호가 변경되었습니다
            </h2>
            <p className="text-muted-foreground">
              잠시 후 설정 페이지로 이동합니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            {/* 현재 비밀번호 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                현재 비밀번호
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력해주세요"
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                새 비밀번호
              </label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8자 이상 (영문+숫자 필수)"
                  className="pr-10"
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showNew ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                비밀번호 확인
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력해주세요"
                  className="pr-10"
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showConfirm ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-12"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            >
              {loading ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
