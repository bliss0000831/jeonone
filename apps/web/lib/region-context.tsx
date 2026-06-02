"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface RegionContextType {
  selectedRegion: string
  setSelectedRegion: (region: string) => void
}

const RegionContext = createContext<RegionContextType | undefined>(undefined)

export function RegionProvider({ children, defaultRegion = "홍천군" }: { children: ReactNode; defaultRegion?: string }) {
  const [selectedRegion, setSelectedRegionState] = useState(defaultRegion)

  useEffect(() => {
    const stored = localStorage.getItem("selectedRegion")
    if (stored) setSelectedRegionState(stored)
  }, [])

  const setSelectedRegion = (region: string) => {
    setSelectedRegionState(region)
    try { localStorage.setItem("selectedRegion", region) } catch {}
  }

  return (
    <RegionContext.Provider value={{ selectedRegion, setSelectedRegion }}>
      {children}
    </RegionContext.Provider>
  )
}

export function useRegion() {
  const context = useContext(RegionContext)
  if (context === undefined) {
    // Provider 밖에서 호출되어도 안전하게 기본값 반환
    return { selectedRegion: "홍천군", setSelectedRegion: () => {} }
  }
  return context
}
