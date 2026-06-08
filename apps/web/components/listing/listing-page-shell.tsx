/**
 * 리스팅 페이지 통합 셸 — PC/모바일 분기.
 *
 * PC (md+): 좌측 필터 사이드바 + 우측 4열 그리드
 * 모바일: 상단 카테고리 탭 + 단일 컬럼 리스트
 *
 * 사용처: 중고거래 / 나눔 / 구인구직 / 모임 / 신장개업 / 게시판
 */
import type { ReactNode } from 'react'
import type { ListingItem } from './listing-types'
import { ListingGridCard } from './listing-grid-card'
import { ListingListItem } from './listing-list-item'
import { PlatformDisclaimerBand } from '@/components/platform-disclaimer-band'

interface Props {
  /** PC 좌측 사이드바 (ListingFilterSidebar) */
  sidebar: ReactNode
  /** 모바일 상단 탭 (ListingMobileTabs) — 선택 */
  mobileTabs?: ReactNode
  /** 표시할 아이템들 */
  items: ListingItem[]
  /** 우측 상단 글쓰기 버튼 등 */
  headerAction?: ReactNode
  /** 헤더 제목 (PC 전용 큰 글씨) */
  title?: string
  /** 빈 상태 표시 */
  emptyState?: ReactNode
  /** 로딩 상태 */
  loading?: boolean
  /** 리스트 하단에 추가할 콘텐츠 (예: "더 보기" 버튼) */
  afterItems?: ReactNode
  /** 컨텐츠 위(헤더 아래)에 표시할 툴바 (예: 정렬/지역 필터 바) */
  toolbar?: ReactNode
}

export function ListingPageShell({
  sidebar,
  mobileTabs,
  items,
  headerAction,
  title,
  emptyState,
  loading = false,
  afterItems,
  toolbar,
}: Props) {
  return (
    <>
      {mobileTabs}

      <main className="max-w-6xl mx-auto px-0 md:px-6 py-0 md:py-6">
        <div className="flex gap-8">
          {sidebar}

          <div className="flex-1 min-w-0">
            {/* PC 전용 헤더 */}
            {(title || headerAction) && (
              <div className="hidden md:flex items-center justify-between mb-4">
                {title && <h1 className="text-2xl font-bold text-foreground">{title}</h1>}
                {headerAction && <div>{headerAction}</div>}
              </div>
            )}

            {/* 정렬/지역 툴바 — 컨텐츠 위 (모바일에서도 노출) */}
            {toolbar && <div className="px-4 md:px-0">{toolbar}</div>}

            {/* 컨텐츠 */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 md:px-0">{emptyState}</div>
            ) : (
              <>
                {/* 모바일: list */}
                <div className="md:hidden">
                  {items.map((item) => (
                    <ListingListItem key={item.href} item={item} />
                  ))}
                </div>

                {/* PC: grid */}
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
                  {items.map((item) => (
                    <ListingGridCard key={item.href} item={item} />
                  ))}
                </div>
              </>
            )}

            {/* "더 보기" 등 리스트 하단 추가 콘텐츠 */}
            {!loading && items.length > 0 && afterItems}

            {/* 리스트 하단 면책 띠 — 전상법 제20조의2 통신판매중개자 안내 */}
            {!loading && items.length > 0 && <PlatformDisclaimerBand />}
          </div>
        </div>
      </main>
    </>
  )
}
