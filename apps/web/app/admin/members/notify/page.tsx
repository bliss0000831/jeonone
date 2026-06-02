'use client'
import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Bell, Send, Loader2, ImagePlus, X, Undo2,
  Users, CheckCircle2, XCircle, Clock, Eye,
  AlertTriangle, ChevronDown,
} from 'lucide-react'
import { uploadMedia } from '@/lib/upload-media'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

type TargetType = 'all' | 'role' | 'account_type' | 'users'

interface NotifyLog {
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
  users: '특정회원',
}

export default function AdminNotifyPage() {
  const supabase = createClient()
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetValue, setTargetValue] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('/notifications')
  const [sending, setSending] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [logs, setLogs] = useState<NotifyLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // 통계
  const stats = useMemo(() => {
    const totalSent = logs.reduce((s, l) => s + l.success, 0)
    const totalFailed = logs.reduce((s, l) => s + l.failed, 0)
    const totalRecipients = logs.reduce((s, l) => s + l.recipients, 0)
    return { count: logs.length, totalSent, totalFailed, totalRecipients }
  }, [logs])

  const cancelBroadcast = async (logId: string) => {
    if (!confirm('이 알림을 취소하시겠습니까?\n수신자들의 알림함에서도 삭제됩니다.')) return
    setCancelingId(logId)
    try {
      const res = await fetch('/api/admin/broadcast-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
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
      .eq('channel', 'notification')
      .order('created_at', { ascending: false })
      .limit(20)
    setLogs((data as NotifyLog[]) || [])
    setLogsLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const preview = async () => {
    try {
      const qs = new URLSearchParams({ targetType, targetValue })
      const res = await fetch(`/api/admin/notify?${qs.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '미리보기 실패')
        return
      }
      setPreviewCount(data.count ?? 0)
    } catch (e: any) {
      toast.error(e?.message || '미리보기 실패')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('이미지 파일만 업로드 가능합니다')
      return
    }
    setImageUploading(true)
    try {
      const { url } = await uploadMedia(file)
      setImageUrl(url)
    } catch (err: any) {
      toast.error(err?.message || '이미지 업로드 실패')
    } finally {
      setImageUploading(false)
      e.target.value = ''
    }
  }

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast('제목과 내용을 입력해주세요')
      return
    }
    if (!confirm(`알림을 발송하시겠습니까?${previewCount !== null ? `\n예상 수신자: ${previewCount}명` : ''}`)) return

    setSending(true)
    try {
      const payload: any = {
        targetType,
        title,
        message: body,
        link: link || '/notifications',
        thumbnailUrl: imageUrl || undefined,
      }
      if (targetType === 'users') {
        payload.userIds = targetValue
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      } else if (targetValue) {
        payload.targetValue = targetValue
      }
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '발송 실패')
        return
      }
      toast.success(`발송 완료\n수신자 ${data.recipients}명 (성공 ${data.success} / 실패 ${data.failed})`)
      setTitle('')
      setBody('')
      setImageUrl('')
      setPreviewCount(null)
      loadLogs()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 발송 폼 */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/20">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" />
            알림 발송
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            회원 상단 종 아이콘으로 전달되며, FCM 푸시 알림도 함께 발송됩니다
          </p>
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
                <option value="users">특정 회원 (user_id)</option>
              </select>
            </div>

            {targetType !== 'all' && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">대상 값</Label>
                {targetType === 'users' ? (
                  <Textarea
                    rows={3}
                    value={targetValue}
                    onChange={(e) => {
                      setTargetValue(e.target.value)
                      setPreviewCount(null)
                    }}
                    placeholder="user_id 들을 쉼표 또는 줄바꿈으로 구분하여 입력"
                    className="text-sm"
                  />
                ) : targetType === 'role' ? (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={targetValue}
                    onChange={(e) => {
                      setTargetValue(e.target.value)
                      setPreviewCount(null)
                    }}
                  >
                    <option value="">선택</option>
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="superadmin">superadmin</option>
                  </select>
                ) : (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                    value={targetValue}
                    onChange={(e) => {
                      setTargetValue(e.target.value)
                      setPreviewCount(null)
                    }}
                  >
                    <option value="">선택</option>
                    <option value="user">일반</option>
                    <option value="business">사장님</option>
                    <option value="agent">공인중개사</option>
                    <option value="producer">로컬푸드 생산자</option>
                    <option value="interior">인테리어</option>
                    <option value="moving">이사</option>
                    <option value="cleaning">청소</option>
                    <option value="repair">수리</option>
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">알림 제목</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 서비스 점검 안내"
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">알림 내용</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="회원에게 전달할 내용"
              maxLength={300}
            />
            <div className="text-right text-[11px] text-muted-foreground">
              {body.length}/300
            </div>
          </div>

          {/* 이미지 업로드 */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              푸시 알림 이미지
              <span className="font-normal text-muted-foreground/60 ml-1">(선택, 미지정 시 앱 로고)</span>
            </Label>
            {imageUrl ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <Image src={imageUrl} alt="알림 이미지" width={56} height={56} className="w-14 h-14 rounded-lg object-cover border" unoptimized />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{imageUrl}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Android 푸시 오른쪽에 표시</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setImageUrl('')} className="shrink-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 text-sm transition-colors">
                  {imageUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{imageUploading ? '업로드 중...' : '이미지 선택'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
                </label>
                <span className="text-[11px] text-muted-foreground/60">PNG, JPG (권장 256x256)</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              클릭 시 이동 경로
              <span className="font-normal text-muted-foreground/60 ml-1">(기본 /notifications)</span>
            </Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/notices/42 또는 /events/spring"
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
              <Button onClick={send} disabled={sending || !title.trim() || !body.trim()} size="sm">
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                알림 발송
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
            <span className="text-xs text-muted-foreground">
              총 {stats.count}건 · 성공 {stats.totalSent.toLocaleString()} · 실패 {stats.totalFailed.toLocaleString()}
            </span>
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
              <Bell className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">발송 이력이 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">위 폼에서 첫 알림을 발송해보세요</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.id
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
                    {/* 성공/실패 아이콘 */}
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      hasFailures
                        ? 'bg-amber-50 dark:bg-amber-950/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/30',
                    )}>
                      {hasFailures ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{log.subject}</span>
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
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {log.recipients.toLocaleString()}명
                        </span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className={cn(
                          'font-medium',
                          successRate === 100 ? 'text-emerald-600' : successRate >= 80 ? 'text-amber-600' : 'text-red-600',
                        )}>
                          성공률 {successRate}%
                        </span>
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-8"
                        onClick={(e) => { e.stopPropagation(); cancelBroadcast(log.id) }}
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
