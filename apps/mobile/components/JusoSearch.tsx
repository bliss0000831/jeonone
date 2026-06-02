/**
 * JusoSearch — 네이티브 도로명주소 검색 (Juso.go.kr API).
 *
 * Daum WebView 기반 AddressSearch 의 1:1 호환 인터페이스:
 *   <JusoSearch value={addr} onChange={(full, data) => ...} />
 *
 * onChange 의 data 는 DaumPostcodeData 와 같은 형태로 변환되어 전달돼서
 * 기존 호출처 코드 변경 최소화.
 *
 * 장점 (vs Daum WebView):
 *   - 네이티브 UI → WebView 부팅 비용 0 → 즉시 표시
 *   - 타이핑 시 실시간 자동완성 (Juso API)
 *   - 동/지번 우선 표시 (display 필드)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

// 기존 Daum 인터페이스와 호환 — onChange 의 2번째 인자 형태 동일하게.
export interface DaumPostcodeData {
  address: string
  addressType: string
  bname: string
  buildingName: string
  zonecode: string
  sido: string
  sigungu: string
  roadAddress: string
  jibunAddress: string
  autoRoadAddress: string
  autoJibunAddress: string
}

interface Props {
  value: string
  onChange: (address: string, data?: DaumPostcodeData) => void
  placeholder?: string
  disabled?: boolean
}

const GWANGJANG_API_BASE =
  process.env.EXPO_PUBLIC_GWANGJANG_API_BASE ?? "https://www.gwangjang.app"

interface JusoItem {
  roadAddr: string
  jibunAddr: string
  zipNo: string
  siNm: string
  sggNm: string
  emdNm: string
  liNm: string
  rn: string
  bdNm: string
  buldMnnm: string
  buldSlno: string
  display: string
}

export function JusoSearch({
  value,
  onChange,
  placeholder = "주소를 검색해주세요",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<JusoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqIdRef = useRef(0)

  // 디바운스 검색 — 타이핑 200ms 동안 입력 없으면 API 호출.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setItems([])
      setError(null)
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${GWANGJANG_API_BASE}/api/juso/search?keyword=${encodeURIComponent(q)}&perPage=20`,
        )
        if (reqId !== reqIdRef.current) return
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || "검색 실패")
          setItems([])
        } else {
          setItems(data.items || [])
          setError(null)
        }
      } catch (e: any) {
        if (reqId !== reqIdRef.current) return
        setError("네트워크 오류")
        setItems([])
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const handleSelect = useCallback(
    (item: JusoItem) => {
      // Daum 인터페이스 호환 — DaumPostcodeData 형태로 변환.
      const data: DaumPostcodeData = {
        address: item.display,
        addressType: item.jibunAddr ? "J" : "R",
        bname: item.emdNm || item.liNm || "",
        buildingName: item.bdNm || "",
        zonecode: item.zipNo || "",
        sido: item.siNm || "",
        sigungu: item.sggNm || "",
        roadAddress: item.roadAddr || "",
        jibunAddress: item.jibunAddr || "",
        autoRoadAddress: item.roadAddr || "",
        autoJibunAddress: item.jibunAddr || "",
      }
      // 표시 우선순위 — 지번/동. 건물명 있으면 괄호로 부가.
      const display = item.bdNm
        ? `${item.display} (${item.bdNm})`
        : item.display
      onChange(display, data)
      setOpen(false)
      setQuery("")
      setItems([])
    },
    [onChange],
  )

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={[styles.btn, disabled && { opacity: 0.5 }]}
      >
        <Ionicons name="location-outline" size={18} color={lightColors.ink500} />
        <Text
          style={[
            styles.btnText,
            { color: value ? lightColors.ink900 : lightColors.ink500 },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="search" size={16} color={lightColors.ink500} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={lightColors.ink900} />
            </Pressable>
            <Text style={styles.title}>주소 검색</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={lightColors.ink500} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="예: 판교역로 166, 후평동 532"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              autoFocus
              returnKeyType="search"
            />
            {!!query && (
              <Pressable onPress={() => setQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color={lightColors.ink500} />
              </Pressable>
            )}
          </View>

          <View style={{ flex: 1 }}>
            {query.trim().length < 2 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>tip</Text>
                <Text style={styles.emptyText}>
                  도로명 + 건물번호: 판교역로 166{"\n"}
                  지역명(동/리) + 번지: 후평동 532{"\n"}
                  지역명 + 건물명: 분당 주공
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={lightColors.ink500} />
              </View>
            ) : error ? (
              <View style={styles.centerBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item, i) => `${item.roadAddr}-${i}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text style={styles.rowMain} numberOfLines={2}>
                      {item.display}
                      {item.bdNm ? ` (${item.bdNm})` : ""}
                    </Text>
                    {!!item.roadAddr && item.roadAddr !== item.display && (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        도로명: {item.roadAddr}
                      </Text>
                    )}
                    <View style={styles.rowMeta}>
                      <Text style={styles.rowZip}>우편 {item.zipNo}</Text>
                    </View>
                  </Pressable>
                )}
              
                removeClippedSubviews={true}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={11}
              />
            )}
          </View>

          {/* Juso powered footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>도로명주소 · juso.go.kr</Text>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  btnText: { flex: 1, fontSize: fontSize.sm },
  backdrop: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    top: "12%",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "hidden",
  },
  handleRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.18)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  title: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: lightColors.ink900,
    paddingVertical: 4,
  },
  emptyBox: { padding: spacing[5] },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  emptyText: { fontSize: fontSize.sm, color: lightColors.ink500, lineHeight: 22 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: fontSize.sm, color: "#dc2626" },
  row: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    gap: 2,
  },
  rowMain: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  rowSub: { fontSize: fontSize.xs, color: lightColors.ink500 },
  rowMeta: { flexDirection: "row", gap: 8, marginTop: 4 },
  rowZip: {
    fontSize: 10,
    color: lightColors.ink500,
    backgroundColor: lightColors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  footer: {
    padding: spacing[2],
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  footerText: { fontSize: 10, color: lightColors.ink500 },
})
