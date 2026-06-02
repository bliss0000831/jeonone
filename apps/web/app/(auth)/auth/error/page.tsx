import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Home, AlertTriangle } from 'lucide-react'

function AuthErrorContent() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-red-100 dark:bg-red-950/30">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">인증 오류</CardTitle>
          <CardDescription className="text-base">
            인증 처리 중 문제가 발생했습니다.
            <br />
            <span className="text-muted-foreground">
              다시 시도하거나, 다른 방법으로 로그인해주세요.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            <div className="flex items-center gap-2 justify-center">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>링크가 만료되었거나 이미 사용된 링크일 수 있습니다</span>
            </div>
          </div>
          <Button asChild className="w-full">
            <Link href="/auth/login">다시 로그인하기</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로 돌아가기
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthErrorPage() {
  return <AuthErrorContent />
}
