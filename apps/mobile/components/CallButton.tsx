/**
 * CallButton — 전 도메인 상세 액션 바용 "전화 걸기" 버튼 (어르신 친화).
 *
 * 개인정보 안전성:
 *   - 판매자/작성자의 profiles.phone 을 userId 로 조회.
 *   - 전화번호가 "있을 때만" 버튼 노출. 없으면 아무것도 렌더링하지 않음(null).
 *   - 번호를 화면에 평문 노출하지 않고, 탭 시 tel: 다이얼러만 연다.
 *   - profiles 조회는 jobs/채팅이 이미 phone 을 읽는 것과 동일한 RLS 안전 수준.
 *
 * 사용: 채팅 버튼은 그대로 두고 보조 버튼으로 나란히 배치.
 */

import { memo, useEffect, useState } from "react"
import { Linking, Pressable, StyleSheet, Text } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { fontSize, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"

interface Props {
  /** 판매자/작성자 user_id — profiles.phone 조회 키 */
  userId: string | null | undefined
  /** 버튼 강조색 (도메인 톤에 맞춤) */
  color?: string
  style?: any
}

export const CallButton = memo(function CallButton({ userId, color = "#0d9488", style }: Props) {
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setPhone(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await (getSupabase() as any)
          .from("profiles")
          .select("phone")
          .eq("id", userId)
          .maybeSingle()
        const p = (data?.phone as string | null) ?? null
        if (alive) setPhone(p && p.trim() ? p.trim() : null)
      } catch {
        if (alive) setPhone(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  // 번호 없으면 버튼 자체를 노출하지 않음 (개인정보 보호)
  if (!phone) return null

  const dial = () => {
    const sanitized = phone.replace(/[^0-9+]/g, "")
    if (!sanitized) return
    Linking.openURL(`tel:${sanitized}`).catch(() => {})
  }

  return (
    <Pressable
      onPress={dial}
      style={[styles.btn, { borderColor: color }, style]}
      accessibilityRole="button"
      accessibilityLabel="판매자에게 전화 걸기"
    >
      <Ionicons name="call" size={18} color={color} />
      <Text style={[styles.label, { color }]}>전화 걸기</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  label: {
    fontWeight: "700",
    fontSize: fontSize.md,
  },
})
