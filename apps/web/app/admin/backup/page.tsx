'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { Database, Download, Upload } from 'lucide-react'
import { toast } from "sonner"

interface BackupLog {
  id: string
  admin_id: string | null
  action: string
  target: string
  status: string
  created_at: string
}

const toCsv = (rows: any[]) => {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v).replace(/"/g, '""')
    return `"${s}"`
  }
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join(
    '\n'
  )
}

const downloadBlob = (content: string, type: string, filename: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function BackupPage() {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<BackupLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadLogs = async () => {
    setLogsLoading(true)
    const { data } = await supabase
      .from('admin_backup_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setLogs((data as BackupLog[]) || [])
    setLogsLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const writeLog = async (target: string, action: string, status: string) => {
    const { data: userRes } = await supabase.auth.getUser()
    await supabase.from('admin_backup_logs').insert({
      admin_id: userRes.user?.id || null,
      action,
      target,
      status,
    })
  }

  const exportSettings = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase.from('site_settings').select('*')
      if (error) throw error
      downloadBlob(
        JSON.stringify(data || [], null, 2),
        'application/json',
        `settings-backup-${Date.now()}.json`
      )
      await writeLog('site_settings', 'export', 'success')
      loadLogs()
    } catch (e: any) {
      toast.error(e.message || '내보내기 실패')
      await writeLog('site_settings', 'export', 'failed')
      loadLogs()
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async (table: string, filename: string) => {
    setBusy(true)
    try {
      const { data, error } = await (supabase as any).from(table).select('*')
      if (error) throw error
      downloadBlob(toCsv(data || []), 'text/csv;charset=utf-8', filename)
      await writeLog(table, 'export', 'success')
      loadLogs()
    } catch (e: any) {
      toast.error(e.message || '내보내기 실패')
      await writeLog(table, 'export', 'failed')
      loadLogs()
    } finally {
      setBusy(false)
    }
  }

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (
      !confirm('정말로 설정을 복원하시겠습니까? 기존 값이 덮어써집니다')
    ) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('JSON 형식이 올바르지 않습니다')
      const rows = parsed.map((r: any) => ({
        key: r.key,
        value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('site_settings')
        .upsert(rows, { onConflict: 'key' })
      if (error) throw error
      await writeLog('site_settings', 'restore', 'success')
      toast.success(`${rows.length}건 복원되었습니다`)
      loadLogs()
    } catch (err: any) {
      toast.error(err.message || '복원 실패')
      await writeLog('site_settings', 'restore', 'failed')
      loadLogs()
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const columns: AdminColumn<BackupLog>[] = [
    {
      key: 'created_at',
      label: '일시',
      render: (r) => new Date(r.created_at).toLocaleString('ko-KR'),
    },
    { key: 'action', label: '작업' },
    { key: 'target', label: '대상' },
    {
      key: 'status',
      label: '상태',
      render: (r) => (
        <span
          className={
            r.status === 'success'
              ? 'text-green-600'
              : r.status === 'failed'
                ? 'text-red-600'
                : ''
          }
        >
          {r.status}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <AdminPageHeader
        title="백업/복원"
        description="사이트 데이터 내보내기 및 설정 복원"
        icon={<Database className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">내보내기</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportSettings} disabled={busy}>
              <Download className="w-4 h-4 mr-1" />
              전체 설정 내보내기 (JSON)
            </Button>
            <Button
              variant="outline"
              onClick={() => exportCsv('properties', `properties-${Date.now()}.csv`)}
              disabled={busy}
            >
              <Download className="w-4 h-4 mr-1" />
              매물 데이터 (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => exportCsv('board_posts', `board-${Date.now()}.csv`)}
              disabled={busy}
            >
              <Download className="w-4 h-4 mr-1" />
              게시판 데이터 (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => exportCsv('profiles', `members-${Date.now()}.csv`)}
              disabled={busy}
            >
              <Download className="w-4 h-4 mr-1" />
              회원 데이터 (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">복원</h2>
          <p className="text-sm text-muted-foreground">
            site_settings JSON 파일을 업로드하면 기존 키를 덮어씁니다.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={onRestoreFile}
              disabled={busy}
              className="text-sm"
            />
            <Upload className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">최근 작업 이력</h2>
        <AdminDataTable<BackupLog>
          columns={columns}
          rows={logs}
          loading={logsLoading}
          emptyText="작업 이력이 없습니다"
        />
      </div>
    </div>
  )
}
