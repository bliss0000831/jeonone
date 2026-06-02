'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Database, HardDrive, Map, CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react'

interface Probe {
  status: 'ok' | 'fail'
  ms: number
  error?: string
}

interface HealthResponse {
  db: Probe
  storage: Probe
  naver: Probe
  timestamp: string
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '조회 실패')
        setData(null)
        return
      }
      setData(json)
    } catch (e: any) {
      setError(e?.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const cards: Array<{
    key: keyof HealthResponse
    label: string
    icon: React.ReactNode
    probe?: Probe
  }> = [
    { key: 'db', label: 'Database', icon: <Database className="w-5 h-5" />, probe: data?.db },
    { key: 'storage', label: 'Storage', icon: <HardDrive className="w-5 h-5" />, probe: data?.storage },
    { key: 'naver', label: 'Naver Map API', icon: <Map className="w-5 h-5" />, probe: data?.naver },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            시스템 상태
          </h1>
          <p className="text-muted-foreground mt-1">
            DB · Storage · 외부 API 의 응답 상태와 지연시간을 점검합니다.
            {data?.timestamp && (
              <span className="ml-2 text-xs">측정: {new Date(data.timestamp).toLocaleString('ko-KR')}</span>
            )}
          </p>
        </div>
        <Button onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          재실행
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => {
          const p = c.probe
          const ok = p?.status === 'ok'
          return (
            <Card key={c.key as string} className={ok ? 'border-emerald-300/60' : p ? 'border-red-300/60' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {c.icon}
                  {c.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!p ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> 측정 중…
                      </>
                    ) : (
                      '-'
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {ok ? (
                        <Badge className="bg-emerald-500 text-white gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          OK
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500 text-white gap-1">
                          <XCircle className="w-3 h-3" />
                          FAIL
                        </Badge>
                      )}
                      <span className="text-2xl font-bold">{p.ms}<span className="text-sm text-muted-foreground ml-1">ms</span></span>
                    </div>
                    {p.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 break-all">{p.error}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">참고</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• DB / Storage 는 service_role 키 가용 여부도 함께 확인합니다.</p>
          <p>• Naver Map API 는 geocode 엔드포인트로 2초 타임아웃 내 응답을 측정합니다.</p>
          <p>• ms 값은 단일 측정이며, 네트워크 상황에 따라 편차가 있을 수 있습니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
