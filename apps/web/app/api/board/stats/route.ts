import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'

// 점수 배점
const SCORE = {
  POST: 10,       // 글 1개 = 10점
  COMMENT: 3,     // 댓글 1개 = 3점
  LIKE: 1,        // 받은 좋아요 1개 = 1점
}

// 광장별 격리 필터를 host 로 결정하므로 정적 캐시 금지
export const dynamic = 'force-dynamic'

// GET /api/board/stats
// 반환: { hotPosts: Top3 인기글, rankers: Top5 활동왕 }
// CDN/edge-cache: 5분 캐시 + stale-while-revalidate 10분 — 매 방문마다 풀 집계 회피
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  // CDN 캐시 — 너무 길면 글 삭제·끌올 후에도 옛 데이터가 5분 머무름.
  // 60초 + SWR 120초 로 단축 (체감 무한 새로고침 부담은 막되 즉시성↑).
  // 클라이언트가 cache-buster (?_t=…) 를 붙이면 (글 삭제 직후 등) 강제 미스됨.
  const cacheHeaders = {
    'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
  }
  // 지역 필터 (선택) — ?region=춘천 등. 미지정이면 광장 전체 집계.
  // 댓글/활동왕은 board_comments 에 region 컬럼이 없으므로 작성자가 그 지역 글에 단 댓글로 추정 어려움 →
  // 우선 핫글만 region 으로 좁히고 활동왕은 광장 전체 집계 유지.
  const url = new URL(request.url)
  // PostgREST .or() 필터 주입 방지 — 한국어/영문/숫자/공백만 허용 (그 외 모두 제거).
  // 예: 'foo,deleted_at.is.null' 같은 페이로드가 들어와도 콤마/점이 사라져 무력화.
  const rawRegion = url.searchParams.get('region') || null
  const region = rawRegion
    ? rawRegion.replace(/[^\p{L}\p{N}\s]/gu, '').trim().slice(0, 50) || null
    : null

  // "활동왕" 은 최근 30일 활동만 집계 — 풀 테이블 스캔 방지 + 신선도
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const withPlaza = (q: any) => (plaza ? q.eq('plaza_id', plaza) : q)
  const withRegion = (q: any) =>
    region ? q.or(`region.eq.${region},region.is.null`) : q

  // 1) 인기 게시글 (좋아요 내림차순) +
  // 2) 활동왕 — Postgres RPC (board_stats_aggregate) 한 번에 SQL GROUP BY 로 처리.
  //    이전: Node 가 모든 30일 행을 가져와 JS 집계 (메모리/CPU 낭비).
  //    지금: 단일 RPC + 인덱스 스캔 (마이그레이션 20260620000000)
  void thirtyDaysAgo // 더 이상 직접 사용 X (RPC 가 days 파라미터로 처리)
  const [hotPostsQ, rankersQ] = await Promise.all([
    withRegion(withPlaza(
      supabase
        .from('board_posts')
        .select('id, title, content, author_name, author_avatar, user_id, like_count, comment_count, view_count, images, thumbnail_url, created_at, status')
        .or('status.is.null,status.eq.active')
        .order('like_count', { ascending: false })
        .order('view_count', { ascending: false })
        .limit(3),
    )),
    supabase.rpc('board_stats_aggregate', {
      p_plaza_id: plaza ?? undefined,
      p_region: region ?? undefined,
      p_days: 30,
    } as any),
  ])

  const hotPosts = (hotPostsQ.data || []).filter((p: any) => (p.like_count ?? 0) > 0)

  // RPC 결과 → 점수 계산 + 상위 5명
  const rankerRows = Array.isArray(rankersQ.data) ? (rankersQ.data as any[]) : []
  const rankers = rankerRows
    .map((r: any) => ({
      user_id: r.user_id,
      nickname: r.nickname,
      avatar_url: r.avatar_url,
      posts: r.posts || 0,
      comments: r.comments || 0,
      likes: r.likes_received || 0,
      score:
        (r.posts || 0) * SCORE.POST +
        (r.comments || 0) * SCORE.COMMENT +
        (r.likes_received || 0) * SCORE.LIKE,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return NextResponse.json(
    {
      hotPosts,
      rankers,
      score_rule: { post: SCORE.POST, comment: SCORE.COMMENT, like: SCORE.LIKE },
      window_days: 30,
    },
    { headers: cacheHeaders },
  )
}
