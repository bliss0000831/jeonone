"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Building2, Paintbrush, Truck, Sparkles, Wrench, MapPin, Star, Globe2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { toast } from "sonner"

interface Expert {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: string
  location: string | null
  trust_score: number | null
  review_count: number | null
}

interface ExpertSelectionModalProps {
  onClose: () => void
  propertyAddress?: string
  chatRoomId?: string
  propertyId?: string
  /** 중개사 매물의 채팅방에서는 공인중개사 탭을 숨긴다 */
  excludeAgentTab?: boolean
}

/**
 * 주소 문자열에서 전문가 매칭용 행정구역 토큰을 추출.
 * 우선순위: 읍/면/동 (시 바로 아래 단위) > 리 > 시/군/구
 * 예) "강원특별자치도 춘천시 동내면 거두리 123-4" → "동내면"
 *     "강원특별자치도 춘천시 근화동 123-4"       → "근화동"
 *     "강원특별자치도 춘천시 신북읍 율문리"       → "신북읍"
 */
function extractDong(address: string | null | undefined): string | null {
  if (!address) return null
  const tokens = address.split(/\s+/).filter(Boolean)
  // 1순위: 읍/면/동 (행정동 레벨)
  const eupMyeonDong = tokens.find((t) => /(읍|면|동)$/.test(t) && t.length >= 2)
  if (eupMyeonDong) return eupMyeonDong
  // 2순위: 리
  const ri = tokens.find((t) => /리$/.test(t) && t.length >= 2)
  if (ri) return ri
  // 3순위: 시/군/구
  const siGuGun = tokens.find((t) => /(시|군|구)$/.test(t))
  return siGuGun || null
}

const expertTypes = [
  { 
    type: "agent", 
    label: "공인중개사", 
    icon: Building2, 
    color: "blue",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    textColor: "text-blue-500",
    borderColor: "border-blue-200",
  },
  { 
    type: "interior", 
    label: "인테리어", 
    icon: Paintbrush, 
    color: "purple",
    bgColor: "bg-purple-50 dark:bg-purple-950",
    textColor: "text-purple-500",
    borderColor: "border-purple-200",
  },
  { 
    type: "moving", 
    label: "이사", 
    icon: Truck, 
    color: "yellow",
    bgColor: "bg-yellow-50 dark:bg-yellow-950",
    textColor: "text-yellow-600",
    borderColor: "border-yellow-200",
  },
  { 
    type: "cleaning", 
    label: "청소", 
    icon: Sparkles, 
    color: "pink",
    bgColor: "bg-pink-50 dark:bg-pink-950",
    textColor: "text-pink-500",
    borderColor: "border-pink-200",
  },
  { 
    type: "repair", 
    label: "수리", 
    icon: Wrench, 
    color: "orange",
    bgColor: "bg-orange-50 dark:bg-orange-950",
    textColor: "text-orange-500",
    borderColor: "border-orange-200",
  },
]

export function ExpertSelectionModal({ onClose, propertyAddress, chatRoomId, propertyId, excludeAgentTab = false }: ExpertSelectionModalProps) {
  // 중개사 탭 제외 시 목록에서 걸러낸다
  const visibleExpertTypes = useMemo(
    () => (excludeAgentTab ? expertTypes.filter((t) => t.type !== "agent") : expertTypes),
    [excludeAgentTab],
  )
  const [selectedType, setSelectedType] = useState(visibleExpertTypes[0].type)
  const [showAllRegions, setShowAllRegions] = useState(false) // 기본: 매물 지역 필터
  const [experts, setExperts] = useState<Expert[]>([])
  // 초기 오픈 시 위치 로드 중엔 spinner 가 보이도록 true
  const [isLoading, setIsLoading] = useState(true)
  const [sendingInvite, setSendingInvite] = useState<string | null>(null)
  const [propertyLocation, setPropertyLocation] = useState<string | null>(null)
  // 매물 주소 로드 시도가 끝났는지 (끝났는데 없어서 null일 수도 있음)
  const [locationLoaded, setLocationLoaded] = useState(false)
  const supabase = createClient()

  // 매물 주소에서 추출한 동/읍/면 (필터 키워드)
  const propertyDong = useMemo(() => extractDong(propertyLocation), [propertyLocation])

  useEffect(() => {
    getPropertyLocation()
  }, [propertyId, propertyAddress])

  // ESC 로 닫기 + body 스크롤 잠금 (마운트되어 있는 동안만 = 열려 있는 동안)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // race guard — 빠른 탭 전환 시 늦게 도착한 응답이 새 응답 덮어쓰는 것 방지
  const fetchSeqRef = useRef(0)
  useEffect(() => {
    if (!showAllRegions && !locationLoaded) return
    const seq = ++fetchSeqRef.current
    fetchExperts(seq)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, showAllRegions, propertyDong, locationLoaded])

  // 탭 구성이 바뀌어(중개사 제외 등) 현재 선택된 탭이 더 이상 없으면 첫 탭으로
  useEffect(() => {
    if (!visibleExpertTypes.find((t) => t.type === selectedType)) {
      setSelectedType(visibleExpertTypes[0].type)
    }
  }, [visibleExpertTypes, selectedType])

  const getPropertyLocation = async () => {
    setLocationLoaded(false)
    try {
      // 1. propertyAddress가 직접 전달된 경우 사용
      if (propertyAddress) {
        setPropertyLocation(propertyAddress)
        return
      }

      // 2. propertyId가 있으면 매물 정보에서 주소 가져오기
      if (propertyId) {
        const { data: property } = await supabase
          .from("properties")
          .select("address")
          .eq("id", propertyId)
          .single()

        if (property?.address) {
          setPropertyLocation(property.address)
          return
        }
      }

      // 3. chatRoomId가 있으면 채팅방의 매물 정보에서 가져오기
      if (chatRoomId) {
        const { data: chatRoom } = await supabase
          .from("chat_rooms")
          .select("property_id, properties:property_id(address)")
          .eq("id", chatRoomId)
          .single()

        // Supabase join 은 array 반환 — single 객체로 정규화
        const props: any = chatRoom?.properties
        const addr = Array.isArray(props) ? props[0]?.address : props?.address
        if (addr) {
          setPropertyLocation(addr)
        }
      }
    } finally {
      setLocationLoaded(true)
    }
  }

  const fetchExperts = async (seq?: number) => {
    setIsLoading(true)
    const isStale = () => typeof seq === 'number' && seq !== fetchSeqRef.current
    try {
      // 광장별 격리 — 현재 광장 가입자 user_id 만
      const plaza = getCurrentPlazaClient()
      let plazaUserIds: string[] | null = null
      if (plaza) {
        const { data: pp } = await supabase
          .from("plaza_profiles")
          .select("user_id")
          .eq("plaza_id", plaza)
        if (isStale()) return
        plazaUserIds = (pp || []).map((r: any) => r.user_id)
        if (plazaUserIds.length === 0) {
          setExperts([])
          setIsLoading(false)
          return
        }
      }

      let query = supabase
        .from("profiles")
        .select("id, nickname, avatar_url, account_type, location, trust_score, review_count")
        .eq("account_type", selectedType)
        .order("trust_score", { ascending: false })
        .limit(50)

      if (plazaUserIds) query = query.in("id", plazaUserIds)

      // 기본: 매물 지역(동/읍/면) 으로 필터. "전체지역" 누르면 해제.
      if (!showAllRegions && propertyDong) {
        query = query.ilike("location", `%${propertyDong}%`)
      }

      const { data, error } = await query
      if (isStale()) return

      if (error) {
        console.error("전문가 조회 실패:", error)
        setExperts([])
      } else {
        setExperts((data || []) as any)
      }
    } catch (error) {
      if (!isStale()) {
        console.error("전문가 조회 실패:", error)
        setExperts([])
      }
    } finally {
      if (!isStale()) setIsLoading(false)
    }
  }

  const handleSelectExpert = async (expert: Expert) => {
    // 채팅방에서 초대하는 경우 (chatRoomId가 있음)
    if (chatRoomId) {
      await sendInvitation(expert)
    } else {
      // 새 채팅 시작
      await startNewChat(expert)
    }
  }

  // 기존 채팅방에 전문가 초대 요청 보내기
  const sendInvitation = async (expert: Expert) => {
    setSendingInvite(expert.id)
    try {
      const response = await fetch("/api/expert-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatRoomId,
          expertId: expert.id,
          propertyId: propertyId || null,
          message: `${expert.nickname || "전문가"}님을 채팅방에 초대합니다.`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || "초대 요청 실패")
        return
      }

      toast.success("초대 요청을 보냈습니다. 전문가가 수락하면 채팅방에 참여합니다.")
      onClose()
    } catch (error) {
      console.error("초대 요청 실패:", error)
      toast.error("초대 요청 중 오류가 발생했습니다")
    } finally {
      setSendingInvite(null)
    }
  }

  // 새 채팅 시작 (채팅 목록에서 + 버튼 눌렀을 때)
  const startNewChat = async (expert: Expert) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast("로그인이 필요합니다")
        return
      }

      // 기존 채팅방 확인 (전문가와의 채팅)
      const { data: existingRooms } = await supabase
        .from("chat_rooms")
        .select("id")
        .or(`and(buyer_id.eq.${user.id},seller_id.eq.${expert.id}),and(buyer_id.eq.${expert.id},seller_id.eq.${user.id})`)
        .limit(1)

      if (existingRooms && existingRooms.length > 0) {
        window.location.href = `/chat/${existingRooms[0].id}`
        return
      } else {
        const { data: newRoom, error } = await supabase
          .from("chat_rooms")
          .insert({
            buyer_id: user.id,
            seller_id: expert.id,
            property_id: null,
          })
          .select()
          .single()

        if (error) {
          console.error("채팅방 생성 실패:", error)
          toast.error("채팅방 생성에 실패했습니다")
        } else if (newRoom) {
          window.location.href = `/chat/${newRoom.id}`
        }
      }
    } catch (error) {
      console.error("채팅 시작 실패:", error)
      toast.error("채팅 시작에 실패했습니다")
    }
  }

  const currentExpertType = expertTypes.find(t => t.type === selectedType)
  const Icon = currentExpertType?.icon || Building2

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card w-full sm:max-w-lg sm:rounded-t-2xl rounded-t-3xl max-h-[85vh] sm:max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">전문가 선택</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* 전문가 유형 탭 */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-border">
          {visibleExpertTypes.map((type) => {
            const TypeIcon = type.icon
            return (
              <button
                key={type.type}
                onClick={() => setSelectedType(type.type)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0",
                  selectedType === type.type
                    ? `${type.bgColor} ${type.textColor} border ${type.borderColor}`
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                <TypeIcon className="w-4 h-4" />
                {type.label}
              </button>
            )
          })}
        </div>

        {/* 지역 라벨 + 전체지역 토글 */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-secondary/40">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              {showAllRegions
                ? "춘천 전체 지역 전문가"
                : propertyDong
                  ? `${propertyDong} 지역 전문가`
                  : "지역 정보 없음 — 전체 전문가"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAllRegions((v) => !v)}
            disabled={!propertyDong && !showAllRegions}
            className={cn(
              "flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition-colors flex-shrink-0 border",
              showAllRegions
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/50",
              !propertyDong && !showAllRegions && "opacity-60 cursor-not-allowed",
            )}
          >
            <Globe2 className="w-3 h-3" />
            {showAllRegions ? "매물 지역만" : "전체지역"}
          </button>
        </div>

        {/* Expert List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : experts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <Icon className={cn("w-12 h-12 mb-3", currentExpertType?.textColor)} />
              <p className="text-muted-foreground">
                {!showAllRegions && propertyDong
                  ? `${propertyDong} 지역에 ${currentExpertType?.label} 전문가가 없습니다`
                  : `${currentExpertType?.label} 전문가가 없습니다`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {!showAllRegions && propertyDong
                  ? "‘전체지역’ 버튼을 눌러 다른 동네 전문가도 확인해 보세요"
                  : "다른 카테고리를 선택해보세요"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {experts.map((expert) => (
                <button
                  key={expert.id}
                  onClick={() => handleSelectExpert(expert)}
                  disabled={sendingInvite === expert.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left",
                    sendingInvite === expert.id && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {expert.avatar_url ? (
                      <img
                        src={expert.avatar_url}
                        alt={expert.nickname || "전문가"}
                        loading="lazy"
                        decoding="async"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-medium text-muted-foreground">
                        {expert.nickname?.[0] || "?"}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-foreground truncate">
                        {expert.nickname || "익명"}
                      </span>
                      {expert.trust_score != null && expert.trust_score >= 4.0 && (
                        <div className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Star className="w-3 h-3 fill-amber-500 stroke-amber-500" />
                          <span className="font-semibold tabular-nums">{expert.trust_score.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    {expert.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{expert.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Badge */}
                  <div className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium flex-shrink-0",
                    currentExpertType?.bgColor,
                    currentExpertType?.textColor
                  )}>
                    {currentExpertType?.label}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
