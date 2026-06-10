/**
 * 메인 배너 데이터 타입.
 * 정의 위치는 데이터 소유자 (이 파일) — 컴포넌트는 여기서 import.
 */
export interface BannerData {
  id: string
  title: string
  subtitle: string
  description: string
  href: string
  icon: string
  gradient: string
  image_url?: string | null
  order_index: number
  is_active: boolean
  // ── 커스터마이징 필드 ─────────────────────────
  opacity?: number | null          // 0~100, 이미지 위 검정 오버레이 %
  font_family?: string | null      // 'sans' | 'serif' | 'mono' | ''
  logo_image_url?: string | null   // lucide 아이콘 대신 커스텀 로고 이미지
}

// Default banners (used when DB is empty, errors, or table missing)
export const defaultBanners: BannerData[] = [
  {
    id: '0',
    title: "전원일기",
    subtitle: "농업인을 위한 따뜻한 마을 장터",
    description: "우리 지역 농업인들과 따뜻한 이웃을 만나세요",
    href: "/",
    icon: "Home",
    gradient: "from-emerald-700 via-teal-600 to-cyan-600",
    image_url: "/banners/hero-banner.jpg",
    order_index: 0,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '1',
    title: "우리동네 매물",
    subtitle: "춘천시 부동산 정보를 한눈에",
    description: "전세, 월세, 매매까지 신뢰할 수 있는 매물 정보",
    href: "/properties",
    icon: "Building2",
    gradient: "from-slate-700 via-slate-600 to-slate-500",
    image_url: "/banners/properties-banner.jpg",
    order_index: 1,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '2',
    title: "우리동네 홈즈",
    subtitle: "집 꾸미기부터 이사까지",
    description: "검증된 인테리어, 이사, 청소, 수리 전문가",
    href: "/interior",
    icon: "Home",
    gradient: "from-amber-700 via-orange-600 to-yellow-500",
    image_url: "/banners/interior-banner.jpg",
    order_index: 2,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '3',
    title: "이웃과 나눔",
    subtitle: "따뜻한 이웃사촌",
    description: "안 쓰는 물건, 이웃과 나누면 더 가치있어요",
    href: "/sharing",
    icon: "Heart",
    gradient: "from-rose-600 via-pink-500 to-red-400",
    image_url: "/banners/sharing-banner.jpg",
    order_index: 3,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '4',
    title: "함께 사면 싸다",
    subtitle: "우리 동네 공동구매",
    description: "이웃과 함께 구매하면 더 저렴하게",
    href: "/group-buying",
    icon: "ShoppingCart",
    gradient: "from-blue-700 via-indigo-600 to-violet-500",
    image_url: "/banners/group-buying-banner.jpg",
    order_index: 4,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '5',
    title: "새로 오픈했어요",
    subtitle: "우리 동네 새 가게 소식",
    description: "동네에 새로 문 연 가게들을 소개합니다",
    href: "/new-store",
    icon: "Store",
    gradient: "from-amber-600 via-yellow-500 to-lime-400",
    image_url: "/banners/new-store-banner.jpg",
    order_index: 5,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
  {
    id: '6',
    title: "전문가 초대",
    subtitle: "채팅에서 전문가를 바로 연결",
    description: "필요한 전문가를 쉽고 빠르게 만나보세요",
    href: "/faq",
    icon: "UserPlus",
    gradient: "from-teal-600 via-emerald-500 to-green-400",
    image_url: "/banners/expert-banner.jpg",
    order_index: 6,
    is_active: true,
    opacity: 40,
    font_family: "sans",
    logo_image_url: null,
  },
]

/**
 * 기본 배너 텍스트의 "춘천" 을 현재 광장 도시명으로 치환.
 * DB 에 광장별 배너가 없을 때 fallback 으로 사용.
 */
function localizeDefaults(cityName: string | null): BannerData[] {
  if (!cityName || cityName === '춘천') return defaultBanners
  return defaultBanners.map((b) => ({
    ...b,
    title: b.title.replace(/춘천/g, cityName),
    subtitle: b.subtitle.replace(/춘천/g, cityName),
    description: b.description.replace(/춘천/g, cityName),
  }))
}

/**
 * SSR: hero_banners 로드 (실패/빈 데이터 → 기본 배너 폴백)
 * 클라이언트 라운드트립이 없어 "배너 로딩중" 지연이 사라짐
 *
 * cityName 전달 시 fallback 의 "춘천" 텍스트가 그 도시명으로 치환됨.
 */
export async function getHeroBanners(
  supabase: any,
  plazaId?: string | null,
  cityName?: string | null,
): Promise<BannerData[]> {
  try {
    let q = supabase
      .from("hero_banners")
      .select(
        "id, title, subtitle, description, href, icon, gradient, image_url, order_index, is_active, opacity, font_family, logo_image_url"
      )
      .eq("is_active", true)
      .order("order_index", { ascending: true })
    if (plazaId) q = q.eq("plaza_id", plazaId)
    const { data, error } = await q

    // homepage_slider — 어드민 → 테마 → 슬라이더 에서 관리하는 추가 배너.
    // hero_banners 결과에 합쳐서 노출.
    let extras: BannerData[] = []
    try {
      let sq = supabase
        .from('homepage_slider')
        .select('id, title, image_url, link_url, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (plazaId) sq = sq.eq('plaza_id', plazaId)
      const { data: sliders, error: sErr } = await sq
      if (!sErr && Array.isArray(sliders)) {
        extras = sliders.map((s: any, i: number) => ({
          id: `slider-${s.id}`,
          title: s.title || '',
          subtitle: '',
          description: '',
          href: s.link_url || '/',
          icon: 'Home',
          gradient: 'from-slate-700 via-slate-600 to-slate-500',
          image_url: s.image_url || '',
          order_index: 1000 + (s.sort_order ?? i), // 기존 hero 뒤에 붙음
          is_active: true,
          opacity: 30,
          font_family: 'sans',
          logo_image_url: null,
        }))
      }
    } catch {
      // homepage_slider 테이블 없거나 에러 — 무시
    }

    if (!error && data && data.length > 0) {
      return [...(data as BannerData[]), ...extras]
    }
    if (extras.length > 0) {
      return extras
    }
  } catch {
    // fall through to defaults
  }
  return localizeDefaults(cityName ?? null)
}
