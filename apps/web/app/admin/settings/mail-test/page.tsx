'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Mail, Send, Loader2, CheckCircle2, XCircle, Server, AlertTriangle } from 'lucide-react'

interface TestLog {
  timestamp: string
  to: string
  subject: string
  status: 'success' | 'error'
  detail: string
}

export default function MailTestPage() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('[춘천광장] 메일 발송 테스트')
  const [body, setBody] = useState(
    '안녕하세요.\n\n본 메일은 춘천광장 관리자 페이지에서 발송된 테스트 메일입니다.\n\n감사합니다.'
  )
  const [sending, setSending] = useState(false)
  const [logs, setLogs] = useState<TestLog[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')

  const supabase = createClient()

  const handleSendTest = async () => {
    if (!to.trim()) {
      setMessage({ type: 'error', text: '수신자 이메일을 입력해주세요.' })
      return
    }
    setSending(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/mail-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      })

      const timestamp = new Date().toLocaleString('ko-KR')
      if (res.ok) {
        setLogs((prev) => [
          { timestamp, to, subject, status: 'success', detail: '발송 성공' },
          ...prev,
        ])
        setMessage({ type: 'success', text: '테스트 메일이 발송되었습니다.' })
      } else {
        const data = await res.json().catch(() => ({ error: '발송 실패' }))
        setLogs((prev) => [
          { timestamp, to, subject, status: 'error', detail: data.error || '발송 실패' },
          ...prev,
        ])
        setMessage({
          type: 'error',
          text: `메일 발송 실패: ${data.error || 'SMTP 설정을 확인해주세요.'}`,
        })
      }
    } catch (err: any) {
      const timestamp = new Date().toLocaleString('ko-KR')
      setLogs((prev) => [
        { timestamp, to, subject, status: 'error', detail: err?.message || '네트워크 오류' },
        ...prev,
      ])
      setMessage({
        type: 'error',
        text: '메일 발송 중 오류가 발생했습니다. API 엔드포인트(/api/admin/mail-test)를 확인해주세요.',
      })
    } finally {
      setSending(false)
    }
  }

  const handleSaveSmtp = async () => {
    try {
      const updates = [
        { key: 'smtp_host', value: JSON.stringify(smtpHost) },
        { key: 'smtp_port', value: JSON.stringify(smtpPort) },
        { key: 'smtp_user', value: JSON.stringify(smtpUser) },
        { key: 'smtp_from', value: JSON.stringify(smtpFrom) },
      ]
      for (const u of updates) {
        await supabase
          .from('site_settings')
          .upsert(
            { key: u.key, value: u.value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
      }
      setMessage({ type: 'success', text: 'SMTP 설정이 저장되었습니다.' })
    } catch {
      setMessage({ type: 'error', text: 'SMTP 설정 저장에 실패했습니다.' })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6 text-primary" />
          메일 테스트
        </h1>
        <p className="text-muted-foreground mt-1">
          SMTP 설정을 확인하고 테스트 메일을 발송합니다.
        </p>
      </div>

      {/* 메일 발송 미구현 경고 — 운영 메일 인프라(Resend/SendGrid 등) 도입 전까지 비활성. */}
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <div className="font-semibold mb-1">메일 발송 기능 미구현 (추후 구현 예정)</div>
          <div className="space-y-1 text-amber-700">
            <div>현재 서버에 메일 전송 모듈이 연동되어 있지 않아 실제 메일은 발송되지 않습니다.</div>
            <div>SMTP 설정 입력란은 사전 설정용으로만 동작하며, 운영 메일 서비스(Resend 등)
              도입 후 활성화될 예정입니다.</div>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            SMTP 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>SMTP 호스트</Label>
              <Input
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>SMTP 포트</Label>
              <Input
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>SMTP 사용자</Label>
              <Input
                placeholder="noreply@example.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>발송자 이메일(From)</Label>
              <Input
                placeholder="춘천광장 <noreply@example.com>"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleSaveSmtp}>
              SMTP 설정 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            테스트 메일 발송
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="to">수신자</Label>
            <Input
              id="to"
              type="email"
              placeholder="test@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="subject">제목</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="body">내용</Label>
            <Textarea
              id="body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            {/* 미구현 상태이므로 버튼 비활성. 메일 인프라 도입 후 disabled 제거 예정. */}
            <Button disabled className="gap-2" title="메일 발송 기능 미구현">
              <Send className="w-4 h-4" />
              테스트 메일 발송 (미구현)
            </Button>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>발송 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {logs.map((log, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm"
              >
                {log.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-medium">
                    {log.subject} → {log.to}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.timestamp} · {log.detail}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
