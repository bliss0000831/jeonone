'use client'

/**
 * 앱 버전 관리 페이지.
 * 최소 요구 버전 설정, 강제 업데이트 관리, 버전 히스토리.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Settings, Loader2, RotateCcw, Save } from 'lucide-react'

interface AppVersionConfig {
  current_version: string
  minimum_version: string
  force_update: boolean
  update_message: string
  updated_at: string
}

interface VersionHistoryEntry {
  version: string
  min_version: string
  force_update: boolean
  saved_at: string
}

export default function AppVersionPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentVersion, setCurrentVersion] = useState('1.0.0')
  const [minimumVersion, setMinimumVersion] = useState('1.0.0')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('새로운 버전이 출시되었습니다. 업데이트해주세요.')
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>([])

  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadConfig = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      // plaza_settings에서 앱 버전 설정 조회
      const { data } = await (supabase as any)
        .from('plaza_settings')
        .select('value')
        .eq('plaza_id', plaza)
        .eq('key', 'app_version')
        .maybeSingle()

      if (data?.value) {
        const config = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
        setCurrentVersion(config.current_version || '1.0.0')
        setMinimumVersion(config.minimum_version || '1.0.0')
        setForceUpdate(config.force_update || false)
        setUpdateMessage(config.update_message || '새로운 버전이 출시되었습니다. 업데이트해주세요.')
      }

      // 버전 히스토리 조회
      const { data: historyData } = await (supabase as any)
        .from('app_versions')
        .select('*')
        .eq('plaza_id', plaza)
        .order('created_at', { ascending: false })
        .limit(20)

      if (historyData && historyData.length > 0) {
        setVersionHistory(
          historyData.map((h: any) => ({
            version: h.version || h.current_version || '-',
            min_version: h.min_version || h.minimum_version || '-',
            force_update: h.force_update || false,
            saved_at: h.created_at || h.saved_at || '',
          }))
        )
      }
    } catch (e) {
      console.error('Failed to load app version config:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    if (!plaza) return
    setSaving(true)
    setMessage(null)
    try {
      const config = {
        current_version: currentVersion,
        minimum_version: minimumVersion,
        force_update: forceUpdate,
        update_message: updateMessage,
      }

      await (supabase as any)
        .from('plaza_settings')
        .upsert({
          plaza_id: plaza,
          key: 'app_version',
          value: config,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'plaza_id,key' })

      // 히스토리에 기록
      await (supabase as any)
        .from('app_versions')
        .insert({
          plaza_id: plaza,
          version: currentVersion,
          min_version: minimumVersion,
          force_update: forceUpdate,
        })

      setMessage({ type: 'success', text: '앱 버전 설정이 저장되었습니다.' })

      // 로컬 히스토리에 추가
      setVersionHistory((prev) => [
        {
          version: currentVersion,
          min_version: minimumVersion,
          force_update: forceUpdate,
          saved_at: new Date().toISOString(),
        },
        ...prev,
      ])
    } catch (e: any) {
      setMessage({ type: 'error', text: `저장 실패: ${e?.message || '알 수 없는 오류'}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">앱 버전 관리</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              최소 요구 버전 및 강제 업데이트 설정
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadConfig} className="h-8 text-xs gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" />
          새로고침
        </Button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 현재 버전 */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div>
            <h3 className="text-[13px] font-semibold">현재 앱 버전</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">최신 앱 버전 번호</p>
          </div>
          <Input
            value={currentVersion}
            onChange={(e) => setCurrentVersion(e.target.value)}
            placeholder="1.0.0"
            className="h-9 text-[13px]"
          />
        </div>

        {/* 최소 요구 버전 */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div>
            <h3 className="text-[13px] font-semibold">최소 요구 버전</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">이 버전 미만은 업데이트 필요</p>
          </div>
          <Input
            value={minimumVersion}
            onChange={(e) => setMinimumVersion(e.target.value)}
            placeholder="1.0.0"
            className="h-9 text-[13px]"
          />
        </div>
      </div>

      {/* 강제 업데이트 */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-[13px] font-semibold">강제 업데이트</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">활성화하면 최소 요구 버전 미만 사용자는 앱 이용 불가</p>
        </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForceUpdate(!forceUpdate)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                forceUpdate ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  forceUpdate ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm">
              {forceUpdate ? (
                <Badge className="bg-red-100 text-red-700">강제 업데이트 활성</Badge>
              ) : (
                <Badge variant="secondary">선택적 업데이트</Badge>
              )}
            </span>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground">업데이트 안내 메시지</label>
            <textarea
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] min-h-[80px] focus:ring-1 focus:ring-primary/20 focus:border-primary/40 outline-none"
              placeholder="업데이트 안내 메시지를 입력하세요"
            />
          </div>
      </div>

      {/* 저장 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          설정 저장
        </Button>
      </div>

      {/* 버전 히스토리 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            버전 히스토리
          </h3>
        </div>
        {versionHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Smartphone className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-[13px]">버전 히스토리가 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">버전</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">최소 버전</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">강제 업데이트</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">등록일</th>
                </tr>
              </thead>
              <tbody>
                {versionHistory.map((v, i) => (
                  <tr key={`${v.version}-${v.saved_at}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium">
                      {v.version}
                      {i === 0 && (
                        <Badge className="ml-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">현재</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{v.min_version}</td>
                    <td className="px-4 py-3 text-center">
                      {v.force_update ? (
                        <Badge className="bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">ON</Badge>
                      ) : (
                        <span className="text-muted-foreground/50 text-[13px]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">
                      {v.saved_at ? new Date(v.saved_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
