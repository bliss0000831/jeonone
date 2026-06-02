"use client"

import { useEffect, useRef } from "react"
import { MapPin, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

declare global {
  interface Window {
    daum: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeData) => void
        onclose?: (state: string) => void
        width?: string | number
        height?: string | number
      }) => {
        embed: (element: HTMLElement) => void
        open: () => void
      }
    }
  }
}

export interface DaumPostcodeData {
  address: string // 기본 주소
  addressType: string // 주소 타입 (R: 도로명, J: 지번)
  bname: string // 법정동/법정리 이름
  buildingName: string // 건물명
  zonecode: string // 우편번호
  sido: string // 시도
  sigungu: string // 시군구
  roadAddress: string // 도로명 주소
  jibunAddress: string // 지번 주소
  autoRoadAddress: string // 자동 도로명 주소
  autoJibunAddress: string // 자동 지번 주소
}

interface AddressSearchProps {
  value: string
  onChange: (address: string, data?: DaumPostcodeData) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function AddressSearch({
  value,
  onChange,
  placeholder = "주소를 검색해주세요",
  className,
  disabled = false,
}: AddressSearchProps) {
  const scriptLoaded = useRef(false)

  useEffect(() => {
    // 이미 로드되었으면 스킵
    if (scriptLoaded.current || document.getElementById("daum-postcode-script")) {
      scriptLoaded.current = true
      return
    }

    const script = document.createElement("script")
    script.id = "daum-postcode-script"
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
    script.async = true
    script.onload = () => {
      scriptLoaded.current = true
    }
    document.head.appendChild(script)
  }, [])

  const handleSearchClick = () => {
    if (disabled) return

    if (!window.daum) {
      toast("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.")
      return
    }

    new window.daum.Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        // 지번 주소 우선, 없으면 도로명 주소 (지역 필터링을 위해)
        const fullAddress = data.jibunAddress || data.autoJibunAddress || data.roadAddress || data.address
        
        // 건물명이 있으면 추가
        const displayAddress = data.buildingName
          ? `${fullAddress} (${data.buildingName})`
          : fullAddress

        onChange(displayAddress, data)
      },
    }).open()
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <button
          type="button"
          onClick={handleSearchClick}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-3 rounded-lg border border-border bg-card text-left transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            "hover:border-primary",
            disabled && "opacity-50 cursor-not-allowed",
            !value && "text-muted-foreground"
          )}
        >
          <div className="flex items-center justify-between">
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {value || placeholder}
            </span>
            <Search className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      </div>
    </div>
  )
}

// 임베드 형태로 사용할 수 있는 컴포넌트
interface AddressSearchEmbedProps {
  onComplete: (address: string, data?: DaumPostcodeData) => void
  className?: string
}

export function AddressSearchEmbed({ onComplete, className }: AddressSearchEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptLoaded = useRef(false)

  useEffect(() => {
    // 스크립트 로드
    const loadScript = () => {
      return new Promise<void>((resolve) => {
        if (window.daum) {
          resolve()
          return
        }

        if (document.getElementById("daum-postcode-script")) {
          const checkLoaded = setInterval(() => {
            if (window.daum) {
              clearInterval(checkLoaded)
              resolve()
            }
          }, 100)
          return
        }

        const script = document.createElement("script")
        script.id = "daum-postcode-script"
        script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        script.async = true
        script.onload = () => resolve()
        document.head.appendChild(script)
      })
    }

    const initPostcode = async () => {
      if (scriptLoaded.current) return
      
      await loadScript()
      
      if (!containerRef.current || !window.daum) return

      scriptLoaded.current = true

      new window.daum.Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          // 지번 주소 우선 (지역 필터링을 위해)
          const fullAddress = data.jibunAddress || data.autoJibunAddress || data.roadAddress || data.address
          const displayAddress = data.buildingName
            ? `${fullAddress} (${data.buildingName})`
            : fullAddress
          onComplete(displayAddress, data)
        },
        width: "100%",
        height: "100%",
      }).embed(containerRef.current)
    }

    initPostcode()
  }, [onComplete])

  return (
    <div 
      ref={containerRef} 
      className={cn("w-full h-[400px] border border-border rounded-lg overflow-hidden", className)} 
    />
  )
}
