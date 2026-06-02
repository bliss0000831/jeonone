/**
 * RegionFormField — 글 작성 폼의 지역 선택 행.
 *
 * 기능:
 *   1. 주소 자동 파싱 — address prop 변경 시 region 자동 추출 (사용자가 수동
 *      override 안 했을 때만)
 *   2. 디폴트 — 가입 region (profile.location) 으로 초기값 설정
 *   3. RegionPicker(single mode) 로 변경 가능 — "전체 지역" 옵션 포함
 *
 * 사용 (작성 폼 안):
 *   const [regionId, setRegionId] = useState<string | null>(null)
 *   <RegionFormField
 *     plazaId={DEFAULT_PLAZA}
 *     userId={user?.id}
 *     address={addressInputValue}
 *     value={regionId}
 *     onChange={setRegionId}
 *   />
 *
 *   // INSERT 시 region_id 컬럼에 그대로 넣기 — null 이면 "전체 지역" 글
 *   await supabase.from(...).insert({ ..., region_id: regionId })
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { RegionPicker } from "./RegionPicker"
import {
  listPlazaRegions,
  parseRegionFromAddress,
  resolveUserDefaultRegion,
  type Region,
} from "@/lib/region-utils"

interface Props {
  plazaId: string | null | undefined
  userId?: string | null
  /** 주소 입력 값 — 바뀔 때마다 자동 region 추출 (사용자 수동 override 안 한 경우만) */
  address?: string | null
  value: string | null
  onChange: (regionId: string | null) => void
  /** 라벨 텍스트 (default: "지역") */
  label?: string
  /** "전체 지역" 옵션 노출 (default: true — Q5 답변 B) */
  allowAll?: boolean
  /** 자동 디폴트 disable (외부에서 직접 값 셋업할 때) */
  skipAutoDefault?: boolean
}

export function RegionFormField({
  plazaId,
  userId,
  address,
  value,
  onChange,
  label = "지역",
  allowAll = true,
  skipAutoDefault = false,
}: Props) {
  const [regions, setRegions] = useState<Region[]>([])
  // 사용자가 한 번이라도 수동 선택했는지 — true 면 주소 자동파싱 OFF
  const manuallyChangedRef = useRef(false)

  // 광장 region 로드
  useEffect(() => {
    if (!plazaId) return
    let alive = true
    listPlazaRegions(plazaId).then((rs) => {
      if (alive) setRegions(rs)
    })
    return () => {
      alive = false
    }
  }, [plazaId])

  // 디폴트 — 가입 region 으로 초기값 (값 없을 때 1회만)
  useEffect(() => {
    if (skipAutoDefault) return
    if (value !== null) return
    if (!plazaId || !userId) return
    let alive = true
    ;(async () => {
      const regionId = await resolveUserDefaultRegion(userId, plazaId)
      if (alive && regionId && !manuallyChangedRef.current) {
        onChange(regionId)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plazaId, userId])

  // 주소 자동 파싱 — address 가 바뀔 때마다, 사용자 수동 변경 전이면 적용
  useEffect(() => {
    if (manuallyChangedRef.current) return
    if (!address || regions.length === 0) return
    const matched = parseRegionFromAddress(address, regions)
    if (matched && matched !== value) {
      onChange(matched)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, regions])

  function handleManualChange(regionId: string | null) {
    manuallyChangedRef.current = true
    onChange(regionId)
  }

  const summary = useMemo(() => {
    if (value === null) return "전체 지역"
    const r = regions.find((x) => x.id === value)
    return r?.name ?? "선택 안 됨"
  }, [value, regions])

  if (!plazaId) return null

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <RegionPicker
        plazaId={plazaId}
        mode="single"
        value={value}
        onChange={handleManualChange}
        allowAll={allowAll}
        trigger={(open) => (
          <Pressable
            onPress={open}
            style={({ pressed }) => [
              styles.chip,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="location" size={14} color={lightColors.primary} />
            <Text style={styles.chipText}>{summary}</Text>
            <Ionicons name="chevron-down" size={14} color={lightColors.ink500} />
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: lightColors.primary,
    minWidth: 60,
  },
})
