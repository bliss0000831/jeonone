'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from "sonner"
import {
  MapPin, FolderTree, Plus, Edit, Trash2, ChevronRight, ChevronDown,
  Loader2, Home, Gift, ShoppingCart, Leaf, Store, Users, ToggleLeft, CheckCircle2,
} from 'lucide-react'

/* ─────────────────────── Types ─────────────────────── */

interface Region {
  id: string
  name: string
  parent_id: string | null
  level: number | null
  is_active: boolean | null
  order_index: number | null
  children?: Region[]
  [key: string]: any
}

interface Category {
  id: string
  name: string
  type: string
  parent_id: string | null
  icon: string | null
  color: string | null
  is_active: boolean
  order_index: number
}

/* ─────────────────── Constants ─────────────────────── */

const mainTabs = [
  { value: 'region' as const, label: '지역 관리', icon: MapPin },
  { value: 'category' as const, label: '카테고리 관리', icon: FolderTree },
]

const categoryTypes = [
  { value: 'property', label: '매물', icon: Home, color: 'text-blue-600' },
  { value: 'sharing', label: '나눔', icon: Gift, color: 'text-pink-600' },
  { value: 'group_buying', label: '공동구매', icon: ShoppingCart, color: 'text-orange-600' },
  { value: 'local_food', label: '로컬푸드', icon: Leaf, color: 'text-green-600' },
  { value: 'new_store', label: '신장개업', icon: Store, color: 'text-purple-600' },
  { value: 'club', label: '모임', icon: Users, color: 'text-amber-600' },
]

/* ═══════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════ */

export default function RegionCategorySettingsPage() {
  const supabase = createClient()

  /* ── Shared state ── */
  const [mainTab, setMainTab] = useState<'region' | 'category'>('region')
  const [plazaId, setPlazaId] = useState<string | null>(null)

  /* ── Region state ── */
  const [regions, setRegions] = useState<Region[]>([])
  const [allRegionsFlat, setAllRegionsFlat] = useState<Region[]>([])
  const [regionLoading, setRegionLoading] = useState(true)
  const [regionModalOpen, setRegionModalOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<Partial<Region> | null>(null)
  const [regionParentId, setRegionParentId] = useState<string | null>(null)
  const [isNewRegion, setIsNewRegion] = useState(false)
  const [regionSaving, setRegionSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  /* ── Category state ── */
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryLoading, setCategoryLoading] = useState(true)
  const [categorySubTab, setCategorySubTab] = useState('property')
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Partial<Category> | null>(null)
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)

  /* ── Load on mount ── */
  useEffect(() => {
    const plaza = getCurrentPlazaClient()
    setPlazaId(plaza)
    loadRegions(plaza)
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ═══════════════════════════════════════════════════════
     Region CRUD
     ═══════════════════════════════════════════════════════ */

  const loadRegions = async (plaza?: string | null) => {
    try {
      const p = plaza ?? plazaId
      let q = supabase
        .from('regions')
        .select('*')
        .order('order_index', { ascending: true })
      if (p) q = q.eq('plaza_id', p)

      const { data } = await q

      if (data) {
        setAllRegionsFlat(data as Region[])

        const map = new Map<string, Region>()
        const roots: Region[] = []

        data.forEach((r: any) => {
          map.set(r.id, { ...r, children: [] })
        })
        data.forEach((r: any) => {
          const region = map.get(r.id)!
          if (r.parent_id && map.has(r.parent_id)) {
            map.get(r.parent_id)!.children!.push(region)
          } else {
            roots.push(region)
          }
        })

        setRegions(roots)
        setExpandedIds(new Set(roots.map((r) => r.id)))
      }
    } catch (error) {
      console.error('지역 로드 실패:', error)
    } finally {
      setRegionLoading(false)
    }
  }

  const handleRegionSave = async () => {
    if (!selectedRegion?.name) {
      toast('지역명을 입력해주세요.')
      return
    }
    setRegionSaving(true)
    try {
      if (isNewRegion) {
        const plaza = getCurrentPlazaClient()
        await supabase.from('regions').insert({
          name: selectedRegion.name,
          parent_id: regionParentId,
          level: regionParentId ? 2 : 1,
          is_active: selectedRegion.is_active ?? true,
          order_index: selectedRegion.order_index || 0,
          ...(plaza ? { plaza_id: plaza } : {}),
        })
      } else {
        await supabase
          .from('regions')
          .update({
            name: selectedRegion.name,
            is_active: selectedRegion.is_active,
            order_index: selectedRegion.order_index,
          })
          .eq('id', selectedRegion.id!)
      }
      await loadRegions()
      setRegionModalOpen(false)
      setSelectedRegion(null)
    } catch (error) {
      console.error('지역 저장 실패:', error)
      toast.error('지역 저장에 실패했습니다.')
    } finally {
      setRegionSaving(false)
    }
  }

  const handleRegionDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? 하위 지역도 모두 삭제됩니다.')) return
    try {
      await supabase.from('regions').delete().eq('parent_id', id)
      await supabase.from('regions').delete().eq('id', id)
      await loadRegions()
    } catch (error) {
      console.error('지역 삭제 실패:', error)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openNewRegionModal = (parentId: string | null = null) => {
    setSelectedRegion({ name: '', is_active: true, order_index: 0 })
    setRegionParentId(parentId)
    setIsNewRegion(true)
    setRegionModalOpen(true)
  }

  const openEditRegionModal = (region: Region) => {
    setSelectedRegion({ ...region })
    setRegionParentId(region.parent_id)
    setIsNewRegion(false)
    setRegionModalOpen(true)
  }

  /* ═══════════════════════════════════════════════════════
     Category CRUD
     ═══════════════════════════════════════════════════════ */

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('order_index', { ascending: true })

      setCategories((data || []) as Category[])
    } catch (error) {
      console.error('카테고리 로드 실패:', error)
    } finally {
      setCategoryLoading(false)
    }
  }

  const handleCategorySave = async () => {
    if (!selectedCategory?.name) {
      toast('카테고리명을 입력해주세요.')
      return
    }
    setCategorySaving(true)
    try {
      if (isNewCategory) {
        await supabase.from('categories').insert({
          name: selectedCategory.name,
          type: selectedCategory.type || categorySubTab,
          icon: selectedCategory.icon,
          color: selectedCategory.color,
          is_active: selectedCategory.is_active ?? true,
          order_index: selectedCategory.order_index || 0,
        })
      } else {
        await supabase
          .from('categories')
          .update({
            name: selectedCategory.name,
            icon: selectedCategory.icon,
            color: selectedCategory.color,
            is_active: selectedCategory.is_active,
            order_index: selectedCategory.order_index,
          })
          .eq('id', selectedCategory.id!)
      }
      await loadCategories()
      setCategoryModalOpen(false)
      setSelectedCategory(null)
    } catch (error) {
      console.error('카테고리 저장 실패:', error)
      toast.error('카테고리 저장에 실패했습니다.')
    } finally {
      setCategorySaving(false)
    }
  }

  const handleCategoryDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await supabase.from('categories').delete().eq('id', id)
      await loadCategories()
    } catch (error) {
      console.error('카테고리 삭제 실패:', error)
    }
  }

  const openNewCategoryModal = () => {
    setSelectedCategory({ name: '', type: categorySubTab, is_active: true, order_index: 0 })
    setIsNewCategory(true)
    setCategoryModalOpen(true)
  }

  const openEditCategoryModal = (category: Category) => {
    setSelectedCategory({ ...category })
    setIsNewCategory(false)
    setCategoryModalOpen(true)
  }

  /* ── Derived stats ── */
  const regionCount = allRegionsFlat.length
  const activeRegionCount = allRegionsFlat.filter((r) => r.is_active).length
  const categoryCount = categories.length
  const activeCategoryCount = categories.filter((c) => c.is_active).length
  const filteredCategories = categories.filter((c) => c.type === categorySubTab)

  /* ── Loading gate ── */
  if (regionLoading && categoryLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     Render helpers
     ═══════════════════════════════════════════════════════ */

  const renderRegionNode = (region: Region, depth: number = 0) => {
    const isExpanded = expandedIds.has(region.id)
    const hasChildren = region.children && region.children.length > 0

    return (
      <div key={region.id}>
        <div
          className={cn(
            'flex items-center justify-between py-2.5 px-3 transition-colors',
            'hover:bg-muted/50 border-b border-border/50 last:border-b-0',
          )}
          style={{ paddingLeft: `${depth * 28 + 12}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(region.id)}
                className="p-0.5 rounded hover:bg-muted"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}
            <MapPin className={cn('w-3.5 h-3.5 shrink-0', region.is_active ? 'text-primary' : 'text-muted-foreground/50')} />
            <span className={cn('text-sm font-medium truncate', !region.is_active && 'text-muted-foreground line-through')}>
              {region.name}
            </span>
            {!region.is_active && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                비활성
              </span>
            )}
            {hasChildren && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                ({region.children!.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(!region.level || region.level === 1) && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openNewRegionModal(region.id)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditRegionModal(region)}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => handleRegionDelete(region.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>{region.children!.map((child) => renderRegionNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     JSX
     ═══════════════════════════════════════════════════════ */

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <AdminPageHeader
        icon={MapPin}
        title="지역/카테고리 설정"
        description="서비스 제공 지역과 카테고리를 관리합니다. 변경사항은 즉시 반영됩니다."
      />

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '전체 지역', value: regionCount, icon: MapPin, color: 'text-blue-600' },
          { label: '활성 지역', value: activeRegionCount, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: '전체 카테고리', value: categoryCount, icon: FolderTree, color: 'text-purple-600' },
          { label: '활성 카테고리', value: activeCategoryCount, icon: ToggleLeft, color: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={cn('w-3.5 h-3.5', color)} />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ── Main tabs ── */}
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
        {mainTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setMainTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all',
              mainTab === t.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-muted text-muted-foreground',
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
         Region Tab
         ═══════════════════════════════════════════════════ */}
      {mainTab === 'region' && (
        <div className="space-y-4">
          {/* info banner + add button */}
          <div className="flex items-start justify-between gap-4">
            <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400 flex-1">
              상위 지역(예: 춘천시) &rarr; 하위 지역(예: 소양동) 2단계 구조입니다. 활성화된 지역만 동네 선택 UI에 노출됩니다.
            </div>
            <Button size="sm" onClick={() => openNewRegionModal(null)} className="shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" />
              상위 지역 추가
            </Button>
          </div>

          {/* region tree */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">지역 목록</h3>
            </div>
            {regions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">등록된 지역이 없습니다.</p>
            ) : (
              <div>{regions.map((region) => renderRegionNode(region))}</div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         Category Tab
         ═══════════════════════════════════════════════════ */}
      {mainTab === 'category' && (
        <div className="space-y-4">
          {/* sub-tabs + add button */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1 overflow-x-auto">
              {categoryTypes.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    onClick={() => setCategorySubTab(t.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                      categorySubTab === t.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'hover:bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                )
              })}
            </div>
            <Button size="sm" onClick={openNewCategoryModal} className="shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" />
              카테고리 추가
            </Button>
          </div>

          {/* category list */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {categoryTypes.find((t) => t.value === categorySubTab)?.label} 카테고리
              </h3>
            </div>
            {filteredCategories.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">등록된 카테고리가 없습니다.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between py-2.5 px-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {category.color ? (
                        <div
                          className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                          style={{ backgroundColor: category.color }}
                        />
                      ) : (
                        <div className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/20" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium truncate',
                          !category.is_active && 'text-muted-foreground line-through',
                        )}
                      >
                        {category.name}
                      </span>
                      {!category.is_active && (
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                          비활성
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground shrink-0">#{category.order_index}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditCategoryModal(category)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => handleCategoryDelete(category.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         Region Modal
         ═══════════════════════════════════════════════════ */}
      <Dialog open={regionModalOpen} onOpenChange={setRegionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNewRegion ? '지역 추가' : '지역 편집'}</DialogTitle>
          </DialogHeader>
          {selectedRegion && (
            <div className="space-y-4">
              {regionParentId && (
                <p className="text-sm text-muted-foreground">상위 지역의 하위 지역으로 추가됩니다.</p>
              )}

              <div className="grid gap-2">
                <Label>지역명</Label>
                <Input
                  value={selectedRegion.name || ''}
                  onChange={(e) => setSelectedRegion({ ...selectedRegion, name: e.target.value })}
                  placeholder="예: 춘천시, 소양동"
                />
              </div>

              <div className="grid gap-2">
                <Label>정렬 순서</Label>
                <Input
                  type="number"
                  value={selectedRegion.order_index || 0}
                  onChange={(e) => setSelectedRegion({ ...selectedRegion, order_index: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">활성화</p>
                  <p className="text-xs text-muted-foreground">지역을 사용 가능하게 합니다</p>
                </div>
                <Switch
                  checked={selectedRegion.is_active ?? true}
                  onCheckedChange={(checked) => setSelectedRegion({ ...selectedRegion, is_active: checked })}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setRegionModalOpen(false)}>취소</Button>
                <Button onClick={handleRegionSave} disabled={regionSaving}>
                  {regionSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  저장
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════
         Category Modal
         ═══════════════════════════════════════════════════ */}
      <Dialog open={categoryModalOpen} onOpenChange={setCategoryModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNewCategory ? '카테고리 추가' : '카테고리 편집'}</DialogTitle>
          </DialogHeader>
          {selectedCategory && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>카테고리 유형</Label>
                <Select
                  value={selectedCategory.type || categorySubTab}
                  onValueChange={(value) => setSelectedCategory({ ...selectedCategory, type: value })}
                  disabled={!isNewCategory}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>카테고리명</Label>
                <Input
                  value={selectedCategory.name || ''}
                  onChange={(e) => setSelectedCategory({ ...selectedCategory, name: e.target.value })}
                  placeholder="예: 아파트, 원룸"
                />
              </div>

              <div className="grid gap-2">
                <Label>아이콘 (선택)</Label>
                <Input
                  value={selectedCategory.icon || ''}
                  onChange={(e) => setSelectedCategory({ ...selectedCategory, icon: e.target.value })}
                  placeholder="lucide 아이콘명 (예: home, building)"
                />
              </div>

              <div className="grid gap-2">
                <Label>색상 (선택)</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={selectedCategory.color || '#3b82f6'}
                    onChange={(e) => setSelectedCategory({ ...selectedCategory, color: e.target.value })}
                    className="w-14 h-10 p-1"
                  />
                  <Input
                    value={selectedCategory.color || ''}
                    onChange={(e) => setSelectedCategory({ ...selectedCategory, color: e.target.value })}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>정렬 순서</Label>
                <Input
                  type="number"
                  value={selectedCategory.order_index || 0}
                  onChange={(e) => setSelectedCategory({ ...selectedCategory, order_index: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">활성화</p>
                  <p className="text-xs text-muted-foreground">카테고리를 사용 가능하게 합니다</p>
                </div>
                <Switch
                  checked={selectedCategory.is_active ?? true}
                  onCheckedChange={(checked) => setSelectedCategory({ ...selectedCategory, is_active: checked })}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCategoryModalOpen(false)}>취소</Button>
                <Button onClick={handleCategorySave} disabled={categorySaving}>
                  {categorySaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  저장
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
