'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, FolderTree, Plus, Edit, Trash2, Home, Gift, ShoppingCart, Leaf, Store, Users } from 'lucide-react'
import { toast } from "sonner"

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

const categoryTypes = [
  { value: 'property', label: '매물', icon: Home },
  { value: 'sharing', label: '나눔', icon: Gift },
  { value: 'group_buying', label: '공동구매', icon: ShoppingCart },
  { value: 'local_food', label: '로컬푸드', icon: Leaf },
  { value: 'new_store', label: '신장개업', icon: Store },
  { value: 'club', label: '모임', icon: Users },
]

export default function CategorySettingsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('property')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Partial<Category> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('order_index', { ascending: true })

      setCategories((data || []) as any)
    } catch (error) {
      console.error('카테고리 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedCategory?.name) {
      toast('카테고리명을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        await supabase.from('categories').insert({
          name: selectedCategory.name,
          type: selectedCategory.type || activeTab,
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
      setEditModalOpen(false)
      setSelectedCategory(null)
    } catch (error) {
      console.error('카테고리 저장 실패:', error)
      toast.error('카테고리 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      await supabase.from('categories').delete().eq('id', id)
      await loadCategories()
    } catch (error) {
      console.error('카테고리 삭제 실패:', error)
    }
  }

  const openNewModal = () => {
    setSelectedCategory({ name: '', type: activeTab, is_active: true, order_index: 0 })
    setIsNew(true)
    setEditModalOpen(true)
  }

  const openEditModal = (category: Category) => {
    setSelectedCategory({ ...category })
    setIsNew(false)
    setEditModalOpen(true)
  }

  const filteredCategories = categories.filter((c) => c.type === activeTab)

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-primary" />
            카테고리 설정
          </h1>
          <p className="text-muted-foreground mt-1">각 서비스별 카테고리를 관리합니다. 변경사항은 즉시 등록 화면에 반영됩니다.</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4 mr-1" />
          카테고리 추가
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          {categoryTypes.map((type) => (
            <TabsTrigger key={type.value} value={type.value} className="gap-2">
              <type.icon className="w-4 h-4" />
              <span className="hidden md:inline">{type.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {categoryTypes.map((type) => (
          <TabsContent key={type.value} value={type.value}>
            <Card>
              <CardHeader>
                <CardTitle>{type.label} 카테고리</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredCategories.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">등록된 카테고리가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredCategories.map((category) => (
                      <div key={category.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {category.color && (
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: category.color }}
                            />
                          )}
                          <span className={`font-medium ${!category.is_active ? 'text-muted-foreground' : ''}`}>
                            {category.name}
                          </span>
                          {!category.is_active && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">비활성</span>
                          )}
                          <span className="text-xs text-muted-foreground">순서: {category.order_index}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditModal(category)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(category.id)} className="text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* 편집 모달 */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? '카테고리 추가' : '카테고리 편집'}</DialogTitle>
          </DialogHeader>
          {selectedCategory && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>카테고리 유형</Label>
                <Select
                  value={selectedCategory.type || activeTab}
                  onValueChange={(value) => setSelectedCategory({ ...selectedCategory, type: value })}
                  disabled={!isNew}
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
                  <p className="font-medium">활성화</p>
                  <p className="text-sm text-muted-foreground">카테고리를 사용 가능하게 합니다</p>
                </div>
                <Switch
                  checked={selectedCategory.is_active ?? true}
                  onCheckedChange={(checked) => setSelectedCategory({ ...selectedCategory, is_active: checked })}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>취소</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
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
