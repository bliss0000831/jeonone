export type PropertyType = "아파트" | "빌라" | "오피스텔" | "원룸" | "투룸" | "주택" | "펜션" | "상가" | "사무실" | "토지"

export type TransactionType = "매매" | "전세" | "월세" | "단기임대"

export type PropertyStatus = "active" | "reserved" | "completed" | "hidden"

export type SellerType = "individual" | "agent"

export interface Review {
  id: string
  reviewer_id: string
  reviewed_user_id: string
  reviewer_name: string
  response_speed: number
  accuracy: number
  kindness: number
  total_score: number
  content?: string
  created_at: string
}

export interface DbProfile {
  id: string
  nickname: string | null
  phone: string | null
  avatar_url: string | null
  location: string | null
  account_type: string | null
  trust_score: number | null
  review_count: number | null
  created_at: string
  updated_at: string
}

// DB 원본 매물 row (Supabase 'properties' 테이블)
export interface DbProperty {
  id: string
  user_id: string
  title: string
  property_type: PropertyType
  transaction_type: TransactionType
  price: number
  monthly_rent: number | null
  maintenance_fee: number | null
  area_sqm: number
  floor_info: string | null
  total_floors: number | null
  rooms: number
  bathrooms: number
  address: string
  lat?: number | null
  lng?: number | null
  description: string | null
  images: string[] | null
  features: string[] | null
  move_in_date: string | null
  direction: string | null
  parking: boolean
  elevator: boolean
  pet_allowed: boolean
  views: number
  status: PropertyStatus
  seller_type?: SellerType
  is_featured?: boolean
  instagram_post_url?: string | null
  youtube_post_url?: string | null
  ai_video_url?: string | null
  panorama_images?: Array<{ url: string; title?: string | null }> | null
  created_at: string
  updated_at: string
  bumped_at?: string | null
  effective_at?: string | null
  profiles?: {
    id: string
    nickname: string | null
    phone: string | null
    avatar_url: string | null
    location: string | null
    account_type?: string | null
  } | null
}

export interface DbFavorite {
  id: string
  user_id: string
  property_id: string
  created_at: string
}

// UI용 변환된 타입 (기존 코드 호환)
export interface Property {
  id: string
  title: string
  propertyType: PropertyType
  transactionType: TransactionType
  price: number // 매매/전세 가격 (만원)
  monthlyRent?: number // 월세 (만원)
  deposit?: number // 보증금 (만원)
  maintenanceFee?: number
  area: number // 전용면적 (m²)
  floor?: string
  totalFloors?: number
  rooms?: number
  bathrooms?: number
  address: string
  lat?: number | null
  lng?: number | null
  district: string // 동네명
  description: string
  images: string[]
  createdAt: Date
  updatedAt: Date
  views: number
  likes: number
  isLiked?: boolean
  seller: {
    id: string
    name: string
    phone?: string
    profileImage?: string
    accountType?: string
  }
  features: string[]
  moveInDate?: string
  direction?: string
  parking?: boolean
  elevator?: boolean
  petAllowed?: boolean
  status: PropertyStatus
  seller_type?: SellerType
  is_featured?: boolean
  instagramPostUrl?: string
  youtubePostUrl?: string
  aiVideoUrl?: string
  panoramaImages?: Array<{ url: string; title?: string | null }>
}

export interface FilterOptions {
  propertyType?: PropertyType | "전체"
  transactionType?: TransactionType | "전체"
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  district?: string
  // 판매자 유형 — 전체/공인중개사/일반
  sellerType?: "전체" | "agent" | "individual"
  // 부가 옵션 (단일 선택) — 전체/주차/엘리베이터/반려동물
  option?: "전체" | "parking" | "elevator" | "pet"
}

// DbProperty를 Property로 변환하는 헬퍼
export function dbToProperty(db: DbProperty, favoriteCount: number = 0, isFavorite: boolean = false): Property {
  // 주소에서 시/군/구/동 추출 (동까지 포함)
  const addressParts = db.address.split(' ')
  const district = addressParts.length >= 3 
    ? `${addressParts[0]} ${addressParts[1]} ${addressParts[2]}`
    : addressParts.length >= 2 
      ? `${addressParts[0]} ${addressParts[1]}` 
      : db.address

  return {
    id: db.id,
    title: db.title,
    propertyType: db.property_type,
    transactionType: db.transaction_type,
    price: db.price, // 이미 만원 단위로 저장됨
    monthlyRent: db.monthly_rent ?? undefined, // 이미 만원 단위
    deposit: db.transaction_type === "월세" ? db.price : undefined, // 월세는 price가 보증금
    maintenanceFee: db.maintenance_fee ?? undefined,
    area: db.area_sqm,
    floor: db.floor_info ?? undefined,
    totalFloors: db.total_floors ?? undefined,
    rooms: db.rooms,
    bathrooms: db.bathrooms,
    address: db.address,
    lat: db.lat ?? null,
    lng: db.lng ?? null,
    district,
    description: db.description ?? "",
    images: db.images ?? [],
    // 올리기 사용 시 bumped_at 이 최신화 — 카드 시간 표시도 '방금 전' 으로 갱신.
    createdAt: new Date(db.effective_at ?? db.bumped_at ?? db.created_at),
    updatedAt: new Date(db.updated_at),
    views: db.views,
    likes: favoriteCount,
    isLiked: isFavorite,
    seller: {
      id: db.user_id,
      name: db.profiles?.nickname ?? "판매자",
      phone: db.profiles?.phone ?? undefined,
      profileImage: db.profiles?.avatar_url ?? undefined,
      accountType: db.profiles?.account_type ?? undefined,
    },
    features: db.features ?? [],
    moveInDate: db.move_in_date ?? undefined,
    direction: db.direction ?? undefined,
    parking: db.parking,
    elevator: db.elevator,
    petAllowed: db.pet_allowed,
    status: db.status,
    seller_type: db.seller_type ?? "individual",
    is_featured: db.is_featured ?? false,
    instagramPostUrl: db.instagram_post_url ?? undefined,
    youtubePostUrl: db.youtube_post_url ?? undefined,
    aiVideoUrl: db.ai_video_url ?? undefined,
    panoramaImages: Array.isArray(db.panorama_images) ? db.panorama_images : undefined,
  }
}
