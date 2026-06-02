/**
 * DatePickerField — 모바일 날짜/시간 선택 위젯.
 *
 * @react-native-community/datetimepicker 래퍼. 텍스트 input 자리에 바로 드롭인.
 * value 는 "YYYY-MM-DD" (date) / "HH:mm" (time) / "YYYY-MM-DDTHH:mm" (datetime) 문자열.
 *
 * 사용:
 *   <DatePickerField value={meetingDate} onChange={setMeetingDate} mode="date" />
 *   <DatePickerField value={meetingTime} onChange={setMeetingTime} mode="time" />
 *   <DatePickerField value={deadline} onChange={setDeadline} mode="datetime" />
 *
 * 모드별 보장:
 *   - date: YYYY-MM-DD
 *   - time: HH:mm
 *   - datetime: YYYY-MM-DDTHH:mm
 */

import { useState, useEffect } from "react"
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
} from "react-native"
import DateTimePicker from "@react-native-community/datetimepicker"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

type Mode = "date" | "time" | "datetime"

interface Props {
  value: string
  onChange: (v: string) => void
  mode?: Mode
  placeholder?: string
  minimumDate?: Date
  maximumDate?: Date
  disabled?: boolean
  // 빈 값 허용 옵션 (선택형 필드)
  clearable?: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function parseValue(v: string, mode: Mode): Date {
  if (!v) return new Date()
  if (mode === "time") {
    const m = v.match(/^(\d{1,2}):(\d{2})$/)
    if (m) {
      const d = new Date()
      d.setHours(Number(m[1]) || 0, Number(m[2]) || 0, 0, 0)
      return d
    }
    return new Date()
  }
  if (mode === "datetime") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{1,2}):(\d{2})/)
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
      )
    }
  }
  // date or fallback
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  return new Date()
}

function formatValue(d: Date, mode: Mode): string {
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (mode === "time") return hm
  if (mode === "datetime") return `${ymd}T${hm}`
  return ymd
}

function displayValue(v: string, mode: Mode): string {
  if (!v) return ""
  if (mode === "datetime") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{1,2}):(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4].padStart(2, "0")}:${m[5]}`
  }
  return v
}

export function DatePickerField({
  value,
  onChange,
  mode = "date",
  placeholder,
  minimumDate,
  maximumDate,
  disabled = false,
  clearable = false,
}: Props) {
  const [open, setOpen] = useState(false)
  // datetime 모드는 iOS spinner / Android 2단계 (date → time)
  const [androidStep, setAndroidStep] = useState<"date" | "time">("date")
  const [androidTempDate, setAndroidTempDate] = useState<Date | null>(null)

  const placeholderText =
    placeholder ||
    (mode === "time"
      ? "시간 선택"
      : mode === "datetime"
        ? "날짜·시간 선택"
        : "날짜 선택")

  const icon =
    mode === "time"
      ? "time-outline"
      : mode === "datetime"
        ? "calendar-outline"
        : "calendar-outline"

  const handlePress = () => {
    if (disabled) return
    setAndroidStep("date")
    setAndroidTempDate(null)
    setOpen(true)
  }

  const handleAndroidChange = (event: any, picked?: Date) => {
    // Android: dismissed → 닫기
    if (event?.type === "dismissed") {
      setOpen(false)
      return
    }
    if (!picked) return

    if (mode === "datetime") {
      if (androidStep === "date") {
        // date 선택 완료 → time picker 띄우기
        setAndroidTempDate(picked)
        setAndroidStep("time")
        return
      }
      // time 선택 완료 → 병합
      const base = androidTempDate ?? picked
      base.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
      onChange(formatValue(base, "datetime"))
      setOpen(false)
      setAndroidTempDate(null)
      setAndroidStep("date")
      return
    }
    // date or time 단일 모드
    onChange(formatValue(picked, mode))
    setOpen(false)
  }

  const [iosTempDate, setIosTempDate] = useState<Date>(parseValue(value, mode))
  // 재오픈 시 현재 value 로 스피너 재동기화 (stale 초기값 방지)
  useEffect(() => {
    if (open) setIosTempDate(parseValue(value, mode))
  }, [open, value, mode])

  const handleIosConfirm = () => {
    onChange(formatValue(iosTempDate, mode))
    setOpen(false)
  }

  const handleClear = () => {
    onChange("")
  }

  const initial = parseValue(value, mode)

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={[styles.btn, disabled && { opacity: 0.5 }]}
      >
        <Ionicons name={icon} size={18} color={lightColors.ink500} />
        <Text
          style={[
            styles.btnText,
            { color: value ? lightColors.ink900 : lightColors.ink500 },
          ]}
          numberOfLines={1}
        >
          {value ? displayValue(value, mode) : placeholderText}
        </Text>
        {clearable && value ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.()
              handleClear()
            }}
            hitSlop={6}
          >
            <Ionicons name="close-circle" size={16} color={lightColors.ink500} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color={lightColors.ink500} />
        )}
      </Pressable>

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={
            mode === "datetime" && androidStep === "time" && androidTempDate
              ? androidTempDate
              : initial
          }
          mode={
            mode === "datetime"
              ? androidStep === "date"
                ? "date"
                : "time"
              : (mode as any)
          }
          display="default"
          onChange={handleAndroidChange}
          minimumDate={mode !== "time" ? minimumDate : undefined}
          maximumDate={mode !== "time" ? maximumDate : undefined}
          is24Hour
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.iosBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.iosSheet}>
            <View style={styles.iosHeader}>
              <Pressable onPress={() => setOpen(false)} hitSlop={6}>
                <Text style={styles.iosCancel}>취소</Text>
              </Pressable>
              <Text style={styles.iosTitle}>{placeholderText}</Text>
              <Pressable onPress={handleIosConfirm} hitSlop={6}>
                <Text style={styles.iosConfirm}>확인</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={iosTempDate}
              mode={mode === "datetime" ? "datetime" : (mode as any)}
              display="spinner"
              onChange={(_: any, d?: Date) => d && setIosTempDate(d)}
              minimumDate={mode !== "time" ? minimumDate : undefined}
              maximumDate={mode !== "time" ? maximumDate : undefined}
              is24Hour
              locale="ko-KR"
              style={{ backgroundColor: "#fff" }}
            />
          </View>
        </Modal>
      )}
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
  iosBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  iosSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing[4],
  },
  iosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  iosTitle: { fontSize: fontSize.md, fontWeight: "600", color: lightColors.ink900 },
  iosCancel: { fontSize: fontSize.md, color: lightColors.ink500 },
  iosConfirm: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.primary },
})
