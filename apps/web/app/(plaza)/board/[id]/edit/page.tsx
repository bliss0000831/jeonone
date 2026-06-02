'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
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
import { RegionFormField } from "@/components/region-form-field"
import { useBeforeUnload } from "@/hooks/use-before-unload"

interface BoardCategory {
  id: string
  name: string
  slug: string
}

interface MediaItem {
  url: string
  type: 'image' | 'video'
}

function guessType(url: string): 'image' | 'video' {
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(url) ? 'video' : 'image'
}

export default function EditPostPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [subRegion, setSubRegion] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', user.id)
        .single()
      setNickname(profile?.nickname || user.user_metadata?.name || user.email?.split('@')[0] || '익명')

      // 카테고리 로드
      const { data: cats } = await supabase.from('board_categories').select('*').order('sort_order')
      setCategories(cats || [])

      // 기존 게시글 로드 — 광장 격리
      const plaza = getCurrentPlazaClient()
      let postQ: any = supabase
        .from('board_posts')
        .select('*')
        .eq('id', postId)
      if (plaza) postQ = postQ.eq('plaza_id', plaza)
      const { data: post, error: fetchErr } = await postQ.maybeSingle()

      if (fetchErr || !post) {
        setError('게시글을 불러올 수 없습니다')
        setLoading(false)
        return
      }

      // 권한 확인
      if (post.user_id !== user.id) {
        router.push(`/board/${postId}`)
        return
      }

      setTitle(post.title)
      setContent(post.content)
      setCategoryId(post.category_id)
      setMedia((post.images || []).map((url: string) => ({ url, type: guessType(url) })))
      setSubRegion(post.sub_region || '')
      setLoading(false)
    }
    init()
  }, [postId])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (media.length + files.length > 10) {
      setError('미디어는 최대 10개까지 첨부할 수 있습니다')
      return
    }
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video/')
        const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
        if (file.size > maxSize) throw new Error(isVideo ? '동영상은 100MB 이하여야 합니다' : '이미지는 10MB 이하여야 합니다')

        const uploaded = await uploadMedia(file)
        setMedia((prev) => [...prev, uploaded])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index))
  }

  const setAsThumbnail = (index: number) => {
    setMedia((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.unshift(item)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim() || !categoryId) {
      setError('모든 필드를 입력해주세요')
      return
    }
    setSaving(true)
    try {
      const imageUrls = media.filter((m) => m.type === 'image').map((m) => m.url)
      const thumbnailUrl = imageUrls[0] || null

      // 광장 격리 (defense-in-depth) — RLS 도 막지만 application 레벨에서도
      const plazaForUpdate = getCurrentPlazaClient()
      let updQ: any = supabase
        .from('board_posts')
        .update({
          title: title.trim(),
          content: content.trim(),
          category_id: categoryId,
          images: media.map((m) => m.url),
          thumbnail_url: thumbnailUrl,
          sub_region: subRegion || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
      if (plazaForUpdate) updQ = updQ.eq('plaza_id', plazaForUpdate)
      const { error: updateError } = await updQ

      if (updateError) throw updateError
      setFormDirty(false)
      router.push(`/board/${postId}`)
    } catch (err: any) {
      setError(err.message || '수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link href={`/board/${postId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          게시글로 돌아가기
        </Link>

        <h1 className="text-2xl font-bold mb-6">게시글 수정</h1>

        <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="space-y-5 bg-card border border-border rounded-xl p-5 sm:p-6">
          {error && (
            <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
          )}

          {/* 미디어 업로드 - 맨 위 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">사진/동영상</label>
            <p className="text-xs text-muted-foreground">최대 10개 • ⭐ 클릭 시 대표이미지로 설정</p>

            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />업로드 중...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Upload className="w-4 h-4" />파일 추가 ({media.length}/10)
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
                        <Star className="w-2.5 h-2.5 fill-current" />대표
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                      {item.type === 'image' && idx !== 0 && (
                        <button
                          type="button"
                          onClick={() => setAsThumbnail(idx)}
                          className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-full p-2 shadow-md transition-colors"
                          title="대표이미지로 설정"
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(idx)}
                        className="bg-destructive hover:bg-destructive/90 text-white rounded-full p-2 shadow-md transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
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

          {/* 카테고리 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">게시판 <span className="text-destructive">*</span></label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="게시판 선택" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 제목 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">제목 <span className="text-destructive">*</span></label>
            <Input
              placeholder="게시글 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
          </div>

          {/* 내용 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">내용 <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="내용을 작성해주세요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </div>

          {/* Region (sub_region) */}
          <RegionFormField value={subRegion} onChange={setSubRegion} />

          <div className="flex gap-3 pt-2">
            <Link href={`/board/${postId}`} className="flex-1">
              <Button variant="outline" type="button" className="w-full">취소</Button>
            </Link>
            <Button
              type="submit"
              disabled={saving || uploading || !title.trim() || !content.trim()}
              className="flex-1"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />저장 중...</> : '수정 완료'}
            </Button>
          </div>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}
