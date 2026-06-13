'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { uploadMedia } from '@/lib/upload-media'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, Upload, X, Star, Loader2, Film } from 'lucide-react'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { useBeforeUnload } from '@/hooks/use-before-unload'

interface BoardCategory {
  id: string
  name: string
  slug: string
}

interface MediaItem {
  url: string
  type: 'image' | 'video'
}

export default function CreatePostPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const categoryFieldRef = useRef<HTMLDivElement>(null)
  const titleFieldRef = useRef<HTMLDivElement>(null)
  const contentFieldRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([]) // max 10
  const [thumbnailIndex, setThumbnailIndex] = useState(0) // 대표이미지 인덱스
  const [uploading, setUploading] = useState(false)
  // 지역 — 가입 시 선택한 sub_region 으로 자동 채움. 작성 시 변경 가능
  const [region, setRegion] = useState<string>('')
  const [coverage, setCoverage] = useState<string[]>([])
  const formDirty = useMemo(() => !!(title.trim() || content.trim() || media.length > 0), [title, content, media])
  useBeforeUnload(formDirty)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login?redirect=/board/create')
        return
      }
      setUser(user)

      // 닉네임 + 지역 가져오기 (profiles 테이블 우선)
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname, sub_region')
        .eq('id', user.id)
        .single()
      setNickname(profile?.nickname || user.user_metadata?.name || user.email?.split('@')[0] || '익명')
      // 가입 시 선택한 지역으로 기본값 설정
      const defaultRegion =
        profile?.sub_region || (user.user_metadata as any)?.sub_region || ''
      setRegion(defaultRegion)
    }
    init()

    // 광장 coverage 로드 (지역 드롭다운 옵션)
    const plaza = getCurrentPlazaClient()
    if (plaza) {
      supabase
        .from('plazas')
        .select('coverage')
        .eq('id', plaza)
        .single()
        .then(({ data }) => {
          if (data?.coverage && Array.isArray(data.coverage)) {
            setCoverage(data.coverage as string[])
          }
        })
    }
  }, [])

  useEffect(() => {
    supabase
      .from('board_categories')
      .select('*')
      .order('sort_order')
      .then(({ data }) => {
        setCategories(data || [])
        if (data?.length) {
          const slug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("category") : null
          const match = slug ? (data as any[]).find((c) => c.slug === slug) : null
          setCategoryId(match?.id || data[0].id)
        }
      })
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (media.length + files.length > 10) {
      setError('미디어는 최대 10개까지 첨부할 수 있습니다')
      return
    }

    setUploading(true)
    setError('')
    let failCount = 0
    let lastError = ''
    try {
      for (const file of files) {
        try {
          const isVideo = file.type.startsWith('video/')
          const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
          if (file.size > maxSize) throw new Error(isVideo ? '동영상은 100MB 이하여야 합니다' : '이미지는 10MB 이하여야 합니다')

          const uploaded = await uploadMedia(file)
          setMedia((prev) => [...prev, uploaded])
        } catch (err: any) {
          lastError = err.message || '업로드 실패'
          failCount++
        }
      }
      if (failCount > 0) {
        setError(failCount > 1 ? `${failCount}개 파일 업로드에 실패했습니다` : lastError)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeMedia = (index: number) => {
    setMedia((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (thumbnailIndex >= next.length) setThumbnailIndex(Math.max(0, next.length - 1))
      return next
    })
  }

  const setAsThumbnail = (index: number) => {
    // 대표이미지를 첫 번째로 이동
    setMedia((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.unshift(item)
      return next
    })
    setThumbnailIndex(0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')

    const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (!categoryId) { setError('카테고리를 선택해주세요'); scrollTo(categoryFieldRef); return }
    if (!title.trim()) { setError('제목을 입력해주세요'); scrollTo(titleFieldRef); return }
    if (!content.trim()) { setError('내용을 입력해주세요'); scrollTo(contentFieldRef); return }
    if (!user) { setError('로그인이 필요합니다'); return }

    setLoading(true)
    try {
      const imageUrls = media.filter((m) => m.type === 'image').map((m) => m.url)
      // thumbnail = 첫 번째 이미지 (대표이미지로 선택된 것이 앞으로 이동됨)
      const thumbnailUrl = imageUrls[0] || null

      const plaza = getCurrentPlazaClient()
      if (!plaza) {
        setError('전원일기 도메인에서 작성해주세요')
        setLoading(false)
        return
      }

      const { data, error: insertError } = await supabase
        .from('board_posts')
        .insert([{
          plaza_id: plaza,
          title: title.trim(),
          content: content.trim(),
          category_id: categoryId,
          user_id: user.id,
          author_name: nickname,
          author_avatar: user.user_metadata?.avatar_url || null,
          images: media.map((m) => m.url), // 이미지 + 동영상 URL 모두 저장
          thumbnail_url: thumbnailUrl,
          region: region || null,
        }])
        .select()

      if (insertError) throw insertError

      // 포인트 적립 (Feature Flag OFF 시 silent no-op)
      if (data?.[0]) {
        toast.success("등록되었습니다")
        fetch('/api/points/award', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ruleId: 'post.create',
            sourceId: data[0].id,
            qualityData: {
              length: content.trim().length,
              has_image: media.length > 0,
            },
          }),
        }).catch(() => {})
        router.push(`/board/${data[0].id}`)
      }
    } catch (err: any) {
      setError(err.message || '게시글 작성에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* 뒤로가기 */}
        <Link href="/board" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          소식통으로 돌아가기
        </Link>

        <h1 className="text-2xl font-bold mb-6">새 게시글 작성</h1>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card border border-border rounded-xl p-5 sm:p-6">
          {error && (
            <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}

          {/* 미디어 업로드 - 맨 위 */}
          <div className="space-y-2">
            <label className="text-base font-medium">사진/동영상</label>
            <p className="text-sm text-muted-foreground">최대 10개 • 이미지 10MB / 동영상 100MB • ⭐ 클릭 시 대표이미지로 설정</p>

            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  업로드 중...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Upload className="w-4 h-4" />
                  클릭하여 파일 선택 ({media.length}/10)
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {media.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {media.map((item, idx) => (
                  <div
                    key={idx}
                    className={`relative group aspect-square rounded-xl overflow-hidden bg-muted shadow-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-md ${
                      idx === 0 && item.type === 'image' ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-card' : ''
                    }`}
                  >
                    {item.type === 'image' ? (
                      <Image src={item.url} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/70 text-muted-foreground">
                        <Film className="w-7 h-7 mb-1" />
                        <span className="text-[10px] font-medium">동영상</span>
                      </div>
                    )}
                    {idx === 0 && item.type === 'image' && (
                      <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        대표
                      </div>
                    )}
                    {/* 삭제 — 항상 표시(터치 기기에서도 보이도록) */}
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-md"
                      aria-label="사진 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {/* 대표 지정 — 비대표 이미지에만, 항상 표시 */}
                    {item.type === 'image' && idx !== 0 && (
                      <button
                        type="button"
                        onClick={() => setAsThumbnail(idx)}
                        className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 flex items-center justify-center shadow-md"
                        title="대표사진으로 지정"
                        aria-label="대표사진으로 지정"
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 작성자 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
            <span className="font-medium text-foreground">{nickname}</span>
            <span>으로 게시됩니다</span>
          </div>

          {/* 카테고리 + 지역 — 두 컬럼 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5" ref={categoryFieldRef}>
              <label className="text-base font-medium">카테고리 <span className="text-destructive">*</span></label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-base font-medium">지역</label>
              <Select value={region || '__none__'} onValueChange={(v) => setRegion(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="지역 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">지역 무관</SelectItem>
                  {coverage.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 제목 */}
          <div className="space-y-1.5" ref={titleFieldRef}>
            <label className="text-base font-medium">제목 <span className="text-destructive">*</span></label>
            <Input
              placeholder="게시글 제목을 입력해주세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <p className="text-sm text-muted-foreground text-right">{title.length}/200</p>
          </div>

          {/* 내용 */}
          <div className="space-y-1.5" ref={contentFieldRef}>
            <label className="text-base font-medium">내용 <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="내용을 작성해주세요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground text-right">{content.length}자</p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <Link href="/board" className="flex-1">
              <Button variant="outline" type="button" className="w-full">취소</Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || uploading || !title.trim() || !content.trim()}
              className="flex-1"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />작성 중...</> : '게시글 작성'}
            </Button>
          </div>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}
