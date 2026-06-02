/**
 * PropertyFilterModal — 광장 web property-filter-modal 1:1 미러.
 *
 * 정독 매핑 (apps/web/components/property-filter-modal.tsx):
 *   - 매물유형 (그리드)
 *   - 거래유형 (4 col)
 *   - 판매자 (3 col: 전체 / 공인중개사 / 일반)
 *   - 옵션 (4 col: 전체 / 주차 / 엘리베이터 / 반려동물)
 *   - 가격 (입력 + 퀵셋)
 *   - 면적 (입력 + 퀵셋)
 *   - 풋터: 초기화 / 적용하기
 */

import { useEffect, useState } from "react"
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { LocationSelector, type UserLocation } from "@/components/LocationSelector"

export interface PropertyFilterValue {
  propertyType: string       // "전체" | "아파트" | ...
  transactionType: string    // "전체" | "매매" | "전세" | "월세"
  sellerType: string         // "전체" | "agent" | "individual"
  option: string             // "전체" | "parking" | "elevator" | "pet"
  district?: string | null   // 동네 (showDistrict 일 때만)
  minPrice?: number | null
  maxPrice?: number | null
  minArea?: number | null
  maxArea?: number | null
}

interface Props {
  visible: boolean
  onClose: () => void
  value: PropertyFilterValue
  onChange: (next: PropertyFilterValue) => void
  /** 동네 섹션 노출 (홈 화면) — 매물 전체보기에선 false 권장 */
  showDistrict?: boolean
  /** LocationSelector 광장 격리용 plazaId */
  plazaId?: string
}

const PROPERTY_TYPES = ["전체", "아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "상가", "사무실", "토지"]
const TRANSACTION_TYPES = ["전체", "매매", "전세", "월세"]
const SELLER_TYPES = [
  { value: "전체", label: "전체" },
  { value: "agent", label: "공인중개사" },
  { value: "individual", label: "일반" },
]
const OPTIONS = [
  { value: "전체", label: "전체" },
  { value: "parking", label: "주차" },
  { value: "elevator", label: "엘리베이터" },
  { value: "pet", label: "반려동물" },
]
const PRICE_QUICK = [
  { label: "1000만 이하", value: 1000 },
  { label: "5000만 이하", value: 5000 },
  { label: "1억 이하", value: 10000 },
  { label: "3억 이하", value: 30000 },
  { label: "5억 이하", value: 50000 },
  { label: "10억 이하", value: 100000 },
]
const AREA_QUICK = [
  { label: "33m² (10평)", value: 33 },
  { label: "66m² (20평)", value: 66 },
  { label: "99m² (30평)", value: 99 },
  { label: "132m² (40평)", value: 132 },
  { label: "165m² (50평)", value: 165 },
]

export function PropertyFilterModal({
  visible,
  onClose,
  value,
  onChange,
  showDistrict = false,
  plazaId,
}: Props) {
  const [draft, setDraft] = useState<PropertyFilterValue>(value)
  const [showLocationSel, setShowLocationSel] = useState(false)
  const [priceText, setPriceText] = useState({
    min: value.minPrice != null ? String(value.minPrice) : "",
    max: value.maxPrice != null ? String(value.maxPrice) : "",
  })
  const [areaText, setAreaText] = useState({
    min: value.minArea != null ? String(value.minArea) : "",
    max: value.maxArea != null ? String(value.maxArea) : "",
  })

  useEffect(() => {
    if (visible) {
      setDraft(value)
      setPriceText({
        min: value.minPrice != null ? String(value.minPrice) : "",
        max: value.maxPrice != null ? String(value.maxPrice) : "",
      })
      setAreaText({
        min: value.minArea != null ? String(value.minArea) : "",
        max: value.maxArea != null ? String(value.maxArea) : "",
      })
    }
  }, [visible, value])

  function handleApply() {
    onChange({
      ...draft,
      minPrice: priceText.min ? Number(priceText.min) : null,
      maxPrice: priceText.max ? Number(priceText.max) : null,
      minArea: areaText.min ? Number(areaText.min) : null,
      maxArea: areaText.max ? Number(areaText.max) : null,
    })
    onClose()
  }

  function handleReset() {
    setDraft({
      propertyType: "전체",
      transactionType: "전체",
      sellerType: "전체",
      option: "전체",
      district: "전체",
      minPrice: null,
      maxPrice: null,
      minArea: null,
      maxArea: null,
    })
    setPriceText({ min: "", max: "" })
    setAreaText({ min: "", max: "" })
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation && e.stopPropagation()}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>필터</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={lightColors.ink900} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {/* 매물유형 */}
            <Text style={styles.sectionLabel}>매물 유형</Text>
            <View style={styles.chipGrid}>
              {PROPERTY_TYPES.map((t) => (
                <ChipBtn
                  key={t}
                  label={t}
                  active={draft.propertyType === t}
                  onPress={() => setDraft({ ...draft, propertyType: t })}
                />
              ))}
            </View>

            {/* 거래유형 */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>거래 유형</Text>
            <View style={styles.chipRow4}>
              {TRANSACTION_TYPES.map((t) => (
                <ChipBtn
                  key={t}
                  label={t}
                  active={draft.transactionType === t}
                  onPress={() => setDraft({ ...draft, transactionType: t })}
                  cols={4}
                />
              ))}
            </View>

            {/* 판매자 */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>판매자</Text>
            <View style={styles.chipRow3}>
              {SELLER_TYPES.map((s) => (
                <ChipBtn
                  key={s.value}
                  label={s.label}
                  active={draft.sellerType === s.value}
                  onPress={() => setDraft({ ...draft, sellerType: s.value })}
                  cols={3}
                />
              ))}
            </View>

            {/* 옵션 */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>옵션</Text>
            <View style={styles.chipRow4}>
              {OPTIONS.map((o) => (
                <ChipBtn
                  key={o.value}
                  label={o.label}
                  active={draft.option === o.value}
                  onPress={() => setDraft({ ...draft, option: o.value })}
                  cols={4}
                />
              ))}
            </View>

            {/* 동네 (showDistrict 일 때만 — 홈 화면) */}
            {showDistrict && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>동네</Text>
                <Pressable
                  onPress={() => setShowLocationSel(true)}
                  style={[
                    styles.districtBtn,
                    draft.district && draft.district !== "전체" && styles.districtBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.districtText,
                      draft.district && draft.district !== "전체" && styles.districtTextActive,
                    ]}
                  >
                    {!draft.district || draft.district === "전체" ? "동네 선택" : draft.district}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={
                      draft.district && draft.district !== "전체"
                        ? "#ffffff"
                        : lightColors.ink500
                    }
                  />
                </Pressable>
              </>
            )}

            {/* 가격 */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>가격 (만원)</Text>
            <View style={styles.rangeRow}>
              <TextInput
                value={priceText.min}
                onChangeText={(v) => setPriceText({ ...priceText, min: v.replace(/[^0-9]/g, "") })}
                placeholder="최소"
                placeholderTextColor={lightColors.ink500}
                keyboardType="numeric"
                style={styles.rangeInput}
              />
              <Text style={{ color: lightColors.ink500 }}>~</Text>
              <TextInput
                value={priceText.max}
                onChangeText={(v) => setPriceText({ ...priceText, max: v.replace(/[^0-9]/g, "") })}
                placeholder="최대"
                placeholderTextColor={lightColors.ink500}
                keyboardType="numeric"
                style={styles.rangeInput}
              />
            </View>
            <View style={[styles.chipGrid, { marginTop: 8 }]}>
              {PRICE_QUICK.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setPriceText((p) => ({ ...p, max: String(q.value) }))}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickChipText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* 면적 */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>면적 (m²)</Text>
            <View style={styles.rangeRow}>
              <TextInput
                value={areaText.min}
                onChangeText={(v) => setAreaText({ ...areaText, min: v.replace(/[^0-9]/g, "") })}
                placeholder="최소"
                placeholderTextColor={lightColors.ink500}
                keyboardType="numeric"
                style={styles.rangeInput}
              />
              <Text style={{ color: lightColors.ink500 }}>~</Text>
              <TextInput
                value={areaText.max}
                onChangeText={(v) => setAreaText({ ...areaText, max: v.replace(/[^0-9]/g, "") })}
                placeholder="최대"
                placeholderTextColor={lightColors.ink500}
                keyboardType="numeric"
                style={styles.rangeInput}
              />
            </View>
            <View style={[styles.chipGrid, { marginTop: 8 }]}>
              {AREA_QUICK.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setAreaText((p) => ({ ...p, max: String(q.value) }))}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickChipText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* 풋터 — 초기화 + 적용하기 */}
          <View style={styles.footer}>
            <Pressable onPress={handleReset} style={styles.resetBtn}>
              <Text style={styles.resetText}>초기화</Text>
            </Pressable>
            <Pressable onPress={handleApply} style={styles.applyBtn}>
              <Text style={styles.applyText}>적용하기</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>

      {/* 동네 선택 — 필터 내부 전용 (글로벌 user location 영향 X) */}
      {showDistrict && (
        <LocationSelector
          visible={showLocationSel}
          onClose={() => setShowLocationSel(false)}
          location={null}
          plazaId={plazaId}
          persistGlobal={false}
          onLocationChange={(loc: UserLocation) => {
            // 우선순위: 동 > 시군구 > 시도 > 전체
            let district = "전체"
            if (loc.dong && loc.dong !== "전체") district = loc.dong
            else if (loc.sigungu && loc.sigungu !== "전체") district = loc.sigungu
            else if (loc.sido && loc.sido !== "전체") district = loc.sido
            setDraft((d) => ({ ...d, district }))
            setShowLocationSel(false)
            // ⚠️ 글로벌 user location 갱신 X — 필터 draft 만 업데이트
          }}
        />
      )}
    </Modal>
  )
}

function ChipBtn({
  label,
  active,
  onPress,
  flex,
  cols,
}: {
  label: string
  active: boolean
  onPress: () => void
  flex?: boolean
  cols?: 3 | 4
}) {
  // cols 지정 시: flex:1 로 균등 분할 + flexBasis 0 (base 의 31% 무시) → 행 너비 100% 채움
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && styles.chipActive,
        (flex || cols) && { flex: 1, flexBasis: 0 },
      ]}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.chipText, active && { color: "#ffffff", fontWeight: "700" }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    // edge-to-edge 모드 대응 — 절대 위치로 전체 화면 강제 + 중앙 정렬
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderRadius: 20,
    width: "100%",
    maxWidth: 440, // web max-w-md
    maxHeight: Math.round(Dimensions.get("window").height * 0.85),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  // 거래유형/판매자/옵션 — flex:1 로 균등 분할, 한 줄 채움
  chipRow3: { flexDirection: "row", gap: 6 },
  chipRow4: { flexDirection: "row", gap: 6 },
  chip: {
    // web bg-secondary rounded-xl
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9", // bg-secondary
    alignItems: "center",
    justifyContent: "center",
    flexBasis: "31%",
    minWidth: 0,
  },
  chipActive: {
    backgroundColor: lightColors.primary,
  },
  chipText: { fontSize: 12, color: lightColors.ink900, fontWeight: "500" },

  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangeInput: {
    flex: 1,
    minWidth: 0, // flex 컨테이너에서 자식이 자기 콘텐츠보다 작아질 수 있게
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    fontSize: 14,
    color: lightColors.ink900,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  quickChipText: {
    fontSize: 12,
    color: lightColors.ink900,
  },

  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  resetText: { fontSize: 14, fontWeight: "600", color: lightColors.ink900 },
  applyBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    alignItems: "center",
  },
  applyText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },

  // 동네 선택 버튼
  districtBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9", // bg-secondary
  },
  districtBtnActive: {
    backgroundColor: lightColors.primary,
  },
  districtText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  districtTextActive: {
    color: "#ffffff",
  },
})
