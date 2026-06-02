/**
 * RegionPicker — 시/군 region 다중 선택 바텀시트.
 *
 * 모드:
 *   - "filter" : 리스트 화면 상단 필터 (다중 선택 + 전체 옵션)
 *   - "single" : 작성 폼 등에서 1개만 선택 (전체 옵션 포함 — "전체 지역" 글)
 *
 * 사용:
 *   <RegionPicker
 *     plazaId={plaza}
 *     mode="filter"
 *     selection={{ kind: "ids", ids: ["uuid1"] }}
 *     onChange={(sel) => ...}
 *     trigger={(open) => <Pressable onPress={open}>...</Pressable>}
 *   />
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import {
  listPlazaRegions,
  type Region,
  type RegionSelection,
} from "@/lib/region-utils"

interface FilterProps {
  plazaId: string
  mode: "filter"
  selection: RegionSelection
  onChange: (sel: RegionSelection) => void
  trigger: (open: () => void) => React.ReactNode
}

interface SingleProps {
  plazaId: string
  mode: "single"
  /** null = "전체 지역" 글 */
  value: string | null
  onChange: (regionId: string | null) => void
  trigger: (open: () => void) => React.ReactNode
  /** 작성 폼에서 "전체" 옵션 노출 여부 (default: true — 답변 5번 B) */
  allowAll?: boolean
}

type Props = FilterProps | SingleProps

export function RegionPicker(props: Props) {
  const [open, setOpen] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    listPlazaRegions(props.plazaId)
      .then((rs) => {
        if (alive) setRegions(rs)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, props.plazaId])

  return (
    <>
      {props.trigger(() => setOpen(true))}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>
                {props.mode === "filter" ? "지역 필터" : "지역 선택"}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={lightColors.ink900} />
              </Pressable>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <ActivityIndicator color={lightColors.primary} />
              </View>
            ) : regions.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: lightColors.ink500 }}>
                  등록된 지역이 없어요
                </Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                {props.mode === "filter" ? (
                  <FilterBody
                    regions={regions}
                    selection={props.selection}
                    onChange={props.onChange}
                  />
                ) : (
                  <SingleBody
                    regions={regions}
                    value={props.value}
                    allowAll={props.allowAll ?? true}
                    onChange={(v) => {
                      props.onChange(v)
                      setOpen(false)
                    }}
                  />
                )}
              </ScrollView>
            )}

            <View style={styles.footer}>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.doneBtn}
              >
                <Text style={styles.doneBtnText}>완료</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

// ── Filter mode body (다중 선택 + 전체) ──────────────────────────────────
function FilterBody({
  regions,
  selection,
  onChange,
}: {
  regions: Region[]
  selection: RegionSelection
  onChange: (sel: RegionSelection) => void
}) {
  const isAll = selection.kind === "all"
  const selectedIds = selection.kind === "ids" ? new Set(selection.ids) : new Set<string>()

  function toggleId(id: string) {
    if (isAll) {
      // "전체" 였으면 해당 1개만 빼고 나머지 전체 선택 상태로 전환
      const all = regions.map((r) => r.id)
      onChange({ kind: "ids", ids: all.filter((x) => x !== id) })
      return
    }
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (next.size === regions.length) {
      onChange({ kind: "all" })
    } else {
      // 0개도 허용 — 전체 해제 상태 유지 (리스트에서 빈 결과로 표시)
      onChange({ kind: "ids", ids: Array.from(next) })
    }
  }
  function toggleAll() {
    // "전체" 누르면 토글 — 이미 전체면 모두 해제, 아니면 전체 선택
    if (isAll) onChange({ kind: "ids", ids: [] })
    else onChange({ kind: "all" })
  }

  return (
    <View>
      {/* 전체 */}
      <Pressable style={styles.row} onPress={toggleAll}>
        <Ionicons
          name={isAll ? "checkbox" : "square-outline"}
          size={22}
          color={isAll ? lightColors.primary : lightColors.ink500}
        />
        <Text
          style={[
            styles.rowLabel,
            isAll && { color: lightColors.primary, fontWeight: "800" },
          ]}
        >
          전체 (모든 지역)
        </Text>
      </Pressable>
      <View style={styles.divider} />

      {/* 시/군 */}
      {regions.map((r) => {
        const checked = isAll || selectedIds.has(r.id)
        return (
          <Pressable key={r.id} style={styles.row} onPress={() => toggleId(r.id)}>
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={22}
              color={checked ? lightColors.primary : lightColors.ink500}
            />
            <Text style={styles.rowLabel}>{r.name}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── Single mode body (작성 폼 — 1개만 선택) ──────────────────────────────
function SingleBody({
  regions,
  value,
  allowAll,
  onChange,
}: {
  regions: Region[]
  value: string | null
  allowAll: boolean
  onChange: (regionId: string | null) => void
}) {
  return (
    <View>
      {allowAll && (
        <>
          <Pressable style={styles.row} onPress={() => onChange(null)}>
            <Ionicons
              name={value === null ? "radio-button-on" : "radio-button-off"}
              size={22}
              color={value === null ? lightColors.primary : lightColors.ink500}
            />
            <Text
              style={[
                styles.rowLabel,
                value === null && { color: lightColors.primary, fontWeight: "800" },
              ]}
            >
              전체 지역 (모든 지역에 노출)
            </Text>
          </Pressable>
          <View style={styles.divider} />
        </>
      )}
      {regions.map((r) => {
        const selected = value === r.id
        return (
          <Pressable
            key={r.id}
            style={styles.row}
            onPress={() => onChange(r.id)}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={22}
              color={selected ? lightColors.primary : lightColors.ink500}
            />
            <Text
              style={[
                styles.rowLabel,
                selected && { color: lightColors.primary, fontWeight: "800" },
              ]}
            >
              {r.name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  grabberWrap: { alignItems: "center", paddingVertical: 6 },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: lightColors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: lightColors.ink900,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 14,
    color: lightColors.ink900,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightColors.border,
    marginHorizontal: 20,
    marginVertical: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
})
