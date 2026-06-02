import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Home } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">이메일을 확인해주세요</CardTitle>
          <CardDescription className="text-base">
            입력하신 이메일로 인증 링크를 보내드렸습니다.
            <br />
            이메일을 확인하여 가입을 완료해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-secondary rounded-lg text-sm text-muted-foreground">
            이메일이 도착하지 않았다면 스팸 폴더를 확인해주세요.
          </div>
          <Button asChild variant="outline" className="w-full">
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
