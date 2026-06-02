'use client'

/**
 * 슈퍼관리자 — 수수료 설정.
 * 광장별/카테고리별 수수료율 관리.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Percent, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'

interface CommissionRate {
  id: string
  plaza_id: string | null
  category: string | null
  rate: number
  effective_from: string
  created_at: string
}

const CATEGORIES = [
  { key: null, label: '전체 (기본)' },
  { key: 'property', label: '부동산' },
  { key: 'local-food', label: '로컬푸드' },
  { key: 'secondhand', label: '중고거래' },
  { key: 'group-buying', label: '공동구매' },
  { key: 'interior', label: '인테리어' },
  { key: 'moving', label: '이사' },
  { key: 'cleaning', label: '청소' },
  { key: 'repair', label: '수리' },
  { key: 'jobs', label: '구인구직' },
]

export default function SuperAdminCommissionPage() {
  const [loading, setLoading] = useState(true)
  const [rates, setRates] = useState<CommissionRate[]>([])
  const [plazas, setPlazas] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // 새 수수료 추가 폼
  const [newPlaza, setNewPlaza] = useState<string>('')
  const [newCategory, setNewCategory] = useState<string>('')
  const [newRate, setNewRate] = useState<string>('10')
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: rateData }, { data: plazaData }] = await Promise.all([
        (supabase as any)
          .from('commission_rates')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('plazas').select('id, name').order('name'),
      ])
      setRates((rateData as CommissionRate[]) || [])
      setPlazas((plazaData as { id: string; name: string }[]) || [])
    } catch (e) {
      console.error('Failed to load commission rates:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAdd = async () => {
    setSaving(true)
    try {
      await (supabase as any).from('commission_rates').insert({
        plaza_id: newPlaza || null,
        category: newCategory || null,
        rate: parseFloat(newRate) || 10,
        effective_from: new Date().toISOString().split('T')[0],
      })
      setNewPlaza('')
      setNewCategory('')
      setNewRate('10')
      await loadData()
    } catch (e) {
      console.error('Failed to add commission rate:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await (supabase as any).from('commission_rates').delete().eq('id', id)
      await loadData()
    } catch (e) {
      console.error('Failed to delete commission rate:', e)
    }
  }

  const getPlazaName = (id: string | null) => {
    if (!id) return '전체 기본'
    return plazas.find(p => p.id === id)?.name || id
  }

  const getCategoryLabel = (cat: string | null) => {
    if (!cat) return '전체'
    return CATEGORIES.find(c => c.key === cat)?.label || cat
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">수수료 설정</h1>
          <p className="text-gray-500 mt-1">광장별/카테고리별 플랫폼 수수료율 관리</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 새 수수료 추가 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            수수료율 추가
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">광장</label>
              <select
                value={newPlaza}
                onChange={(e) => setNewPlaza(e.target.value)}
                className="block w-44 rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">전체 (기본값)</option>
                {plazas.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">카테고리</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="block w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {CATEGORIES.map(c => (
                  <option key={c.key ?? 'all'} value={c.key ?? ''}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">수수료율 (%)</label>
              <input
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                min="0"
                max="100"
                step="0.5"
                className="block w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={handleAdd} disabled={saving} size="sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 현재 수수료율 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" />
            현재 수수료율
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Percent className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">등록된 수수료율이 없습니다</p>
              <p className="text-xs mt-1">위에서 기본 수수료율을 추가해주세요</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">광장</th>
                    <th className="text-left px-4 py-3 font-medium">카테고리</th>
                    <th className="text-right px-4 py-3 font-medium">수수료율</th>
                    <th className="text-left px-4 py-3 font-medium">적용일</th>
                    <th className="text-center px-4 py-3 font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rates.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline">{getPlazaName(r.plaza_id)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{getCategoryLabel(r.category)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{r.rate}%</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(r.effective_from).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
