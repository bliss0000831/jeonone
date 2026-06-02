import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { notify, preview } from '@/lib/services/notifications'
import { deleteR2Urls } from '@/lib/integrations/r2-cleanup'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

// 댓글 목록 조회 — RLS 적용 (숨김/신고 처리된 댓글 자동 필터)
// 이전에는 createAdminClient() 로 RLS 를 우회했는데,
// 관리 정책(숨김/밴 등)이 무시되어 누구나 모든 댓글을 볼 수 있었음.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('post_id')
    if (!postId) {
      return NextResponse.json({ error: 'post_id 누락' }, { status: 400 })
    }

    // 민감 필드 제외하고 필요한 컬럼만 명시적으로 선택
    const supabase = await createClient()
    const plaza = await getCurrentPlaza()

    // 광장 격리 — 다른 광장 글의 댓글 노출 차단
    if (plaza) {
      const { data: post } = await supabase
        .from('board_posts')
        .select('plaza_id')
        .eq('id', postId)
        .maybeSingle()
      if (!post || (post.plaza_id && post.plaza_id !== plaza)) {
        return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
      }
    }

    // 최상위 댓글 조회
    let q: any = supabase
      .from('board_comments')
      .select(
        'id, post_id, parent_id, user_id, content, author_name, author_avatar, images, created_at, updated_at'
      )
      .eq('post_id', postId)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(200) // 무제한 fetch 방지 — 인기 게시물 댓글 폭탄 대비
    if (plaza) q = q.eq('plaza_id', plaza)

    // 대댓글(답글) 조회
    let rq: any = supabase
      .from('board_comments')
      .select(
        'id, post_id, parent_id, user_id, content, author_name, author_avatar, images, created_at, updated_at'
      )
      .eq('post_id', postId)
      .not('parent_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1000)
    if (plaza) rq = rq.eq('plaza_id', plaza)

    const [topResult, replyResult] = await Promise.all([q, rq])

    if (topResult.error) {
      console.error('[board/comment list]', topResult.error)
      return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
    }
    if (replyResult.error) {
      console.error('[board/comment replies]', replyResult.error)
    }

    return NextResponse.json({
      comments: topResult.data || [],
      replies: replyResult.data || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // 사용자 인증
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    // 차단 사용자 체크
    const banRes = await banGuardResponse(user.id)
    if (banRes) return banRes

    // Rate limit — 유저당 1분 10개
    const limited = await enforceRateLimit(request, 'comment', user.id)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
    const { post_id, content, author_name, author_avatar, images, parent_id } = body

    if (!post_id || (!content?.trim() && (!images || images.length === 0))) {
      return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 })
    }
    // 입력 길이 캡 — XSS payload / 스토리지 폭탄 방지
    if (typeof content === 'string' && content.length > 5000) {
      return NextResponse.json(
        { error: '댓글이 너무 깁니다 (5000자 이내)' },
        { status: 400 },
      )
    }
    if (Array.isArray(images) && images.length > 10) {
      return NextResponse.json(
        { error: '이미지는 최대 10장까지' },
        { status: 400 },
      )
    }

    // 광장 검증 — 다른 광장 글에 댓글 작성 차단.
    // 허브 도메인(plazaCheck=null) 에선 댓글 작성 자체를 막음 — RLS 우회 방지.
    const admin = createAdminClient()
    const plazaCheck = await getCurrentPlaza()
    if (!plazaCheck) {
      return NextResponse.json(
        { error: '광장 도메인에서만 댓글을 작성할 수 있습니다' },
        { status: 400 },
      )
    }
    const { data: postRow } = await admin
      .from('board_posts')
      .select('plaza_id')
      .eq('id', post_id)
      .maybeSingle()
    if (!postRow || (postRow.plaza_id && postRow.plaza_id !== plazaCheck)) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('nickname, avatar_url')
      .eq('id', user.id)
      .single()

    const finalName =
      author_name ||
      profile?.nickname ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split('@')[0] ||
      '익명'
    const finalAvatar = author_avatar || profile?.avatar_url || user.user_metadata?.avatar_url || null

    // parent_id 검증 — 다른 게시글 댓글 ID로 대댓글 구조 왜곡 방지
    if (parent_id) {
      const { data: parentComment } = await admin
        .from('board_comments')
        .select('id, post_id')
        .eq('id', parent_id)
        .maybeSingle()
      if (!parentComment || parentComment.post_id !== post_id) {
        return NextResponse.json({ error: '잘못된 대댓글 대상입니다' }, { status: 400 })
      }
    }

    // 관리자 권한으로 insert (RLS 우회) — plaza_id 자동 주입
    const plaza = plazaCheck
    const { data, error } = await admin
      .from('board_comments')
      .insert([
        {
          post_id,
          user_id: user.id,
          parent_id: parent_id || null,
          content: (content || '').trim(),
          author_name: finalName,
          author_avatar: finalAvatar,
          images: images || [],
          ...(plaza ? { plaza_id: plaza } : {}),
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('[board/comment insert]', error)
      return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
    }

    // 포인트 적립 (Feature Flag OFF 시 silent no-op)
    if (plaza) {
      const { awardPoints } = await import('@/lib/services/billing/award-helper')
      awardPoints({
        userId: user.id,
        plazaId: plaza,
        ruleId: 'comment.create',
        sourceId: data.id,
        qualityData: { length: (content || '').length },
      })
    }

    // 알림 전송 (비동기, 실패해도 댓글은 이미 성공)
    try {
      if (parent_id) {
        // 대댓글 → 부모 댓글 작성자에게
        const { data: parent } = await admin
          .from('board_comments')
          .select('user_id, content')
          .eq('id', parent_id)
          .maybeSingle()
        if (parent?.user_id && parent.user_id !== user.id) {
          await notify(
            admin,
            {
              user_id: parent.user_id,
              type: 'board_reply',
              title: '새 답글',
              message: `${finalName}님: ${preview(content)}`,
              link: `/board/${post_id}`,
              thumbnail_url: finalAvatar,
            },
            user.id,
          )
        }
      } else {
        // 일반 댓글 → 글쓴이에게
        const { data: post } = await admin
          .from('board_posts')
          .select('user_id, title, images')
          .eq('id', post_id)
          .maybeSingle()
        if (post?.user_id && post.user_id !== user.id) {
          const postThumb = Array.isArray((post as any).images) && (post as any).images.length > 0
            ? String((post as any).images[0])
            : finalAvatar
          await notify(
            admin,
            {
              user_id: post.user_id,
              type: 'board_comment',
              title: '새 댓글',
              message: `${finalName}님이 '${preview(post.title, 20)}'에 댓글을 남겼습니다: ${preview(content, 30)}`,
              link: `/board/${post_id}`,
              thumbnail_url: postThumb,
            },
            user.id,
          )
        }
      }
    } catch (notifyErr) {
      console.error('[board/comment] notify error (non-fatal):', notifyErr)
    }

    return NextResponse.json({ comment: data })
  } catch (err: any) {
    console.error('comment route error:', err)
    return NextResponse.json({ error: '댓글 작성 실패' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    // Rate limit — 도배·남용 방어
    const limited = await enforceRateLimit(request, 'mutate', user.id)
    if (limited) return limited

    const delBody = await request.json().catch(() => null)
    const id = delBody?.id
    if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })

    const admin = createAdminClient()
    const plaza = await getCurrentPlaza()
    // 본인 댓글만 삭제 + 이미지 URL 수집 (R2 정리용) — 광장 격리
    let cmtQ: any = admin
      .from('board_comments')
      .select('user_id, images, plaza_id')
      .eq('id', id)
    if (plaza) cmtQ = cmtQ.eq('plaza_id', plaza)
    const { data: comment } = await cmtQ.maybeSingle()

    if (!comment) {
      return NextResponse.json({ error: '찾을 수 없습니다' }, { status: 404 })
    }
    // 소유자 OR 관리자(슈퍼·광장)
    const isOwner = comment.user_id === user.id
    const { checkAdminAuth, canAccessPlaza } = await import('@/lib/services/admin-auth')
    const auth = await checkAdminAuth(supabase, user.id)
    const isAdminOverride = auth.ok && canAccessPlaza(auth, (comment as any).plaza_id ?? null)
    if (!isOwner && !isAdminOverride) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    }

    let delQ: any = admin.from('board_comments').delete().eq('id', id)
    if (plaza) delQ = delQ.eq('plaza_id', plaza)
    const { error } = await delQ
    if (error) {
      console.error('[board/comment delete]', error)
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }

    void deleteR2Urls(comment.images as string[] | null)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}
