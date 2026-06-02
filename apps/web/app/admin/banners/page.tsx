'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { ChevronLeft, Trash2, Edit2, Save, X, GripVertical, Image as ImageIcon, Home as HomeIcon, Upload, Loader2, Eye, Settings, Building2, Home, Gift, ShoppingCart, Store, UserPlus, Heart, Users, ChevronUp, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { toast } from "sonner"

interface Banner {
  id: string
  title: string
  subtitle: string
  description: string
  href: string
  gradient: string
  icon: string
  image_url?: string
  order_index: number
  is_active: boolean
  created_at: string
  // 커스터마이징
  opacity?: number | null
  font_family?: string | null
  logo_image_url?: string | null
}

export default function BannerManagementPage() {
  const router = useRouter()
  const supabase = createClient()
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  
  // 기본 배너 데이터
  const defaultBanners: Banner[] = [
    {
      id: '0',
      title: "더 나은 집, 더 가까운 이웃",
      subtitle: "우리 동네 부동산 정보부터 따뜻한 나눔과 공동구매까지",
      description: "춘천광장에서 함께하세요",
      href: "/",
      icon: "Home",
      gradient: "from-primary/80 to-primary",
      image_url: "/banners/hero-banner.jpg",
      order_index: 0,
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: '1',
      title: "우리동네 매물",
      subtitle: "춘천시 부동산 정보를 한눈에",
      description: "전세, 월세, 매매까지 우리 동네 모든 매물을 확인하세요",
      href: "/properties",
      icon: "Building2",
      gradient: "from-blue-500 to-cyan-500",
      image_url: "/banners/properties-banner.jpg",
      order_index: 1,
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      title: "우리동네 홈즈",
      subtitle: "집 꾸미기부터 이사까지",
      description: "인테리어, 이사, 청소, 수리 전문가를 만나보세요",
      href: "/interior",
      icon: "Home",
      gradient: "from-purple-500 to-pink-500",
      image_url: "/banners/interior-banner.jpg",
      order_index: 2,
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ]
  
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    description: '',
    href: '',
    gradient: 'from-blue-500 to-cyan-500',
    icon: 'Building2',
    image_url: '',
    opacity: 40,
    font_family: 'sans',
    logo_image_url: '',
  })
  const [uploading, setUploading] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // 권한 확인
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
      router.push('/')
      return
    }

    loadBanners()
  }

  const [tableExists, setTableExists] = useState(true)

  const loadBanners = async () => {
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('hero_banners')
      .select('*')
      .order('order_index', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q

    if (error) {
      // Table doesn't exist yet
      if (error.code === 'PGRST205') {
        setTableExists(false)
      }
    } else {
      setBanners(data || [])
      setTableExists(true)
    }
    setLoading(false)
  }

  /** defaultBanners 를 실제 DB 에 insert 해서 처음부터 편집 가능하게 만든다.
   *  tableExists=true && banners=[] 상태에서만 의미 있다 (빈 테이블에 seed). */
  const [seeding, setSeeding] = useState(false)
  const handleSeedDefaults = async () => {
    if (!tableExists) {
      toast('먼저 hero_banners 테이블을 생성해주세요 (위 SQL 실행).')
      return
    }
    if (banners.length > 0) {
      if (!confirm('이미 배너가 있습니다. 기본 배너 7개를 추가로 더 넣을까요?')) return
    }
    setSeeding(true)
    try {
      const baseOrder =
        banners.length > 0 ? Math.max(...banners.map((b) => b.order_index)) + 1 : 0
      // 진짜 기본 7개 (lib/hero-banners.ts 와 동일). id 는 Supabase 가 UUID 로 자동 생성.
      const seed = [
        { title: '춘천광장', subtitle: '더 나은 집, 더 가까운 이웃', description: '호수의 도시 춘천에서 따뜻한 이웃을 만나세요', href: '/', icon: 'Home', gradient: 'from-emerald-700 via-teal-600 to-cyan-600', image_url: '/banners/hero-banner.jpg' },
        { title: '우리동네 매물', subtitle: '춘천시 부동산 정보를 한눈에', description: '전세, 월세, 매매까지 신뢰할 수 있는 매물 정보', href: '/properties', icon: 'Building2', gradient: 'from-slate-700 via-slate-600 to-slate-500', image_url: '/banners/properties-banner.jpg' },
        { title: '우리동네 홈즈', subtitle: '집 꾸미기부터 이사까지', description: '검증된 인테리어, 이사, 청소, 수리 전문가', href: '/interior', icon: 'Home', gradient: 'from-amber-700 via-orange-600 to-yellow-500', image_url: '/banners/interior-banner.jpg' },
        { title: '이웃과 나눔', subtitle: '따뜻한 이웃사촌', description: '안 쓰는 물건, 이웃과 나누면 더 가치있어요', href: '/sharing', icon: 'Heart', gradient: 'from-rose-600 via-pink-500 to-red-400', image_url: '/banners/sharing-banner.jpg' },
        { title: '함께 사면 싸다', subtitle: '우리 동네 공동구매', description: '이웃과 함께 구매하면 더 저렴하게', href: '/group-buying', icon: 'ShoppingCart', gradient: 'from-blue-700 via-indigo-600 to-violet-500', image_url: '/banners/group-buying-banner.jpg' },
        { title: '새로 오픈했어요', subtitle: '우리 동네 새 가게 소식', description: '동네에 새로 문 연 가게들을 소개합니다', href: '/new-store', icon: 'Store', gradient: 'from-amber-600 via-yellow-500 to-lime-400', image_url: '/banners/new-store-banner.jpg' },
        { title: '전문가 초대', subtitle: '채팅에서 전문가를 바로 연결', description: '필요한 전문가를 쉽고 빠르게 만나보세요', href: '/faq', icon: 'UserPlus', gradient: 'from-teal-600 via-emerald-500 to-green-400', image_url: '/banners/expert-banner.jpg' },
      ].map((b, i) => ({
        ...b,
        order_index: baseOrder + i,
        is_active: true,
        opacity: 40,
        font_family: 'sans',
        ...(getCurrentPlazaClient() ? { plaza_id: getCurrentPlazaClient() } : {}),
      }))
      const { error } = await supabase.from('hero_banners').insert(seed)
      if (error) {
        console.error('[banners] seed 실패', error)
        toast.error('기본 배너 저장 실패: ' + error.message)
      } else {
        await loadBanners()
      }
    } finally {
      setSeeding(false)
    }
  }

  // UUID 형태인지 검사. '0','1','2' 같은 defaultBanners 의 가짜 id 는 false.
  const isRealDbBanner = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast('파일 크기는 5MB 이하여야 합니다.')
      return
    }

    setUploading(true)

    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const { url } = await response.json()
      setFormData({ ...formData, image_url: url })
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('이미지 업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.title || !formData.href) {
      toast('제목과 링크는 필수입니다.')
      return
    }

    if (editingId) {
      // 수정
      const { error } = await supabase
        .from('hero_banners')
        .update({
          title: formData.title,
          subtitle: formData.subtitle,
          description: formData.description,
          href: formData.href,
          gradient: formData.gradient,
          icon: formData.icon,
          image_url: formData.image_url || null,
          opacity: formData.opacity,
          font_family: formData.font_family,
          logo_image_url: formData.logo_image_url || null,
        })
        .eq('id', editingId)

      if (error) {
        console.error('Error updating banner:', error)
        toast.error('배너 수정 실패')
      } else {
        setEditingId(null)
        resetForm()
        loadBanners()
      }
    } else {
      // 새로 추가
      const maxOrder = banners.length > 0 ? Math.max(...banners.map(b => b.order_index)) : -1
      
      const plaza = getCurrentPlazaClient()
      const { error } = await supabase
        .from('hero_banners')
        .insert({
          title: formData.title,
          subtitle: formData.subtitle,
          description: formData.description,
          href: formData.href,
          gradient: formData.gradient,
          icon: formData.icon,
          image_url: formData.image_url || null,
          opacity: formData.opacity,
          font_family: formData.font_family,
          logo_image_url: formData.logo_image_url || null,
          order_index: maxOrder + 1,
          is_active: true,
          ...(plaza ? { plaza_id: plaza } : {}),
        })

      if (error) {
        console.error('Error creating banner:', error)
        toast.error('배너 생성 실패')
      } else {
        resetForm()
        loadBanners()
      }
    }
  }

  const handleEdit = (banner: Banner) => {
    setEditingId(banner.id)
    setFormData({
      title: banner.title,
      subtitle: banner.subtitle,
      description: banner.description,
      href: banner.href,
      gradient: banner.gradient,
      icon: banner.icon,
      image_url: banner.image_url || '',
      opacity: banner.opacity ?? 40,
      font_family: banner.font_family ?? 'sans',
      logo_image_url: banner.logo_image_url ?? '',
    })
  }

  const handleDelete = async (id: string) => {
    if (!isRealDbBanner(id)) {
      toast('이 배너는 DB 에 저장되지 않은 기본(샘플) 배너입니다.\n상단의 "기본 배너를 DB 에 저장" 버튼을 눌러 실제 저장한 뒤 편집해주세요.')
      return
    }
    if (!confirm('정말 삭제하시겠습니까?')) return

    // .select() 를 붙여 실제로 삭제된 row 수를 확인 — RLS 에 막히면 0 rows.
    const { data, error } = await supabase
      .from('hero_banners')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error deleting banner:', error)
      toast.error('배너 삭제 실패: ' + error.message)
    } else if (!data || data.length === 0) {
      toast.error('배너가 삭제되지 않았습니다.\n\n원인은 보통 RLS 정책입니다. Supabase SQL Editor 에서 아래를 실행해주세요:\n\nDROP POLICY IF EXISTS "Admins can manage banners" ON hero_banners;\nCREATE POLICY "Admins can manage banners" ON hero_banners\n  FOR ALL USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN (\'admin\', \'superadmin\')\n    )\n  );')
    } else {
      loadBanners()
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    if (!isRealDbBanner(id)) {
      toast('이 배너는 DB 에 저장되지 않은 기본(샘플) 배너입니다.\n상단의 "기본 배너를 DB 에 저장" 버튼을 눌러 실제 저장한 뒤 편집해주세요.')
      return
    }
    const { data, error } = await supabase
      .from('hero_banners')
      .update({ is_active: !isActive })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error toggling banner:', error)
      toast.error('활성화 변경 실패: ' + error.message)
    } else if (!data || data.length === 0) {
      toast.error('활성화 변경이 반영되지 않았습니다. RLS 정책을 확인해주세요 (자세한 SQL 은 삭제 버튼 오류 메시지 참고).')
    } else {
      loadBanners()
    }
  }

  /** DB 의 hero_banners 를 전부 비우고 기본 7개만 깨끗하게 다시 넣는다. */
  const handleResetToDefaults = async () => {
    if (!confirm(`현재 저장된 ${banners.length}개 배너를 모두 삭제하고 기본 배너 7개로 초기화합니다. 계속할까요?`)) return
    setSeeding(true)
    try {
      // 1) 전부 삭제 (eq 가 필요해서 항상 true 조건으로 우회)
      const { data: delData, error: delErr } = await supabase
        .from('hero_banners')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      if (delErr) {
        toast.error('기존 배너 삭제 실패: ' + delErr.message)
        return
      }
      if (!delData || delData.length < banners.length) {
        toast.error(
          `삭제된 row: ${delData?.length ?? 0}개 / 기대: ${banners.length}개\n` +
            'RLS 정책에 막혀 전부 삭제되지 않았을 수 있습니다. 계속 진행합니다.',
        )
      }
      // 2) seed
      await handleSeedDefaults()
    } finally {
      setSeeding(false)
    }
  }

  const swapOrder = async (a: Banner, b: Banner): Promise<boolean> => {
    // order_index 가 UNIQUE 제약이 있으면 직접 스왑이 "duplicate key" 에러가 난다.
    // 그래서 임시로 음수 값을 거쳐 3단계로 스왑한다.
    const temp = -1 - Math.abs(a.order_index)
    const step1 = await supabase
      .from('hero_banners')
      .update({ order_index: temp })
      .eq('id', a.id)
      .select()
    if (step1.error || !step1.data?.length) {
      toast.error('순서 변경 실패 (step1): ' + (step1.error?.message || '0 rows affected — RLS 확인 필요'))
      return false
    }
    const step2 = await supabase
      .from('hero_banners')
      .update({ order_index: a.order_index })
      .eq('id', b.id)
      .select()
    if (step2.error || !step2.data?.length) {
      toast.error('순서 변경 실패 (step2): ' + (step2.error?.message || '0 rows affected — RLS 확인 필요'))
      return false
    }
    const step3 = await supabase
      .from('hero_banners')
      .update({ order_index: b.order_index })
      .eq('id', a.id)
      .select()
    if (step3.error || !step3.data?.length) {
      toast.error('순서 변경 실패 (step3): ' + (step3.error?.message || '0 rows affected — RLS 확인 필요'))
      return false
    }
    return true
  }

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const currentBanner = banners[index]
    const prevBanner = banners[index - 1]
    if (!isRealDbBanner(currentBanner.id) || !isRealDbBanner(prevBanner.id)) {
      toast.error('기본(샘플) 배너는 순서 변경이 불가합니다. 먼저 "기본 배너를 DB 에 저장" 을 눌러주세요.')
      return
    }
    if (await swapOrder(currentBanner, prevBanner)) loadBanners()
  }

  const handleMoveDown = async (index: number) => {
    if (index === banners.length - 1) return
    const currentBanner = banners[index]
    const nextBanner = banners[index + 1]
    if (!isRealDbBanner(currentBanner.id) || !isRealDbBanner(nextBanner.id)) {
      toast.error('기본(샘플) 배너는 순서 변경이 불가합니다. 먼저 "기본 배너를 DB 에 저장" 을 눌러주세요.')
      return
    }
    if (await swapOrder(currentBanner, nextBanner)) loadBanners()
  }

  const resetForm = () => {
    setFormData({
      title: '',
      subtitle: '',
      description: '',
      href: '',
      gradient: 'from-blue-500 to-cyan-500',
      icon: 'Building2',
      image_url: '',
      opacity: 40,
      font_family: 'sans',
      logo_image_url: '',
    })
  }

  // 로고 이미지 업로드 전용 핸들러
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('로고 파일 크기는 2MB 이하여야 합니다.')
      return
    }
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json()
      setFormData({ ...formData, logo_image_url: url })
    } catch (err) {
      console.error('Logo upload error:', err)
      toast.error('로고 업로드 실패')
    } finally {
      setUploadingLogo(false)
    }
  }

  const gradientOptions = [
    { value: 'from-blue-500 to-cyan-500', label: '블루-시안' },
    { value: 'from-purple-500 to-pink-500', label: '퍼플-핑크' },
    { value: 'from-orange-500 to-red-500', label: '오렌지-레드' },
    { value: 'from-green-500 to-emerald-500', label: '그린-에메랄드' },
    { value: 'from-yellow-500 to-orange-500', label: '옐로우-오렌지' },
    { value: 'from-indigo-500 to-purple-500', label: '인디고-퍼플' },
  ]

  const iconOptions = [
    'Building2', 'Home', 'Heart', 'ShoppingCart', 'Store', 'Users'
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">배너 관리</h1>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <HomeIcon className="w-4 h-4" />
              <span>홈</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 테이블이 없을 때 안내 메시지 */}
        {!tableExists && (
          <Card className="mb-8 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <CardHeader>
              <CardTitle className="text-amber-700 dark:text-amber-400">데이터베이스 설정 필요</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-amber-600 dark:text-amber-300 mb-4">
                배너 관리 기능을 사용하려면 먼저 데이터베이스에 테이블을 생성해야 합니다.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                아래 SQL 코드를 복사하여 Supabase SQL Editor에서 실행해주세요:
              </p>
              <div className="relative">
                <pre className="block p-4 bg-gray-900 text-gray-100 rounded-lg text-xs mb-4 overflow-x-auto max-h-64 overflow-y-auto">
{`-- 홈 배너 테이블 생성
CREATE TABLE IF NOT EXISTS hero_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  href TEXT NOT NULL,
  gradient TEXT NOT NULL DEFAULT 'from-blue-500 to-cyan-500',
  icon TEXT NOT NULL DEFAULT 'Building2',
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 정책 설정
ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;

-- 읽기: 활성화된 배너만 모두 볼 수 있음
CREATE POLICY "Anyone can view active banners" ON hero_banners
  FOR SELECT USING (is_active = true);

-- 관리자는 모든 작업 가능
CREATE POLICY "Admins can manage banners" ON hero_banners
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );`}
                </pre>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="absolute top-2 right-2"
                  onClick={() => {
                    navigator.clipboard.writeText(`-- 홈 배너 테이블 생성
CREATE TABLE IF NOT EXISTS hero_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  href TEXT NOT NULL,
  gradient TEXT NOT NULL DEFAULT 'from-blue-500 to-cyan-500',
  icon TEXT NOT NULL DEFAULT 'Building2',
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners" ON hero_banners
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage banners" ON hero_banners
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );`)
                    toast.success('SQL 코드가 복사되었습니다!')
                  }}
                >
                  복사
                </Button>
              </div>
              <Button onClick={() => loadBanners()} variant="outline">
                테이블 생성 후 새로고침
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'edit' ? 'default' : 'outline'}
            onClick={() => setActiveTab('edit')}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            배너 관리
          </Button>
          <Button
            variant={activeTab === 'preview' ? 'default' : 'outline'}
            onClick={() => setActiveTab('preview')}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            배너 미리보기
          </Button>
        </div>

        {/* 미리보기 탭 */}
        {activeTab === 'preview' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>현재 배너 미리보기</CardTitle>
                <CardDescription>
                  {tableExists 
                    ? "홈페이지에 표시되는 배너들입니다. 순서를 변경하거나 삭제할 수 있습니다."
                    : "테이블이 없어 기본 배너가 표시됩니다. SQL을 실행하여 테이블을 생성하세요."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!tableExists && (
                  <div className="text-amber-600 bg-amber-50 p-4 rounded-lg text-center mb-4">
                    데이터베이스에 hero_banners 테이블이 없습니다. 아래는 기본 배너 미리보기입니다.
                  </div>
                )}
                {/* 비어있을 때만 "기본 샘플" 경고 (편집 불가 상태 안내) + seed 버튼.
                    이미 DB 에 배너가 있으면 이 영역은 감춘다. */}
                {tableExists && banners.length === 0 && (
                  <div className="mb-4 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-2">
                      ⚠️ 지금 보이는 배너는 DB 에 저장되지 않은 <strong>기본 샘플</strong> 입니다.
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mb-3">
                      이 상태에서는 삭제 / 비활성화 / 순서 변경 버튼이 동작하지 않습니다. 아래 버튼을 눌러 기본 배너를 DB 에 저장한 뒤 편집해주세요.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleSeedDefaults}
                      disabled={seeding}
                      className="gap-2"
                    >
                      {seeding ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      기본 배너 7개를 DB 에 저장
                    </Button>
                  </div>
                )}
                {(tableExists ? banners : defaultBanners).length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">등록된 배너가 없습니다</p>
                ) : (
                  <div className="space-y-4">
                    {(tableExists ? banners : defaultBanners).map((banner, index) => {
                      const iconMap: Record<string, any> = { Building2, Home, Gift, Heart, ShoppingCart, Store, UserPlus, Users }
                      const Icon = iconMap[banner.icon] || Building2
                      
                      return (
                        <div
                          key={banner.id}
                          className={cn(
                            "relative rounded-xl overflow-hidden h-48",
                            !banner.is_active && "opacity-50"
                          )}
                        >
                          {banner.image_url ? (
                            <>
                              <img
                                src={banner.image_url}
                                alt={banner.title}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40" />
                            </>
                          ) : (
                            <div className={cn("absolute inset-0 bg-gradient-to-br", banner.gradient)} />
                          )}
                          
                          {/* 카드 전체를 덮는 내용 영역 — pointer-events-none 이 없으면
                              뒤에 놓인 버튼들이 가려서 클릭이 안 먹힘. 이것이 "버튼이 아예
                              작동 안 하던" 실제 원인이었음. */}
                          <div className="pointer-events-none relative h-full flex flex-col items-center justify-center text-center p-6 z-10">
                            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3">
                              <Icon className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-1">{banner.title}</h3>
                            <p className="text-white/90 mb-1">{banner.subtitle}</p>
                            <p className="text-sm text-white/70">{banner.description}</p>
                            <span className="mt-3 px-4 py-1.5 rounded-full bg-white/20 text-white text-sm">
                              {banner.href}
                            </span>
                          </div>

                          {/* 순서 및 상태 표시 */}
                          <div className="absolute top-2 left-2 z-20 flex items-center gap-2 pointer-events-none">
                            <span className="bg-black/50 text-white px-2 py-1 rounded text-xs">
                              {index + 1}번째
                            </span>
                            {!banner.is_active && (
                              <span className="bg-red-500 text-white px-2 py-1 rounded text-xs">
                                비활성
                              </span>
                            )}
                          </div>

                          {/* 순서 변경 버튼 (좌측) */}
                          <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                            <Button
                              variant="secondary"
                              size="icon"
                              className="w-8 h-8 bg-white/90 hover:bg-white"
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="w-8 h-8 bg-white/90 hover:bg-white"
                              onClick={() => handleMoveDown(index)}
                              disabled={index === banners.length - 1}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </div>

                          {/* 수정 + 삭제 버튼 (우측 하단, 세로 정렬) */}
                          <div className="absolute bottom-2 right-2 z-20 flex flex-col gap-1 items-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-1 bg-white/90 hover:bg-white"
                              onClick={() => {
                                handleEdit(banner)
                                setActiveTab('edit')
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                              수정
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleDelete(banner.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                              삭제
                            </Button>
                          </div>

                          {/* 활성화/비활성화 버튼 (좌측 하단) */}
                          <div className="absolute bottom-2 left-2 z-20">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-1 bg-white/90 hover:bg-white"
                              onClick={() => handleToggleActive(banner.id, banner.is_active)}
                            >
                              {banner.is_active ? '비활성화' : '활성화'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 배너 추가/수정 폼 */}
        {activeTab === 'edit' && (
        <>
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{editingId ? '배너 수정' : '새 배너 추가'}</CardTitle>
            <CardDescription>홈페이지 상단에 표시될 배너를 관리합니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">제목</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="배너 제목"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">부제목</label>
              <Input
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="배너 부제목"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">설명</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="배너 설명"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">링크</label>
              <Input
                value={formData.href}
                onChange={(e) => setFormData({ ...formData, href: e.target.value })}
                placeholder="/properties"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">배경 그래디언트</label>
              <div className="grid grid-cols-3 gap-2">
                {gradientOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, gradient: option.value })}
                    className={cn(
                      "h-12 rounded-lg bg-gradient-to-r transition-all border-2",
                      option.value,
                      formData.gradient === option.value ? 'border-white scale-105' : 'border-transparent'
                    )}
                  >
                    <span className="text-white text-xs drop-shadow">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">아이콘</label>
              <div className="flex gap-2">
                {iconOptions.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setFormData({ ...formData, icon })}
                    className={cn(
                      "px-4 py-2 rounded-lg border transition-colors",
                      formData.icon === icon
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary border-border hover:border-primary'
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* 배너 이미지 */}
            <div>
              <label className="text-sm font-medium mb-2 block">배너 이미지 (선택)</label>
              <div className="space-y-3">
                {formData.image_url ? (
                  <div className="relative">
                    <img
                      src={formData.image_url}
                      alt="배너 미리보기"
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setFormData({ ...formData, image_url: '' })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors bg-secondary/30">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <>
                          <Loader2 className="w-10 h-10 mb-3 text-muted-foreground animate-spin" />
                          <p className="text-sm text-muted-foreground">업로드 중...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                          <p className="mb-2 text-sm text-muted-foreground">
                            <span className="font-semibold">클릭하여 이미지 업로드</span>
                          </p>
                          <p className="text-xs text-muted-foreground">PNG, JPG (최대 5MB)</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                )}
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">
                    최적 이미지 사이즈 안내
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                    <li>권장 크기: <strong>1920 x 500 픽셀</strong> (가로형)</li>
                    <li>비율: 약 4:1 (와이드 배너)</li>
                    <li>파일 형식: PNG, JPG, WebP</li>
                    <li>파일 크기: 5MB 이하</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* ── 이미지 투명도 (오버레이 %) ─────────────────────────── */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                이미지 어둡게 처리 (오버레이 %) — {formData.opacity}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={formData.opacity}
                onChange={(e) => setFormData({ ...formData, opacity: Number(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                이미지 위에 검정 오버레이를 얼마나 짙게 깔지 선택 (0% = 원본, 100% = 완전 어두움). 텍스트 가독성 조절용.
              </p>
            </div>

            {/* ── 글씨체 ─────────────────────────────────────────────── */}
            <div>
              <label className="text-sm font-medium mb-2 block">글씨체</label>
              <div className="flex gap-2">
                {[
                  { v: 'sans',  l: '기본(Sans)' },
                  { v: 'serif', l: '명조(Serif)' },
                  { v: 'mono',  l: '고정폭(Mono)' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setFormData({ ...formData, font_family: opt.v })}
                    className={cn(
                      "px-4 py-2 rounded-lg border transition-colors",
                      formData.font_family === opt.v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary border-border hover:border-primary'
                    )}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 커스텀 로고 이미지 (옵션) ────────────────────────────── */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                커스텀 로고 이미지 (선택 — 설정 시 아이콘 대신 표시)
              </label>
              <div className="space-y-3">
                {formData.logo_image_url ? (
                  <div className="relative inline-block">
                    <img
                      src={formData.logo_image_url}
                      alt="로고 미리보기"
                      className="w-24 h-24 object-cover rounded-full border bg-gray-100"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 w-7 h-7 p-0 rounded-full"
                      onClick={() => setFormData({ ...formData, logo_image_url: '' })}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors bg-secondary/30">
                    <div className="flex flex-col items-center justify-center pt-3 pb-3">
                      {uploadingLogo ? (
                        <>
                          <Loader2 className="w-8 h-8 mb-2 text-muted-foreground animate-spin" />
                          <p className="text-sm text-muted-foreground">업로드 중...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            <span className="font-semibold">로고 이미지 업로드</span> (원형 표시, 최대 2MB)
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  비워두면 위에서 선택한 Lucide 아이콘이 표시됩니다. 로고는 80x80px 정사각형 권장.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={uploading || uploadingLogo} className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                {editingId ? '수정 완료' : '배너 추가'}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingId(null)
                    resetForm()
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  취소
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 배너 목록 */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">배너 목록 ({banners.length}개)</h2>
          
          {banners.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                등록된 배너가 없습니다. 새 배너를 추가해주세요.
              </CardContent>
            </Card>
          ) : (
            banners.map((banner) => (
              <Card key={banner.id} className={cn(!banner.is_active && 'opacity-50')}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <GripVertical className="w-5 h-5 text-muted-foreground" />
                    </div>
                    
                    <div className={cn("w-16 h-16 rounded-lg bg-gradient-to-br flex items-center justify-center", banner.gradient)}>
                      <ImageIcon className="w-8 h-8 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{banner.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{banner.subtitle}</p>
                      <p className="text-xs text-muted-foreground mt-1">→ {banner.href}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={banner.is_active ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleToggleActive(banner.id, banner.is_active)}
                      >
                        {banner.is_active ? '활성' : '비활성'}
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(banner)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(banner.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
