'use client'

/**
 * 지역별 사업자 정보 관리.
 *
 * 현재 지역(서브도메인 또는 plaza_admins 매핑) 의 plazas.business_info 를
 * 직접 편집. RPC update_plaza_business_info 로 권한 검증.
 *
 * 입력값은 약관·푸터·면책 띠 등 모든 곳에 자동 반영됨.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Building2, AlertTriangle } from 'lucide-react'

type BusinessInfo = {
  business_name: string
  ceo_name: string
  business_number: string
  mailorder_number: string
  address: string
  phone: string
  email: string
  job_info_number: string
  privacy_officer: string
}

const EMPTY: BusinessInfo = {
  business_name: '',
  ceo_name: '',
  business_number: '',
  mailorder_number: '',
  address: '',
  phone: '',
  email: '',
  job_info_number: '',
  privacy_officer: '',
}

export default function BusinessSettingsPage() {
  const [info, setInfo] = useState<BusinessInfo>(EMPTY)
  const [plazaId, setPlazaId] = useState<string | null>(null)
  const [plazaName, setPlazaName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      try {
        const plaza = getCurrentPlazaClient()
        setPlazaId(plaza)
        if (!plaza) {
          setLoading(false)
          return
        }
        const { data } = await supabase
          .from('plazas')
          .select('name, business_info')
          .eq('id', plaza)
          .single()
        if (data) {
          setPlazaName(data.name || '')
          const raw = (data as { business_info?: Record<string, unknown> }).business_info || {}
          setInfo({
            business_name:    String(raw.business_name ?? ''),
            ceo_name:         String(raw.ceo_name ?? ''),
            business_number:  String(raw.business_number ?? ''),
            mailorder_number: String(raw.mailorder_number ?? ''),
            address:          String(raw.address ?? ''),
            phone:            String(raw.phone ?? ''),
            email:            String(raw.email ?? ''),
            job_info_number:  String(raw.job_info_number ?? ''),
            privacy_officer:  String(raw.privacy_officer ?? ''),
          })
        }
      } catch (e) {
        console.error('사업자 정보 로드 실패:', e)
        setMessage({ type: 'error', text: '정보 로드에 실패했습니다.' })
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    if (!plazaId) return
    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase.rpc('update_plaza_business_info', {
        p_plaza_id: plazaId,
        p_info: info,
      })
      if (error) throw error
      setMessage({ type: 'success', text: '사업자 정보가 저장되었습니다. 약관·푸터·면책 고지에 즉시 반영됩니다.' })
    } catch (e: any) {
      console.error('저장 실패:', e)
      setMessage({ type: 'error', text: e?.message || '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
  }

  if (!plazaId) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">지역 도메인에서 접근해주세요</p>
            <p className="text-sm text-amber-800 mt-1">
              사업자 정보는 지역별로 격리되어 저장됩니다. 허브 도메인이 아닌 각 지역의 서브도메인에서 관리해주세요.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          사업자 정보
        </h1>
        <p className="text-muted-foreground mt-1">
          <strong>{plazaName}</strong> 지역의 사업자 정보입니다. 이용약관·푸터·면책 고지·결제 화면 등 법적 표시가
          필요한 모든 곳에 자동 반영됩니다.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
        <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-blue-900">
          <p className="font-medium">⚠ 지역별로 다른 사업자가 운영합니다</p>
          <p className="mt-1">
            이 정보는 <strong>{plazaName}</strong> 에만 적용되며, 다른 지역에는 표시되지 않습니다.
            한 번 저장하면 약관·푸터·면책 문구가 모두 자동 갱신되니, 정확한 정보를 입력해주세요.
          </p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>법인·대표자 정보 (필수)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="business_name">상호 *</Label>
              <Input
                id="business_name"
                value={info.business_name}
                onChange={(e) => setInfo({ ...info, business_name: e.target.value })}
                placeholder="예) 전원일기 / 주식회사 전원일기"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ceo_name">대표자명 *</Label>
              <Input
                id="ceo_name"
                value={info.ceo_name}
                onChange={(e) => setInfo({ ...info, ceo_name: e.target.value })}
                placeholder="예) 홍길동"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="business_number">사업자등록번호 *</Label>
              <Input
                id="business_number"
                value={info.business_number}
                onChange={(e) => setInfo({ ...info, business_number: e.target.value })}
                placeholder="예) 000-00-00000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mailorder_number">통신판매업 신고번호</Label>
              <Input
                id="mailorder_number"
                value={info.mailorder_number}
                onChange={(e) => setInfo({ ...info, mailorder_number: e.target.value })}
                placeholder="예) 제0000-춘천-0000호"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>연락처 / 주소</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="address">사업장 소재지</Label>
            <Textarea
              id="address"
              value={info.address}
              onChange={(e) => setInfo({ ...info, address: e.target.value })}
              placeholder="예) 강원특별자치도 춘천시 중앙로 1, 전원일기빌딩 5층"
              rows={2}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">대표전화</Label>
              <Input
                id="phone"
                value={info.phone}
                onChange={(e) => setInfo({ ...info, phone: e.target.value })}
                placeholder="예) 033-000-0000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">대표이메일</Label>
              <Input
                id="email"
                type="email"
                value={info.email}
                onChange={(e) => setInfo({ ...info, email: e.target.value })}
                placeholder="예) hello@chuncheon.gwangjang.app"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>선택 항목</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="job_info_number">직업정보제공사업 신고번호 (일손 운영 시)</Label>
            <Input
              id="job_info_number"
              value={info.job_info_number}
              onChange={(e) => setInfo({ ...info, job_info_number: e.target.value })}
              placeholder="예) 제0000호 / 강원지방고용노동청"
            />
            <p className="text-xs text-muted-foreground">
              일손 게시판을 운영하려면 직업안정법상 신고가 필요합니다. 신고 후 번호를 입력하면 일손 메인에 자동 표시됩니다.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="privacy_officer">개인정보 보호책임자</Label>
            <Input
              id="privacy_officer"
              value={info.privacy_officer}
              onChange={(e) => setInfo({ ...info, privacy_officer: e.target.value })}
              placeholder="예) 홍길동 (대표자 겸임 가능)"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
