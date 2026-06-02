'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, ImageIcon, Plus, Edit, Trash2, GripVertical,
  Eye, EyeOff, ExternalLink, Building2, Home, Gift,
  Heart, ShoppingCart, Store, UserPlus, Users
} from 'lucide-react'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  href: string | null
  icon: string | null
  gradient: string | null
  image_url: string | null
  order_index: number
  is_active: boolean
}

const iconOptions = [
  { value: 'Home', label: '집', Icon: Home },
  { value: 'Building2', label: '건물', Icon: Building2 },
  { value: 'Gift', label: '선물', Icon: Gift },
  { value: 'Heart', label: '하트', Icon: Heart },
  { value: 'ShoppingCart', label: '장바구니', Icon: ShoppingCart },
  { value: 'Store', label: '상점', Icon: Store },
  { value: 'UserPlus', label: '사용자+', Icon: UserPlus },
  { value: 'Users', label: '사용자들', Icon: Users },
]

const gradientOptions = [
  { value: 'from-emerald-700 via-teal-600 to-cyan-600', label: '에메랄드' },
  { value: 'from-slate-700 via-slate-600 to-slate-500', label: '슬레이트' },
  { value: 'from-amber-700 via-orange-600 to-yellow-500', label: '앰버' },
  { value: 'from-rose-600 via-pink-500 to-red-400', label: '로즈' },
  { value: 'from-blue-700 via-indigo-600 to-violet-500', label: '블루' },
  { value: 'from-amber-600 via-yellow-500 to-lime-400', label: '옐로우' },
  { value: 'from-teal-600 via-emerald-500 to-green-400', label: '틸' },
  { value: 'from-purple-700 via-violet-600 to-purple-500', label: '퍼플' },
]

const emptyBanner: Partial<Banner> = {
  title: '',
  subtitle: '',
  description: '',
  href: '/',
  icon: 'Home',
  gradient: 'from-emerald-700 via-teal-600 to-cyan-600',
  image_url: '',
  order_index: 0,
  is_active: true,
}

export default function BannerManagePage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selected, setSelected] = useState<Partial<Banner>>(emptyBanner)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadBanners()
  }, [])

  const loadBanners = async () => {
    setLoading(true)
    try {
      const plaza = getCurrentPlazaClient()
      let q: any = supabase
        .from('hero_banners')
        .select('*')
        .order('order_index', { ascending: true })
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data } = await q
      setBanners(data || [])
    } catch (err) {
      console.error('배너 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selected.title?.trim()) {
      setMessage({ type: 'error', text: '배너 제목을 입력해주세요.' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: selected.title,
        subtitle: selected.subtitle || null,
        description: selected.description || null,
        href: selected.href || '/',
        icon: selected.icon || 'Home',
        gradient: selected.gradient || null,
        image_url: selected.image_url || null,
        order_index: selected.order_index ?? 0,
        is_active: selected.is_active ?? true,
      }

      const plaza = getCurrentPlazaClient()
      if (isNew) {
        await (supabase as any).from('hero_banners').insert(plaza ? { ...payload, plaza_id: plaza } : payload)
      } else {
        let q = (supabase as any).from('hero_banners').update(payload).eq('id', selected.id)
        if (plaza) q = q.eq('plaza_id', plaza)
        await q
      }

      await loadBanners()
      setEditModalOpen(false)
      setMessage({ type: 'success', text: isNew ? '배너가 추가되었습니다.' : '배너가 수정되었습니다.' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('배너 저장 실패:', err)
      setMessage({ type: 'error', text: '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 배너를 삭제하시겠습니까?`)) return
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase.from('hero_banners').delete().eq('id', id)
      if (plaza) q = q.eq('plaza_id', plaza)
      await q
      await loadBanners()
      setMessage({ type: 'success', text: '배너가 삭제되었습니다.' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('배너 삭제 실패:', err)
    }
  }

  const handleToggleActive = async (banner: Banner) => {
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase
        .from('hero_banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id)
      if (plaza) q = q.eq('plaza_id', plaza)
      await q
      await loadBanners()
    } catch (err) {
      console.error('활성화 변경 실패:', err)
    }
  }

  const handleOrderChange = async (id: string, newOrder: number) => {
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase.from('hero_banners').update({ order_index: newOrder }).eq('id', id)
      if (plaza) q = q.eq('plaza_id', plaza)
      await q
      await loadBanners()
    } catch (err) {
      console.error('순서 변경 실패:', err)
    }
  }

  const openNew = () => {
    setSelected({ ...emptyBanner, order_index: banners.length })
    setIsNew(true)
    setEditModalOpen(true)
  }

  const openEdit = (banner: Banner) => {
    setSelected({ ...banner })
    setIsNew(false)
    setEditModalOpen(true)
  }

  const selectedIconObj = iconOptions.find((i) => i.value === selected.icon)
  const SelectedIcon = selectedIconObj?.Icon || Home

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" />
            배너 관리
          </h1>
          <p className="text-muted-foreground mt-1">
            홈 화면 히어로 배너를 관리합니다. 변경사항은 즉시 웹사이트에 반영됩니다.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />
          배너 추가
        </Button>
      </div>

      {/* Alert */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Banner List */}
      <Card>
        <CardHeader>
          <CardTitle>배너 목록 ({banners.length}개)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {banners.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              등록된 배너가 없습니다. 배너를 추가해주세요.
            </p>
          ) : (
            <div className="divide-y">
              {banners.map((banner) => {
                const BannerIcon = iconOptions.find((i) => i.value === banner.icon)?.Icon || Home
                return (
                  <div key={banner.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                    {/* Drag Handle */}
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />

                    {/* Preview */}
                    <div
                      className={`w-16 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${banner.gradient || 'from-gray-500 to-gray-600'}`}
                    >
                      <BannerIcon className="w-6 h-6 text-white" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{banner.title}</p>
                        <Badge variant={banner.is_active ? 'default' : 'secondary'}>
                          {banner.is_active ? '활성' : '비활성'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{banner.subtitle}</p>
                      {banner.href && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-3 h-3" />
                          {banner.href}
                        </p>
                      )}
                    </div>

                    {/* Order */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Label className="text-xs text-muted-foreground">순서</Label>
                      <Input
                        type="number"
                        value={banner.order_index}
                        onChange={(e) => handleOrderChange(banner.id, parseInt(e.target.value) || 0)}
                        className="w-16 h-8 text-center text-sm"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(banner)}
                        title={banner.is_active ? '비활성화' : '활성화'}
                      >
                        {banner.is_active ? (
                          <Eye className="w-4 h-4 text-green-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(banner)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(banner.id, banner.title)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? '배너 추가' : '배너 편집'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview */}
            <div
              className={`w-full h-32 rounded-xl flex flex-col items-center justify-center text-white bg-gradient-to-br ${
                selected.gradient || 'from-gray-500 to-gray-600'
              }`}
            >
              <SelectedIcon className="w-8 h-8 mb-1" />
              <p className="font-bold text-lg">{selected.title || '배너 제목'}</p>
              <p className="text-sm text-white/80">{selected.subtitle || '부제목'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label>배너 제목 *</Label>
                <Input
                  value={selected.title || ''}
                  onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                  placeholder="예: 우리동네 매물"
                />
              </div>

              <div className="grid gap-2">
                <Label>부제목</Label>
                <Input
                  value={selected.subtitle || ''}
                  onChange={(e) => setSelected({ ...selected, subtitle: e.target.value })}
                  placeholder="예: 춘천시 부동산 정보를 한눈에"
                />
              </div>

              <div className="grid gap-2">
                <Label>링크 URL</Label>
                <Input
                  value={selected.href || ''}
                  onChange={(e) => setSelected({ ...selected, href: e.target.value })}
                  placeholder="예: /properties"
                />
              </div>

              <div className="col-span-2 grid gap-2">
                <Label>설명</Label>
                <Input
                  value={selected.description || ''}
                  onChange={(e) => setSelected({ ...selected, description: e.target.value })}
                  placeholder="예: 전세, 월세, 매매까지 신뢰할 수 있는 매물 정보"
                />
              </div>

              <div className="col-span-2 grid gap-2">
                <Label>배경 이미지 URL (선택 — 입력 시 그라디언트 대신 사용)</Label>
                <Input
                  value={selected.image_url || ''}
                  onChange={(e) => setSelected({ ...selected, image_url: e.target.value })}
                  placeholder="예: /banners/hero-banner.jpg 또는 https://..."
                />
              </div>

              {/* Icon selector */}
              <div className="grid gap-2">
                <Label>아이콘</Label>
                <div className="grid grid-cols-4 gap-2">
                  {iconOptions.map(({ value, label, Icon: Ic }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelected({ ...selected, icon: value })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                        selected.icon === value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      <Ic className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gradient selector */}
              <div className="grid gap-2">
                <Label>배경 그라디언트</Label>
                <div className="grid grid-cols-4 gap-2">
                  {gradientOptions.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelected({ ...selected, gradient: value })}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border text-xs transition-colors ${
                        selected.gradient === value ? 'border-primary ring-2 ring-primary' : 'border-border'
                      }`}
                    >
                      <div className={`w-full h-8 rounded bg-gradient-to-br ${value}`} />
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>정렬 순서</Label>
                <Input
                  type="number"
                  value={selected.order_index ?? 0}
                  onChange={(e) =>
                    setSelected({ ...selected, order_index: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">활성화</p>
                  <p className="text-sm text-muted-foreground">웹사이트에 노출합니다</p>
                </div>
                <Switch
                  checked={selected.is_active ?? true}
                  onCheckedChange={(checked) => setSelected({ ...selected, is_active: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
