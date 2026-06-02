'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { uploadMedia } from '@/lib/upload-media'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft, ChevronRight, MessageCircle, Eye, Trash2, Edit2,
  Send, Upload, X, Loader2, Film, Play, MoreVertical, Pencil, Reply
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { ko } from 'date-fns/locale'
import { User } from '@supabase/supabase-js'
import {
  DetailShell,
  DetailGallery,
  DetailBody,
  DetailSection,
  DetailHeaderActions,
} from '@/components/detail'
import { ReportButton } from '@/components/report-button'
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface BoardPost {
  id: string
  category_id: string
  title: string
  content: string
  author_name: string
  author_avatar: string | null
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
  updated_at: string
  is_pinned: boolean
  user_id: string
  images: string[]
  thumbnail_url: string | null
}

interface BoardComment {
  id: string
  content: string
  author_name: string
  author_avatar: string | null
  created_at: string
  user_id: string
  images: string[]
  parent_id?: string | null
}

interface MediaItem {
  url: string
  type: 'image' | 'video'
}

function isVideo(url: string) {
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(url)
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const supabase = createClient()
  const postId = params.id as string
  const commentFileRef = useRef<HTMLInputElement>(null)

  const [post, setPost] = useState<BoardPost | null>(null)
  const [comments, setComments] = useState<BoardComment[]>([])
  const [replies, setReplies] = useState<BoardComment[]>([])
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [commentText, setCommentText] = useState('')
  const [commentMedia, setCommentMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingComment, setUploadingComment] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [nickname, setNickname] = useState('')
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [carouselIdx, setCarouselIdx] = useState(0)

  // 라이트박스 키보드 네비 — open/close 시에만 listener 추가/제거 (index 변경은 무관)
  const lightboxOpen = lightbox !== null
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowLeft') setLightbox((l) => l && { ...l, index: (l.index - 1 + l.urls.length) % l.urls.length })
      else if (e.key === 'ArrowRight') setLightbox((l) => l && { ...l, index: (l.index + 1) % l.urls.length })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  // 인증 + 게시글 + 댓글 + 좋아요 — 마운트 시 Promise.all 로 병렬 처리
  useEffect(() => {
    if (!postId) return
    let cancelled = false
    const init = async () => {
      try {
        // 1) 인증 + 게시글/댓글 병렬
        const plaza = getCurrentPlazaClient()
        let pq: any = supabase.from('board_posts').select('*').eq('id', postId)
        if (plaza) pq = pq.eq('plaza_id', plaza)

        const [authResult, postResult, commentRes] = await Promise.all([
          supabase.auth.getUser(),
          pq.single(),
          fetch(`/api/board/comment?post_id=${postId}`).catch(() => null),
        ])
        if (cancelled) return

        // 인증 처리
        const currentUser = authResult.data?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nickname, role')
            .eq('id', currentUser.id)
            .single()
          if (cancelled) return
          setNickname(profile?.nickname || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || '익명')
          if (profile?.role === 'admin' || profile?.role === 'superadmin') {
            setIsAdmin(true)
          }
          // 좋아요 여부 확인 (user 있을 때만)
          supabase
            .from('board_post_likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUser.id)
            .maybeSingle()
            .then(({ data }) => { if (!cancelled) setIsLiked(!!data) })
        }

        // 게시글 처리
        if (postResult.error) throw postResult.error
        if (postResult.data) {
          setPost({ ...postResult.data, view_count: (postResult.data.view_count || 0) + 1 })
          void supabase.rpc('increment_view_count', {
            p_table: 'board_posts',
            p_id: postId,
            p_column: 'view_count',
          }).then(({ error }) => { if (error) console.error('[board view_count]', error) })
        }

        // 댓글 처리
        try {
          if (commentRes?.ok) {
            const { comments: commentsData, replies: repliesData } = await commentRes.json()
            if (!cancelled) {
              setComments(commentsData || [])
              setReplies(repliesData || [])
            }
          } else {
            if (!cancelled) { setComments([]); setReplies([]) }
          }
        } catch {
          if (!cancelled) { setComments([]); setReplies([]) }
        }
      } catch (err) {
        console.error('게시글 로드 실패:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [postId])

  const handleLike = async () => {
    if (!user) { router.push('/auth/login'); return }
    if (likeBusy) return
    setLikeBusy(true)
    const prevLiked = isLiked
    const prevCount = post?.like_count ?? 0
    // 낙관적 UI 업데이트
    setIsLiked(!prevLiked)
    if (post) setPost({ ...post, like_count: prevLiked ? prevCount - 1 : prevCount + 1 })
    try {
      if (prevLiked) {
        const { error } = await supabase.from('board_post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('board_post_likes').insert([{ post_id: postId, user_id: user.id }])
        if (error) throw error
      }
    } catch {
      // 롤백
      setIsLiked(prevLiked)
      if (post) setPost({ ...post, like_count: prevCount })
      toast.error('좋아요 처리에 실패했습니다')
    } finally {
      setLikeBusy(false)
    }
  }

  const handleCommentFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (commentMedia.length + files.length > 4) {
      setUploadError('댓글에 미디어는 최대 4개까지 첨부할 수 있습니다')
      return
    }
    setUploadingComment(true)
    setUploadError('')
    try {
      if (!user) throw new Error('로그인이 필요합니다')
      for (const file of files) {
        const uploaded = await uploadMedia(file)
        setCommentMedia((prev) => [...prev, uploaded])
      }
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUploadingComment(false)
      if (commentFileRef.current) commentFileRef.current.value = ''
    }
  }

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { router.push('/auth/login'); return }
    if (!commentText.trim() && commentMedia.length === 0) return

    setSubmitting(true)
    setUploadError('')
    try {
      const res = await fetch('/api/board/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          content: commentText.trim(),
          author_name: nickname,
          author_avatar: user.user_metadata?.avatar_url || null,
          images: commentMedia.map((m) => m.url),
          ...(replyTo ? { parent_id: replyTo.id } : {}),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '댓글 작성 실패')

      const newComment: BoardComment = json.comment
      if (replyTo) {
        setReplies((prev) => [...prev, newComment])
        // Auto-expand replies for the parent so the new reply is visible
        setExpandedReplies((prev) => new Set(prev).add(replyTo.id))
      } else {
        setComments((prev) => [...prev, newComment])
      }
      setCommentText('')
      setCommentMedia([])
      setReplyTo(null)
      if (post) setPost({ ...post, comment_count: post.comment_count + 1 })
    } catch (err: any) {
      setUploadError('댓글 작성 실패: ' + (err.message || '알 수 없는 오류'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!(await confirm({ description: '댓글을 삭제하시겠습니까?', destructive: true }))) return
    try {
      const res = await fetch('/api/board/comment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: commentId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '삭제 실패')
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      setReplies((prev) => prev.filter((c) => c.id !== commentId))
      if (post) setPost({ ...post, comment_count: post.comment_count - 1 })
    } catch (err: any) {
      toast.error(err.message || '댓글 삭제 실패')
    }
  }

  const handleDeletePost = async () => {
    if (!(await confirm({ description: '게시글을 삭제하시겠습니까?', destructive: true }))) return
    // R2 정리용 URL 수집 (이미지 + 썸네일)
    const urls = [...(post?.images || []), post?.thumbnail_url].filter(
      (u): u is string => !!u,
    )
    const { error } = await supabase.from('board_posts').delete().eq('id', postId)
    if (error) {
      toast.error('게시글 삭제에 실패했습니다: ' + error.message)
      return
    }
    if (urls.length > 0) {
      // fire-and-forget
      fetch('/api/r2-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      }).catch(() => {})
    }
    // 핫글 TOP3 / 수다왕 — CDN 캐시(60s) 우회용 플래그
    // /board 페이지가 마운트하면 이 플래그 보고 cache-buster 붙여서 stats 재요청
    try {
      sessionStorage.setItem('board:bust-stats', '1')
    } catch {}
    toast.success('게시글이 삭제되었습니다')
    router.push('/board')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">게시글을 찾을 수 없습니다</p>
        <Link href="/board"><Button variant="outline">게시판으로 돌아가기</Button></Link>
      </div>
    )
  }

  const postImages = post.images || []
  const hasVideo = postImages.some(isVideo)
  const imageOnlyUrls = postImages.filter((u) => !isVideo(u))

  return (
    <>
      <DetailShell
        backHref="/board"
        user={user}
        rightActions={
          <DetailHeaderActions
            isLiked={isLiked}
            onLike={handleLike}
            shareMeta={{
              title: post.title,
              description: post.content?.slice(0, 80),
              imageUrl: imageOnlyUrls?.[0],
            }}
            extra={
              <>
                {user && user.id !== post.user_id && !isAdmin && (
                  <ReportButton targetType="board" targetId={post.id} />
                )}
                {(user?.id === post.user_id || isAdmin) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="더보기 메뉴">
                        <MoreVertical className="w-5 h-5 text-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/board/${post.id}/edit`)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        수정하기
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleDeletePost}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        삭제하기
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            }
          />
        }
      >
        {/* 비디오가 포함된 경우 — 커스텀 미디어 플레이어를 본문 위에 배치 */}
        {postImages.length > 0 && hasVideo && (
          <div className="relative bg-black overflow-hidden group">
            {/* 슬라이드 컨테이너 */}
            <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-black flex items-center justify-center">
              {postImages.map((url, idx) => (
                <div
                  key={idx}
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                    idx === carouselIdx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                >
                  {isVideo(url) ? (
                    <video
                      src={url}
                      className="w-full h-full object-contain"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-contain cursor-zoom-in"
                      sizes="100vw"
                      onClick={() => setLightbox({ urls: imageOnlyUrls, index: imageOnlyUrls.indexOf(url) })}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 좌우 화살표 (2장 이상) */}
            {postImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setCarouselIdx((i) => (i - 1 + postImages.length) % postImages.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="이전"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCarouselIdx((i) => (i + 1) % postImages.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="다음"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* 카운터 */}
            {postImages.length > 1 && (
              <div className="absolute top-3 right-3 z-20 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                {carouselIdx + 1} / {postImages.length}
              </div>
            )}

            {/* 점 인디케이터 */}
            {postImages.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                {postImages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCarouselIdx(idx)}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === carouselIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/70'
                    }`}
                    aria-label={`${idx + 1}번째 미디어`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 이미지만 있는 경우 — 공용 DetailGallery 사용 */}
        {postImages.length > 0 && !hasVideo && (
          <DetailGallery
            images={postImages}
            alt={post.title}
            aspect="video"
            topLeftBadges={post.is_pinned ? <Badge variant="default">📌 공지</Badge> : undefined}
          />
        )}

        <DetailBody>
          {/* 제목 + 작성자/메타 */}
          <DetailSection divider={false}>
            {post.is_pinned && postImages.length === 0 && (
              <Badge variant="default" className="mb-3">📌 공지</Badge>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-3">{post.title}</h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {post.author_avatar && (
                <Image src={post.author_avatar} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" sizes="20px" />
              )}
              <span className="font-medium text-foreground">{post.author_name}</span>
              <span>•</span>
              <span>{formatDistanceToNow(new Date(post.created_at), { locale: ko, addSuffix: true })}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{post.view_count}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{post.comment_count}</span>
            </div>
          </DetailSection>

          {/* 본문 내용 */}
          <DetailSection>
            <div className="text-foreground whitespace-pre-wrap text-sm sm:text-base leading-relaxed">
              {post.content}
            </div>

            {/* 수정/삭제는 헤더 우측 점세개 메뉴로 통합됨 */}
          </DetailSection>

          {/* 댓글 섹션 */}
          <DetailSection
            title={
              <>
                댓글 <span className="text-muted-foreground font-normal">({post.comment_count})</span>
              </>
            }
          >
            {/* 댓글 작성 폼 */}
            {user ? (
              <form onSubmit={handleCommentSubmit} className="mb-6 pb-6 border-b space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {user.user_metadata?.avatar_url && (
                    <Image src={user.user_metadata.avatar_url} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" sizes="24px" />
                  )}
                  <span className="font-medium text-foreground">{nickname}</span>
                </div>
                {replyTo && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-md px-3 py-1.5">
                    <Reply className="w-3 h-3" />
                    <span><span className="font-medium text-foreground">{replyTo.name}</span>님에게 답글 작성 중</span>
                    <button type="button" onClick={() => setReplyTo(null)} className="ml-auto hover:text-foreground transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <Textarea
                  placeholder={replyTo ? `${replyTo.name}님에게 답글을 입력해주세요` : '댓글을 입력해주세요'}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="resize-none"
                  rows={3}
                />

                {/* 댓글 미디어 */}
                {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                {commentMedia.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {commentMedia.map((item, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted group">
                        {item.type === 'image' ? (
                          <Image src={item.url} alt="" width={64} height={64} className="w-full h-full object-cover" sizes="64px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setCommentMedia((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => commentFileRef.current?.click()}
                    disabled={uploadingComment || commentMedia.length >= 4}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                  >
                    {uploadingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    사진/동영상 ({commentMedia.length}/4)
                  </button>
                  <input
                    ref={commentFileRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleCommentFileSelect}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setCommentText(''); setCommentMedia([]); setReplyTo(null) }}
                    >
                      취소
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={submitting || uploadingComment || (!commentText.trim() && commentMedia.length === 0)}
                      className="gap-2"
                    >
                      {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      댓글 작성
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <Link href="/auth/login">
                <Button variant="outline" className="w-full mb-6">로그인하고 댓글 작성하기</Button>
              </Link>
            )}

            {/* 댓글 목록 */}
            {comments.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">아직 댓글이 없습니다</p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const commentReplies = replies.filter((r) => r.parent_id === comment.id)
                  const isExpanded = expandedReplies.has(comment.id)
                  const collapsedThreshold = 2
                  const visibleReplies = isExpanded ? commentReplies : commentReplies.slice(0, collapsedThreshold)
                  const hiddenCount = commentReplies.length - collapsedThreshold

                  return (
                    <div key={comment.id} className="pb-4 border-b last:border-b-0">
                      {/* 부모 댓글 */}
                      <div className="flex items-start gap-3">
                        {comment.author_avatar ? (
                          <Image src={comment.author_avatar} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover flex-shrink-0" sizes="28px" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                            {comment.author_name?.[0] || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{comment.author_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(comment.created_at), { locale: ko, addSuffix: true })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {user && (
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
                                  onClick={() => setReplyTo({ id: comment.id, name: comment.author_name })}
                                >
                                  <Reply className="w-3 h-3" />
                                </button>
                              )}
                              {user?.id === comment.user_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive h-auto p-1"
                                  onClick={() => handleDeleteComment(comment.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {comment.content && (
                            <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
                          )}
                          {/* 댓글 첨부 미디어 */}
                          {comment.images && comment.images.length > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2.5">
                              {comment.images.map((url, idx) => (
                                <div
                                  key={idx}
                                  className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted cursor-pointer hover:opacity-90 hover:scale-[1.03] transition-all shadow-sm"
                                  onClick={() => !isVideo(url) && setLightbox({ urls: comment.images.filter(u => !isVideo(u)), index: comment.images.filter(u => !isVideo(u)).indexOf(url) })}
                                >
                                  {isVideo(url) ? (
                                    <>
                                      <video src={url} className="w-full h-full object-cover" preload="metadata" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <Play className="w-5 h-5 text-white fill-current" />
                                      </div>
                                    </>
                                  ) : (
                                    <Image src={url} alt="" width={80} height={80} className="w-full h-full object-cover" sizes="80px" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 대댓글 (답글) */}
                      {commentReplies.length > 0 && (
                        <div className="pl-8 border-l-2 border-border mt-3 space-y-3">
                          {visibleReplies.map((reply) => (
                            <div key={reply.id} className="flex items-start gap-3 pt-1">
                              {reply.author_avatar ? (
                                <Image src={reply.author_avatar} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover flex-shrink-0" sizes="24px" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                                  {reply.author_name?.[0] || '?'}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{reply.author_name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(reply.created_at), { locale: ko, addSuffix: true })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {user && (
                                      <button
                                        type="button"
                                        className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
                                        onClick={() => setReplyTo({ id: comment.id, name: reply.author_name })}
                                      >
                                        <Reply className="w-3 h-3" />
                                      </button>
                                    )}
                                    {user?.id === reply.user_id && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive h-auto p-1"
                                        onClick={() => handleDeleteComment(reply.id)}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {reply.content && (
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{reply.content}</p>
                                )}
                                {reply.images && reply.images.length > 0 && (
                                  <div className="flex gap-2 flex-wrap mt-2.5">
                                    {reply.images.map((url, idx) => (
                                      <div
                                        key={idx}
                                        className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted cursor-pointer hover:opacity-90 hover:scale-[1.03] transition-all shadow-sm"
                                        onClick={() => !isVideo(url) && setLightbox({ urls: reply.images.filter(u => !isVideo(u)), index: reply.images.filter(u => !isVideo(u)).indexOf(url) })}
                                      >
                                        {isVideo(url) ? (
                                          <>
                                            <video src={url} className="w-full h-full object-cover" preload="metadata" />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                              <Play className="w-5 h-5 text-white fill-current" />
                                            </div>
                                          </>
                                        ) : (
                                          <Image src={url} alt="" width={80} height={80} className="w-full h-full object-cover" sizes="80px" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {/* 접기/펼치기 버튼 — 답글이 3개 이상일 때 */}
                          {commentReplies.length >= 3 && !isExpanded && (
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline pt-1"
                              onClick={() => setExpandedReplies((prev) => new Set(prev).add(comment.id))}
                            >
                              답글 {hiddenCount}개 더보기
                            </button>
                          )}
                          {commentReplies.length >= 3 && isExpanded && (
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline pt-1"
                              onClick={() => setExpandedReplies((prev) => { const next = new Set(prev); next.delete(comment.id); return next })}
                            >
                              답글 접기
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </DetailSection>
        </DetailBody>
      </DetailShell>

      {/* 라이트박스 */}
      {lightbox && lightbox.urls.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            aria-label="닫기"
          >
            <X className="w-6 h-6" />
          </button>

          {lightbox.urls.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-3 transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && { ...l, index: (l.index - 1 + l.urls.length) % l.urls.length }) }}
                aria-label="이전"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-3 transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); setLightbox((l) => l && { ...l, index: (l.index + 1) % l.urls.length }) }}
                aria-label="다음"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full z-10">
                {lightbox.index + 1} / {lightbox.urls.length}
              </div>
            </>
          )}

          <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
            <Image
              src={lightbox.urls[lightbox.index]}
              alt=""
              fill
              className="object-contain rounded-lg shadow-2xl"
              sizes="100vw"
            />
          </div>
        </div>
      )}
    </>
  )
}
