'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Mail, Send, Loader2, MessageSquare, Undo2,
  Users, CheckCircle2, XCircle, Clock, Eye,
  AlertTriangle, ChevronDown, AtSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

type TargetType = 'all' | 'role' | 'account_type'
type SendChannel = 'email' | 'message'

interface MailLog {
  id: string
  admin_id: string | null
  channel: string
  target_type: string
  target_value: string | null
  subject: string
  body: string
  recipients: number
  success: number
  failed: number
  created_at: string
}

const TARGET_LABEL: Record<string, string> = {
  all: '전체회원',
  role: '특정역할',
  account_type: '계정유형',
}

export default function MemberMailPage() {
  const supabase = createClient()
  const [channel, setChannel] = useState<SendChannel>('email')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetValue, setTargetValue] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [logs, setLogs] = useState<MailLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // 통계
  const stats = useMemo(() => {
    const emails = logs.filter(l => l.channel === 'email').length
    const messages = logs.filter(l => l.channel === 'message' || l.channel === 'mail').length
    const totalSent = logs.reduce((s, l) => s + l.success, 0)
    const totalFailed = logs.reduce((s, l) => s + l.failed, 0)
    return { count: logs.length, emails, messages, totalSent, totalFailed }
  }, [logs])

  const cancelBroadcast = async (log: MailLog) => {
    const label = log.channel === 'email' ? '이메일' : '쪽지'
    const msg = log.channel === 'email'
      ? '발송 이력을 삭제하시겠습니까?\n(이미 발송된 이메일은 회수할 수 없습니다)'
      : '이 쪽지를 취소하시겠습니까?\n수신자들의 채팅방에서도 삭제됩니다.'
    if (!confirm(msg)) return
    setCancelingId(log.id)
    try {
      const res = await fetch('/api/admin/broadcast-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: log.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '취소 실패')
        return
      }
      toast.success(data.message || '취소 완료')
      loadLogs()
    } catch {
      toast.error('취소 처리 중 오류가 발생했습니다')
    } finally {
      setCancelingId(null)
    }
  }

  const loadLogs = async () => {
    setLogsLoading(true)
    const { data } = await supabase
      .from('admin_mail_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setLogs((data as MailLog[]) || [])
    setLogsLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  // 수신자 해석 — 이메일 API(plaza_profiles 기반)와 동일하게 지역 격리.
  // 미리보기 수와 실제 쪽지 발송 대상이 일치하도록 단일 소스로 사용.
  const resolveRecipientIds = async (): Promise<string[]> => {
    const plaza = getCurrentPlazaClient()
    if (!plaza) return []
    const { data: members } = await supabase
      .from('plaza_profiles')
      .select('user_id')
      .eq('plaza_id', plaza)
    let ids = (members || []).map((m: any) => m.user_id)
    if (ids.length === 0) return []
    if (targetType === 'role' && targetValue) {
      const { data } = await supabase.from('profiles').select('id').in('id', ids).eq('role', targetValue)
      ids = (data || []).map((p: any) => p.id)
    }
    if (targetType === 'account_type' && targetValue) {
      const { data } = await supabase.from('profiles').select('id').in('id', ids).eq('account_type', targetValue)
      ids = (data || []).map((p: any) => p.id)
    }
    return ids
  }

  const preview = async () => {
    try {
      const ids = await resolveRecipientIds()
      setPreviewCount(ids.length)
    } catch (e: any) {
      toast.error(e?.message || '미리보기 조회 실패')
    }
  }

  const send = async () => {
    if (!subject || !body) {
      toast('제목과 내용을 입력해주세요')
      return
    }
    const channelLabel = channel === 'email' ? '이메일' : '쪽지'
    if (!confirm(`${channelLabel}을(를) 발송하시겠습니까?`)) return

    setSending(true)
    try {
      let success = 0
      let failed = 0
      let total = 0

      if (channel === 'email') {
        const res = await fetch('/api/admin/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, message: body, targetType, targetValue: targetValue || null }),
        })
        if (res.ok) {
          const result = await res.json()
          success = result.sent ?? 0
          failed = result.failed ?? 0
          total = result.total ?? 0
          if (result.error) console.error('[이메일 발송 에러]', result.error)
        } else {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || '이메일 발송 실패')
          setSending(false)
          return
        }
      } else {
        let userIds: string[]
        try {
          userIds = await resolveRecipientIds()
        } catch (e: any) {
          toast.error(e?.message || '수신자 조회 실패')
          setSending(false)
          return
        }
        total = userIds.length
        if (total === 0) {
          toast.error('발송 대상이 없습니다')
          setSending(false)
          return
        }

        // API 가 1회 최대 500명 → 500명씩 배치 전송 (초과 시 항상 실패하던 버그 수정)
        const BATCH = 500
        for (let i = 0; i < userIds.length; i += BATCH) {
          const chunk = userIds.slice(i, i + BATCH)
          try {
            const res = await fetch('/api/admin/message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userIds: chunk, message: body, subject }),
            })
            const result = await res.json().catch(() => ({}))
            if (res.ok) {
              success += result.sent ?? chunk.length
              failed += result.failed ?? 0
              if (result.error) console.error('[쪽지 에러]', result.error)
            } else {
              console.error('[쪽지 API 에러]', res.status, result)
              failed += chunk.length
            }
          } catch {
            failed += chunk.length
          }
        }
        if (failed > 0 && success === 0) {
          toast.error('쪽지 발송에 실패했습니다')
        }
      }

      // 발송 이력 기록
      const { data: userRes } = await supabase.auth.getUser()
      await supabase.from('admin_mail_log').insert({
        admin_id: userRes.user?.id || null,
        channel,
        target_type: targetType,
        target_value: targetValue || null,
        subject,
        body,
        recipients: total,
        success,
        failed,
      })

      toast.success(`발송 완료\n수신자 ${total}명 (성공 ${success} / 실패 ${failed})`)
      setSubject('')
      setBody('')
      setPreviewCount(null)
      loadLogs()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 발송 채널 선택 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setChannel('email')}
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl border text-left transition-all',
            channel === 'email'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 shadow-sm ring-1 ring-blue-200 dark:ring-blue-900'
              : 'border-border bg-card hover:bg-muted/50',
          )}
        >
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            channel === 'email' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-muted',
          )}>
            <AtSign className={cn('w-5 h-5', channel === 'email' ? 'text-blue-600' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('text-sm font-semibold', channel === 'email' ? 'text-blue-700 dark:text-blue-300' : '')}>
              이메일 발송
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              no-reply@gwangjang.app
            </p>
          </div>
        </button>
        <button
          onClick={() => setChannel('message')}
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl border text-left transition-all',
            channel === 'message'
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-200 dark:ring-emerald-900'
              : 'border-border bg-card hover:bg-muted/50',
          )}
        >
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            channel === 'message' ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-muted',
          )}>
            <MessageSquare className={cn('w-5 h-5', channel === 'message' ? 'text-emerald-600' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className={cn('text-sm font-semibold', channel === 'message' ? 'text-emerald-700 dark:text-emerald-300' : '')}>
              쪽지 발송
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              사이트 내 채팅방
            </p>
          </div>
        </button>
      </div>

      {/* 채널 안내 */}
      {channel === 'email' ? (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-3 text-sm text-blue-800 dark:text-blue-200">
          <b>이메일</b> — Resend API를 통해 no-reply@gwangjang.app에서 회원 이메일로 발송됩니다. 발송 후 회수 불가.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          <b>쪽지</b> — 사이트 내 쪽지(채팅)로 발송됩니다. 발송 취소 시 수신자 채팅방에서도 삭제됩니다.
        </div>
      )}

      {/* 발송 폼 */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/20">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {channel === 'email' ? (
              <Mail className="w-4 h-4 text-blue-600" />
            ) : (
              <MessageSquare className="w-4 h-4 text-emerald-600" />
            )}
            {channel === 'email' ? '이메일' : '쪽지'} 작성
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">대상 유형</Label>
              <select
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as TargetType)
                  setTargetValue('')
                  setPreviewCount(null)
                }}
              >
                <option value="all">전체회원</option>
                <option value="role">특정역할</option>
                <option value="account_type">계정유형</option>
              </select>
            </div>

            {targetType !== 'all' && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">대상 값</Label>
                {targetType === 'role' ? (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                  >
                    <option value="">선택</option>
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="agent">agent</option>
                  </select>
                ) : (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                  >
                    <option value="">선택</option>
                    <option value="personal">개인</option>
                    <option value="business">사업자</option>
                    <option value="agent">공인중개사</option>
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">제목</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="발송 제목을 입력하세요" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">내용</Label>
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={channel === 'email' ? '이메일 본문을 입력하세요' : '쪽지 내용을 입력하세요'}
            />
          </div>

          {/* 액션 바 */}
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-2">
              {previewCount !== null && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-medium">{previewCount.toLocaleString()}명</span>
                  <span className="text-muted-foreground">수신 예정</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={preview} size="sm">
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                수신자 미리보기
              </Button>
              <Button
                onClick={send}
                disabled={sending || !subject.trim() || !body.trim()}
                size="sm"
                className={channel === 'email' ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                {channel === 'email' ? '이메일 발송' : '쪽지 발송'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 발송 이력 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            최근 발송 이력
          </h2>
          {stats.count > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <AtSign className="w-3 h-3 text-blue-500" />
                이메일 {stats.emails}건
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-emerald-500" />
                쪽지 {stats.messages}건
              </span>
            </div>
          )}
        </div>

        {logsLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">이력을 불러오는 중...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">발송 이력이 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">위 폼에서 첫 메일/쪽지를 발송해보세요</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.id
              const isEmail = log.channel === 'email'
              const successRate = log.recipients > 0 ? Math.round((log.success / log.recipients) * 100) : 0
              const hasFailures = log.failed > 0

              return (
                <div
                  key={log.id}
                  className="rounded-xl border bg-card transition-all hover:shadow-sm"
                >
                  {/* 메인 행 */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {/* 채널 아이콘 */}
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      isEmail
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/30',
                    )}>
                      {isEmail ? (
                        <AtSign className="w-4 h-4 text-blue-600" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{log.subject}</span>
                        <span className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          isEmail
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
                        )}>
                          {isEmail ? '이메일' : '쪽지'}
                        </span>
                        <span className={cn(
                          'text-[10px] font-medium px-2 py-0.5 rounded-full',
                          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                        )}>
                          {TARGET_LABEL[log.target_type] || log.target_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        <span>{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className={cn(
                          'font-medium',
                          hasFailures ? 'text-amber-600' : 'text-emerald-600',
                        )}>
                          {log.success}/{log.recipients}명 성공
                        </span>
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-8"
                        onClick={(e) => { e.stopPropagation(); cancelBroadcast(log) }}
                        disabled={cancelingId === log.id}
                      >
                        {cancelingId === log.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="w-3.5 h-3.5" />
                        )}
                        <span className="ml-1 text-xs">취소</span>
                      </Button>
                      <ChevronDown className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-180',
                      )} />
                    </div>
                  </div>

                  {/* 확장 내용 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t">
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <div className="text-lg font-bold text-emerald-600">{log.success}</div>
                          <div className="text-[11px] text-muted-foreground">성공</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <div className={cn('text-lg font-bold', log.failed > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                            {log.failed}
                          </div>
                          <div className="text-[11px] text-muted-foreground">실패</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <div className="text-lg font-bold">{log.recipients}</div>
                          <div className="text-[11px] text-muted-foreground">전체 수신자</div>
                        </div>
                      </div>
                      {log.body && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/20 text-xs text-muted-foreground whitespace-pre-wrap">
                          {log.body}
                        </div>
                      )}
                      {isEmail && (
                        <p className="mt-2 text-[11px] text-amber-600">
                          * 이메일은 발송 후 회수할 수 없습니다. 취소 시 발송 이력만 삭제됩니다.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
