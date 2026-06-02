'use client'

import { useState, useEffect, useMemo } from 'react'
import NextImage from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { AdminPageHeader } from '@/components/admin/page-header'
import {
  Loader2, Layers, Plus, Edit, Trash2, Eye, EyeOff,
  Calendar, Link2, Image, Monitor, Move, Clock,
  CheckCircle2, XCircle, AlertTriangle, MousePointerClick,
} from 'lucide-react'
import { format } from 'date-fns/format'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

interface Popup {
  id: string
  title: string
  content: string | null
  image_url: string | null
  link_url: string | null
  position_x: number
  position_y: number
  width: number
  height: number
  start_date: string | null
  end_date: string | null
  is_active: boolean
  show_today_hide: boolean
  display_pages: string[]
  created_at: string
}

const defaultPopup: Omit<Popup, 'id' | 'created_at'> = {
  title: '',
  content: '',
  image_url: '',
  link_url: '',
  position_x: 100,
  position_y: 100,
  width: 400,
  height: 300,
  start_date: null,
  end_date: null,
  is_active: true,
  show_today_hide: true,
  display_pages: ['home'],
}

function getPopupStatus(popup: Popup): 'active' | 'scheduled' | 'expired' | 'inactive' {
  if (!popup.is_active) return 'inactive'
  const now = Date.now()
  if (popup.start_date && new Date(popup.start_date).getTime() > now) return 'scheduled'
  if (popup.end_date && new Date(popup.end_date).getTime() < now) return 'expired'
  return 'active'
}

const STATUS_CONFIG = {
  active: { label: '활성', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2 },
  scheduled: { label: '예약됨', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', icon: Clock },
  expired: { label: '만료', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: XCircle },
  inactive: { label: '비활성', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: EyeOff },
}

export default function PopupManagementPage() {
  const [popups, setPopups] = useState<Popup[]>([])
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedPopup, setSelectedPopup] = useState<Partial<Popup> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadPopups()
  }, [])

  const loadPopups = async () => {
    try {
      const plaza = getCurrentPlazaClient()
      let q: any = supabase
        .from('popups')
        .select('*')
        .order('created_at', { ascending: false })
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data } = await q
      setPopups(data || [])
    } catch (error) {
      console.error('팝업 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 통계
  const stats = useMemo(() => {
    const active = popups.filter(p => getPopupStatus(p) === 'active').length
    const scheduled = popups.filter(p => getPopupStatus(p) === 'scheduled').length
    const expired = popups.filter(p => getPopupStatus(p) === 'expired').length
    const inactive = popups.filter(p => getPopupStatus(p) === 'inactive').length
    return { total: popups.length, active, scheduled, expired, inactive }
  }, [popups])

  const handleSave = async () => {
    if (!selectedPopup?.title) {
      toast('팝업 제목을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const plaza = getCurrentPlazaClient()
        await supabase.from('popups').insert({
          ...defaultPopup,
          ...selectedPopup,
          ...(plaza ? { plaza_id: plaza } : {}),
        })
      } else {
        const plaza = getCurrentPlazaClient()
        let q = supabase
          .from('popups')
          .update(selectedPopup)
          .eq('id', selectedPopup.id!)
        if (plaza) q = q.eq('plaza_id', plaza)
        await q
      }

      await loadPopups()
      setEditModalOpen(false)
      setSelectedPopup(null)
    } catch (error) {
      console.error('팝업 저장 실패:', error)
      toast.error('팝업 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    setDeletingId(id)
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase.from('popups').delete().eq('id', id)
      if (plaza) q = q.eq('plaza_id', plaza)
      await q
      await loadPopups()
    } catch (error) {
      console.error('팝업 삭제 실패:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleActive = async (popup: Popup) => {
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase
        .from('popups')
        .update({ is_active: !popup.is_active })
        .eq('id', popup.id)
      if (plaza) q = q.eq('plaza_id', plaza)
      await q
      await loadPopups()
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  const openNewModal = () => {
    setSelectedPopup({ ...defaultPopup })
    setIsNew(true)
    setEditModalOpen(true)
  }

  const openEditModal = (popup: Popup) => {
    setSelectedPopup({ ...popup })
    setIsNew(false)
    setEditModalOpen(true)
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="팝업 레이어 관리"
        description="홈페이지에 표시되는 레이어 팝업을 관리합니다"
        icon={<Layers className="w-6 h-6" />}
        badge={
          popups.length > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {popups.length}개 등록
            </span>
          ) : null
        }
        actions={
          <Button onClick={openNewModal} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            새 팝업 추가
          </Button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '전체', value: stats.total, icon: Layers, color: 'text-foreground' },
          { label: '활성', value: stats.active, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: '예약됨', value: stats.scheduled, icon: Clock, color: 'text-blue-600' },
          { label: '만료', value: stats.expired, icon: XCircle, color: 'text-gray-500' },
          { label: '비활성', value: stats.inactive, icon: EyeOff, color: 'text-gray-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-xl border bg-card">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', color)} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={cn('text-2xl font-bold', color)}>{value}</div>
          </div>
        ))}
      </div>

      {/* 팝업 설정 안내 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Image className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">이미지 팝업</span>
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/60">이미지 URL + 클릭 링크로 비주얼 팝업</p>
        </div>
        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">예약 노출</span>
          </div>
          <p className="text-xs text-purple-600/80 dark:text-purple-400/60">시작/종료일 설정으로 자동 노출/종료</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">오늘 하루 닫기</span>
          </div>
          <p className="text-xs text-gray-500/80 dark:text-gray-400/60">사용자에게 "오늘 보지 않기" 옵션 제공</p>
        </div>
      </div>

      {/* 팝업 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">팝업 목록을 불러오는 중...</span>
        </div>
      ) : popups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Layers className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">등록된 팝업이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">위 "새 팝업 추가" 버튼으로 첫 팝업을 만들어보세요</p>
          </div>
          <Button onClick={openNewModal} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            팝업 만들기
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{popups.length}개 팝업</p>
          <div className="space-y-3">
            {popups.map((popup) => {
              const status = getPopupStatus(popup)
              const StatusIcon = STATUS_CONFIG[status].icon

              return (
                <div
                  key={popup.id}
                  className={cn(
                    'rounded-xl border bg-card transition-all hover:shadow-sm group overflow-hidden',
                    status === 'active' && 'border-emerald-200/60 dark:border-emerald-900/30',
                    status === 'expired' && 'opacity-60',
                  )}
                >
                  <div className="flex items-stretch">
                    {/* 이미지 미리보기 */}
                    <div className="relative w-28 md:w-36 shrink-0 bg-muted/30 flex items-center justify-center border-r">
                      {popup.image_url ? (
                        <NextImage src={popup.image_url} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                          <Layers className="w-8 h-8" />
                          <span className="text-[10px]">이미지 없음</span>
                        </div>
                      )}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 p-4 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-bold">{popup.title}</span>
                        <span className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1',
                          STATUS_CONFIG[status].color,
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {STATUS_CONFIG[status].label}
                        </span>
                        {popup.show_today_hide && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                            오늘하루닫기
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {popup.start_date && popup.end_date
                            ? `${format(new Date(popup.start_date), 'yyyy.MM.dd')} ~ ${format(new Date(popup.end_date), 'yyyy.MM.dd')}`
                            : '기간 제한 없음'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          {popup.width}x{popup.height}px
                        </span>
                        <span className="flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          ({popup.position_x}, {popup.position_y})
                        </span>
                        {popup.link_url && (
                          <span className="flex items-center gap-1 text-blue-500 truncate max-w-[200px]">
                            <Link2 className="w-3 h-3 shrink-0" />
                            {popup.link_url}
                          </span>
                        )}
                      </div>

                      {popup.content && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                          {popup.content}
                        </p>
                      )}
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-1 px-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActive(popup)}
                        className={cn(
                          'p-2 rounded-lg transition-colors',
                          popup.is_active
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={popup.is_active ? '비활성화' : '활성화'}
                      >
                        {popup.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(popup)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="편집"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(popup.id)}
                        disabled={deletingId === popup.id}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="삭제"
                      >
                        {deletingId === popup.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 편집 모달 */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isNew ? <Plus className="w-5 h-5 text-primary" /> : <Edit className="w-5 h-5 text-primary" />}
              {isNew ? '새 팝업 추가' : '팝업 편집'}
            </DialogTitle>
            <DialogDescription>
              팝업의 내용, 크기, 위치, 노출 기간을 설정합니다
            </DialogDescription>
          </DialogHeader>
          {selectedPopup && (
            <div className="space-y-5">
              {/* 기본 정보 */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기본 정보</h3>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">팝업 제목 <span className="text-red-500">*</span></Label>
                    <Input
                      value={selectedPopup.title || ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, title: e.target.value })}
                      placeholder="예: 봄맞이 이벤트 안내"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">내용</Label>
                    <Textarea
                      value={selectedPopup.content || ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, content: e.target.value })}
                      placeholder="팝업 내용 (HTML 가능)"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* 미디어 */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">미디어 & 링크</h3>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5" /> 이미지 URL
                    </Label>
                    <Input
                      value={selectedPopup.image_url || ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, image_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> 클릭 시 이동 URL
                    </Label>
                    <Input
                      value={selectedPopup.link_url || ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, link_url: e.target.value })}
                      placeholder="https://... 또는 /path"
                    />
                  </div>
                </div>
              </div>

              {/* 크기 & 위치 */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">크기 & 위치</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">가로 (px)</Label>
                    <Input
                      type="number"
                      value={selectedPopup.width || 400}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, width: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">세로 (px)</Label>
                    <Input
                      type="number"
                      value={selectedPopup.height || 300}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, height: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">X 위치 (px)</Label>
                    <Input
                      type="number"
                      value={selectedPopup.position_x || 100}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, position_x: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Y 위치 (px)</Label>
                    <Input
                      type="number"
                      value={selectedPopup.position_y || 100}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, position_y: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* 노출 기간 */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">노출 기간</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">시작일</Label>
                    <Input
                      type="datetime-local"
                      value={selectedPopup.start_date ? format(new Date(selectedPopup.start_date), "yyyy-MM-dd'T'HH:mm") : ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, start_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">종료일</Label>
                    <Input
                      type="datetime-local"
                      value={selectedPopup.end_date ? format(new Date(selectedPopup.end_date), "yyyy-MM-dd'T'HH:mm") : ''}
                      onChange={(e) => setSelectedPopup({ ...selectedPopup, end_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">비워두면 기간 제한 없이 항상 노출됩니다</p>
              </div>

              {/* 옵션 */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">옵션</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <p className="text-sm font-medium">활성화</p>
                      <p className="text-xs text-muted-foreground">팝업을 사용자에게 표시합니다</p>
                    </div>
                    <Switch
                      checked={selectedPopup.is_active ?? true}
                      onCheckedChange={(checked) => setSelectedPopup({ ...selectedPopup, is_active: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <p className="text-sm font-medium">오늘 하루 보지 않기</p>
                      <p className="text-xs text-muted-foreground">사용자가 닫을 때 체크박스를 표시합니다</p>
                    </div>
                    <Switch
                      checked={selectedPopup.show_today_hide ?? true}
                      onCheckedChange={(checked) => setSelectedPopup({ ...selectedPopup, show_today_hide: checked })}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>취소</Button>
                <Button onClick={handleSave} disabled={saving || !selectedPopup.title?.trim()}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  {isNew ? '팝업 추가' : '변경 저장'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
