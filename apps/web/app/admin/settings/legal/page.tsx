'use client'

/**
 * 약관 관리 페이지.
 * 이용약관, 개인정보처리방침 버전별 관리.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FileText, Scale, Loader2, RotateCcw, Plus, Check, Save, Clock, ChevronRight, ArrowLeftRight } from 'lucide-react'

type DocType = 'terms' | 'privacy'

interface LegalDoc {
  id: string
  type: DocType
  version: string
  content: string
  is_active: boolean
  created_at: string
}

const tabs: { value: DocType; label: string }[] = [
  { value: 'terms', label: '이용약관' },
  { value: 'privacy', label: '개인정보처리방침' },
]

const TAB_LABELS: Record<DocType, string> = {
  terms: '이용약관',
  privacy: '개인정보처리방침',
}

export default function LegalPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<DocType>('terms')
  const [docs, setDocs] = useState<LegalDoc[]>([])

  // 편집 모드
  const [editVersion, setEditVersion] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // 버전 비교 모드
  const [compareA, setCompareA] = useState<string | null>(null) // doc id
  const [compareB, setCompareB] = useState<string | null>(null)

  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadDocs = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('legal_documents')
        .select('*')
        .eq('plaza_id', plaza)
        .eq('type', activeTab)
        .order('created_at', { ascending: false })

      setDocs(data || [])
    } catch (e) {
      // 테이블이 없을 수 있음 — 빈 상태로 표시
      console.error('Failed to load legal docs:', e)
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [plaza, activeTab])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleSaveNew = async () => {
    if (!plaza || !editVersion.trim() || !editContent.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          version: editVersion.trim(),
          content: editContent.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `저장 실패 (${res.status})`)
      }

      setMessage({ type: 'success', text: `${TAB_LABELS[activeTab]} v${editVersion}이(가) 등록되었습니다.` })
      setIsEditing(false)
      setEditVersion('')
      setEditContent('')
      await loadDocs()
    } catch (e: any) {
      setMessage({ type: 'error', text: `저장 실패: ${e?.message || '알 수 없는 오류'}` })
    } finally {
      setSaving(false)
    }
  }

  const handleSetActive = async (docId: string) => {
    if (!plaza) return
    try {
      const res = await fetch('/api/admin/settings/legal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeTab, docId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || '버전 변경 실패')
      }

      setMessage({ type: 'success', text: '현재 적용 버전이 변경되었습니다.' })
      await loadDocs()
    } catch (e: any) {
      setMessage({ type: 'error', text: '버전 변경에 실패했습니다.' })
    }
  }

  const activeDoc = docs.find((d) => d.is_active)
  const activeCount = docs.filter((d) => d.is_active).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Scale}
        title="약관 관리"
        description="이용약관 및 개인정보처리방침을 버전별로 관리합니다."
        badge={
          activeCount > 0 ? (
            <Badge variant="secondary" className="text-xs font-medium">
              적용 중 {activeCount}건
            </Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadDocs}>
              <RotateCcw className="w-4 h-4 mr-2" />
              새로고침
            </Button>
            <Button size="sm" onClick={() => { setIsEditing(true); setEditVersion(''); setEditContent('') }}>
              <Plus className="w-4 h-4 mr-2" />
              새 버전 등록
            </Button>
          </div>
        }
      />

      {message && (
        <div
          className={cn(
            'px-4 py-3 rounded-xl text-sm border',
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
          )}
        >
          {message.text}
        </div>
      )}

      {/* 탭 */}
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => { setActiveTab(t.value); setIsEditing(false); setCompareA(null); setCompareB(null) }}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition-all',
              activeTab === t.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 현재 적용 버전 */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">현재 적용 버전</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeDoc
                  ? `v${activeDoc.version} — ${new Date(activeDoc.created_at).toLocaleDateString('ko-KR')} 등록`
                  : '등록된 약관이 없습니다'}
              </p>
            </div>
            {activeDoc && (
              <Badge className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0">
                <Check className="w-3 h-3 mr-1" />
                적용 중
              </Badge>
            )}
          </div>
        </div>
        {activeDoc && (
          <div className="p-5">
            <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto text-sm whitespace-pre-wrap leading-relaxed text-foreground/80">
              {activeDoc.content}
            </div>
          </div>
        )}
      </div>

      {/* 새 버전 편집 */}
      {isEditing && (
        <div className="rounded-xl border-2 border-primary/30 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">새 버전 등록</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">버전</label>
              <Input
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                placeholder="예: 2.0"
                className="mt-1.5 max-w-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">내용</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm min-h-[200px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="약관 내용을 입력하세요"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSaveNew} disabled={saving || !editVersion.trim() || !editContent.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                등록
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>취소</Button>
            </div>
          </div>
        </div>
      )}

      {/* 버전 비교 */}
      {compareA && compareB && (() => {
        const docA = docs.find((d) => d.id === compareA)
        const docB = docs.find((d) => d.id === compareB)
        if (!docA || !docB) return null
        // 간단한 줄 단위 diff — 추가/삭제 하이라이트
        const linesA = docA.content.split('\n')
        const linesB = docB.content.split('\n')
        const maxLen = Math.max(linesA.length, linesB.length)
        return (
          <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold">
                    v{docA.version} vs v{docB.version} 비교
                  </h3>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setCompareA(null); setCompareB(null) }}>
                  닫기
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x max-h-[400px] overflow-y-auto">
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">v{docA.version} ({new Date(docA.created_at).toLocaleDateString('ko-KR')})</p>
                <div className="text-sm whitespace-pre-wrap leading-relaxed space-y-0">
                  {linesA.map((line, i) => (
                    <div key={i} className={cn(
                      'px-1 -mx-1',
                      i < linesB.length && line !== linesB[i] ? 'bg-red-100 dark:bg-red-950/30' : '',
                      i >= linesB.length ? 'bg-red-100 dark:bg-red-950/30' : '',
                    )}>
                      {line || ' '}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">v{docB.version} ({new Date(docB.created_at).toLocaleDateString('ko-KR')})</p>
                <div className="text-sm whitespace-pre-wrap leading-relaxed space-y-0">
                  {linesB.map((line, i) => (
                    <div key={i} className={cn(
                      'px-1 -mx-1',
                      i < linesA.length && line !== linesA[i] ? 'bg-green-100 dark:bg-green-950/30' : '',
                      i >= linesA.length ? 'bg-green-100 dark:bg-green-950/30' : '',
                    )}>
                      {line || ' '}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 비교 모드 힌트 */}
      {compareA && !compareB && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
          <span>첫 번째 버전이 선택됨 — 비교할 두 번째 버전을 선택하세요</span>
          <button onClick={() => setCompareA(null)} className="ml-auto text-blue-500 hover:text-blue-700 underline">취소</button>
        </div>
      )}

      {/* 버전 이력 */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">버전 이력</h3>
            {!loading && docs.length > 0 && (
              <span className="text-xs text-muted-foreground">{docs.length}개 버전</span>
            )}
          </div>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted mx-auto mb-3">
                <FileText className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">등록된 버전이 없습니다</p>
              <p className="text-xs text-muted-foreground/60 mt-1">새 버전을 등록하여 시작하세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className={cn(
                    'flex items-center justify-between p-3.5 rounded-lg border transition-colors',
                    doc.is_active
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={doc.is_active ? 'default' : 'secondary'}
                      className={cn(
                        'text-xs font-mono',
                        doc.is_active && 'bg-emerald-600 hover:bg-emerald-600'
                      )}
                    >
                      v{doc.version}
                    </Badge>
                    {doc.is_active && (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3 h-3" />
                        현재 적용
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {docs.length >= 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'text-xs h-7 px-2',
                          (compareA === doc.id || compareB === doc.id) && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700'
                        )}
                        onClick={() => {
                          if (!compareA || (compareA && compareB)) {
                            setCompareA(doc.id); setCompareB(null)
                          } else if (compareA === doc.id) {
                            setCompareA(null)
                          } else {
                            setCompareB(doc.id)
                          }
                        }}
                        title={!compareA ? '비교할 첫 번째 버전 선택' : compareA === doc.id ? '선택 해제' : '비교할 두 번째 버전 선택'}
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        {compareA && !compareB && compareA !== doc.id && (
                          <span className="ml-1">비교</span>
                        )}
                      </Button>
                    )}
                    {!doc.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-3"
                        onClick={() => handleSetActive(doc.id)}
                      >
                        이 버전 적용
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
