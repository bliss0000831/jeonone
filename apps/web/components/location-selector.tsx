"use client"

import { useState, useEffect } from "react"
import { MapPin, X, Check, Loader2, LocateFixed, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { findNearestDong } from "@/lib/constants/chuncheon-dong-coords"
import { getCurrentPlazaClient } from "@/lib/plaza/client"

export interface UserLocation {
  sido: string
  sigungu?: string
  dong?: string
}

interface DBRegion {
  id: string
  name: string
  parent_id: string | null
  level: number
  children?: DBRegion[]
}

interface LocationSelectorProps {
  location: UserLocation | null
  onLocationChange: (location: UserLocation) => void
  className?: string
  isOpen?: boolean
  onClose?: () => void
  hideButton?: boolean
  title?: string
}

const LOCATION_STORAGE_KEY = "user-location"

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (saved) {
      try {
        setLocation(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  const updateLocation = (newLocation: UserLocation) => {
    setLocation(newLocation)
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation))
  }

  return { location, setLocation: updateLocation }
}

export function LocationSelector({
  location,
  onLocationChange,
  className,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  hideButton = false,
  title,
}: LocationSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [regions, setRegions] = useState<DBRegion[]>([])
  const [loadingRegions, setLoadingRegions] = useState(false)
  const [selectedParent, setSelectedParent] = useState<DBRegion | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load regions from DB when modal opens
  useEffect(() => {
    if (isOpen && regions.length === 0) {
      setLoadingRegions(true)
      // 광장 격리 — 클라이언트에서 plaza 명시 (cookie/header 의존 X)
      const plaza = getCurrentPlazaClient()
      const url = plaza ? `/api/regions?plaza=${encodeURIComponent(plaza)}` : '/api/regions'
      fetch(url)
        .then((r) => r.json())
        .then((data: DBRegion[]) => {
          setRegions(Array.isArray(data) ? data : [])
          // Auto-select first parent
          if (data.length === 1) {
            setSelectedParent(data[0])
          }
        })
        .catch(() => {})
        .finally(() => setLoadingRegions(false))
    }
  }, [isOpen])

  // 루트 지역이 1개뿐이면 항상 자식 화면으로 고정
  useEffect(() => {
    if (isOpen && regions.length === 1 && !selectedParent) {
      setSelectedParent(regions[0])
    }
  }, [isOpen, regions, selectedParent])

  const displayText =
    isMounted && location?.dong
      ? location.dong
      : isMounted && location?.sigungu
      ? location.sigungu
      : "동네 설정"

  const handleOpen = () => {
    setInternalIsOpen(true)
    // 루트가 1개뿐이면 유지, 여러 개면 리스트로
    if (regions.length !== 1) {
      setSelectedParent(null)
    }
  }

  const handleClose = () => {
    if (externalOnClose) {
      externalOnClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  // 모달 열림 동안 배경 스크롤 잠금 + Esc 로 닫기 (다른 오버레이와 동작 통일)
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleSelectParent = (region: DBRegion) => {
    if (region.children && region.children.length > 0) {
      setSelectedParent(region)
    } else {
      // Leaf region — select directly
      onLocationChange({
        sido: region.name,
        sigungu: region.name,
      })
      handleClose()
    }
  }

  const handleSelectChild = (parent: DBRegion, child: DBRegion) => {
    onLocationChange({
      sido: parent.name,
      sigungu: parent.name,
      dong: child.name,
    })
    handleClose()
  }

  const handleSelectAll = (parent: DBRegion) => {
    onLocationChange({
      sido: parent.name,
      sigungu: parent.name,
    })
    handleClose()
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocateError("이 브라우저는 위치 정보를 지원하지 않습니다")
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const targetParent = regions[0]
          if (!targetParent) {
            setLocateError("지역 목록을 불러올 수 없습니다")
            setLocating(false)
            return
          }

          // 1) 역지오코딩 API 먼저 시도 (행정동까지 정확히 반환 — Kakao → Nominatim 폴백)
          let resolvedDong: string | null = null
          try {
            const res = await fetch(
              `/api/geocode/reverse?lat=${latitude}&lng=${longitude}`,
              { cache: "no-store" },
            )
            if (res.ok) {
              const data = await res.json()
              const rawDong: string = (data?.dong || "").trim()
              // "퇴계1동" → "퇴계동" 형태 정규화 (regions 테이블이 세부 숫자 없이 저장된 경우)
              const candidates = [rawDong, rawDong.replace(/\d+동$/, "동")]
              for (const c of candidates) {
                if (!c) continue
                const hit = (targetParent.children || []).find((x) => x.name === c)
                if (hit) { resolvedDong = hit.name; break }
                if (!resolvedDong && c === rawDong) resolvedDong = c // 테이블에 없어도 이름 그대로
              }
            }
          } catch {}

          // 2) 폴백: 로컬 좌표 매칭
          if (!resolvedDong) {
            const { name: nearestDong, distance } = findNearestDong(latitude, longitude)
            resolvedDong = nearestDong
            const MAX_KM = 25
            if (distance > MAX_KM) {
              setLocateError(
                `현재 위치가 춘천시에서 약 ${distance.toFixed(0)}km 떨어져 있어 자동 설정할 수 없습니다`,
              )
              setLocating(false)
              return
            }
          }

          const targetChild = (targetParent.children || []).find(
            (c) => c.name === resolvedDong,
          )
          onLocationChange({
            sido: targetParent.name,
            sigungu: targetParent.name,
            dong: targetChild?.name ?? resolvedDong!,
          })
          setLocating(false)
          handleClose()
        } catch (err) {
          setLocateError((err as Error).message || "위치 처리 중 오류")
          setLocating(false)
        }
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부되었습니다"
            : err.code === err.POSITION_UNAVAILABLE
              ? "현재 위치를 확인할 수 없습니다"
              : "위치 확인 시간이 초과되었습니다"
        setLocateError(msg)
        setLocating(false)
      },
      // 위치는 "어느 동인지" 만 필요 → 고정밀 GPS 불필요.
      // WiFi/셀 기반 저정밀 위치가 수백 m 오차지만 1초 안에 돌아옴.
      // maximumAge 5분: 방금 측정한 캐시 재사용해서 즉시 반환.
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    )
  }

  return (
    <>
      {!hideButton && (
        <button
          onClick={handleOpen}
          className={cn(
            // translate-y-[1px]: pill 배경만 1px 내림.
            // 내부 아이콘·텍스트는 -translate-y-[1px] 로 상쇄해 시각적 위치는 그대로.
            // bg-primary/10 으로 변경 — 광장 테마 변경 시 배경도 함께 따라감
            "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 transition-colors translate-y-[1px]",
            className,
          )}
        >
          <MapPin className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-primary flex-shrink-0 -translate-y-[1px]" />
          <span className="text-xs sm:text-sm font-medium text-primary whitespace-nowrap -translate-y-[1px]">
            {displayText}
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <div className="relative w-full md:w-[480px] max-h-[85vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {selectedParent && regions.length > 1 && (
                  <button
                    onClick={() => setSelectedParent(null)}
                    aria-label="이전"
                    className="p-1 hover:bg-secondary rounded-full mr-1"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className="text-lg font-semibold">
                  {title || (selectedParent ? `${selectedParent.name} 동네 선택` : "지역 선택")}
                </h3>
              </div>
              <button onClick={handleClose} className="p-1 hover:bg-secondary rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingRegions ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : regions.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">
                  설정된 지역이 없습니다.
                </p>
              ) : selectedParent ? (
                /* Child regions (dong-level) */
                <div className="p-4 space-y-2">
                  {/* 내 위치 버튼 */}
                  <button
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors"
                  >
                    {locating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LocateFixed className="w-4 h-4" />
                    )}
                    <span className="font-medium text-sm">
                      {locating ? "내 위치 확인 중..." : "내 위치로 설정"}
                    </span>
                  </button>
                  {locateError && (
                    <p className="text-xs text-destructive px-1">{locateError}</p>
                  )}
                  <button
                    onClick={() => handleSelectAll(selectedParent)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-primary bg-primary/5 text-primary transition-colors"
                  >
                    <span className="font-medium">{selectedParent.name} 전체</span>
                    <Check className="w-4 h-4" />
                  </button>
                  {selectedParent.children && selectedParent.children.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedParent.children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => handleSelectChild(selectedParent, child)}
                          className={cn(
                            "flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors",
                            location?.dong === child.name && location?.sigungu === selectedParent.name
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary hover:bg-secondary",
                          )}
                        >
                          <span className="font-medium">{child.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Top-level regions */
                <div className="p-4 space-y-2">
                  {/* 내 위치 버튼 — 시·군 선택 전에도 즉시 사용 가능 */}
                  <button
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors"
                  >
                    {locating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LocateFixed className="w-4 h-4" />
                    )}
                    <span className="font-medium text-sm">
                      {locating ? "내 위치 확인 중..." : "내 위치로 설정"}
                    </span>
                  </button>
                  {locateError && (
                    <p className="text-xs text-destructive px-1">{locateError}</p>
                  )}
                  {regions.map((region) => (
                    <button
                      key={region.id}
                      onClick={() => handleSelectParent(region)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors",
                        location?.sigungu === region.name
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary hover:bg-secondary",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span className="font-medium">{region.name}</span>
                      </div>
                      {region.children && region.children.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {region.children.length}개 동네 →
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
