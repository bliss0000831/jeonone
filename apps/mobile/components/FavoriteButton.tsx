/**
 * FavoriteButton — 광장 web favorite-button.tsx 1:1 RN 미러.
 *
 * 디자인 (web 매칭):
 *   - 흰색 반투명 배경 (rgba(255,255,255,0.92))
 *   - rounded-xl (12)
 *   - shadow + scale 인터랙션
 *   - Heart 아이콘: 찜 시 fill #f43f5e (rose-500), 평소 ink500
 *   - sm: 40x40, md: 44x44
 *
 * 사용처: PropertyCard, HolmesCard (홈), DomainList 카드 등.
 */

import { useEffect, useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "expo-router"
import { impactLight } from "@gwangjang/platform/haptics"

export type FavoriteKind =
  | "property"
  | "local-food"
  | "board"
  | "club"
  | "group-buying"
  | "interior"
  | "sharing"
  | "new-store"
  | "moving"
  | "cleaning"
  | "repair"
  | "secondhand"

interface TableMapEntry {
  table: string
  col: string
}

// 웹 favorite-button.tsx 의 TABLE_MAP 와 1:1
const TABLE_MAP: Record<FavoriteKind, TableMapEntry> = {
  property: { table: "favorites", col: "property_id" },
  "local-food": { table: "local_food_likes", col: "local_food_id" },
  board: { table: "board_post_likes", col: "post_id" },
  club: { table: "club_likes", col: "club_id" },
  "group-buying": { table: "group_buying_wishlist", col: "post_id" },
  interior: { table: "interior_favorites", col: "post_id" },
  sharing: { table: "sharing_likes", col: "post_id" },
  "new-store": { table: "new_store_likes", col: "post_id" },
  moving: { table: "moving_favorites", col: "post_id" },
  cleaning: { table: "cleaning_favorites", col: "post_id" },
  repair: { table: "repair_favorites", col: "post_id" },
  secondhand: { table: "secondhand_likes", col: "post_id" },
}

interface Props {
  kind: FavoriteKind
  targetId: string
  initialLiked?: boolean
  onChange?: (liked: boolean) => void
  size?: "xs" | "sm" | "md"
  style?: any
}

export function FavoriteButton({
  kind,
  targetId,
  initialLiked,
  onChange,
  size = "xs",
  style,
}: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const plaza = useCurrentPlaza()
  const [liked, setLiked] = useState(initialLiked ?? false)
  const [busy, setBusy] = useState(false)

  // 마운트 시 DB 에서 실제 찜 상태 동기화.
  // 부모가 initialLiked 를 명시한 경우(이미 상태를 앎)엔 재조회 생략 — 하트 깜빡임/중복 쿼리 방지.
  useEffect(() => {
    if (!user?.id) return
    if (initialLiked !== undefined) return
    let cancelled = false
    const { table, col } = TABLE_MAP[kind]
    const supabase = getSupabase()
    let q: any = supabase
      .from(table)
      .select("user_id")
      .eq("user_id", user.id)
      .eq(col, targetId)
      .limit(1)
    if (plaza) q = q.eq("plaza_id", plaza)
    q.maybeSingle().then(({ data }: any) => {
      if (cancelled) return
      setLiked(!!data)
    })
    return () => {
      cancelled = true
    }
  }, [kind, targetId, user?.id, plaza, initialLiked])

  async function handlePress() {
    if (!user) {
      router.push("/auth/login")
      return
    }
    if (busy) return

    const { table, col } = TABLE_MAP[kind]
    const next = !liked

    // 낙관적 업데이트 + 가벼운 햅틱 피드백
    setLiked(next)
    onChange?.(next)
    void impactLight()
    setBusy(true)

    try {
      const supabase = getSupabase()
      if (next) {
        const insertRow: Record<string, any> = {
          user_id: user.id,
          [col]: targetId,
        }
        if (plaza) insertRow.plaza_id = plaza
        const { error } = await supabase.from(table).insert(insertRow)
        if (error && !String(error.message || "").includes("duplicate")) throw error
      } else {
        let delQ: any = supabase
          .from(table)
          .delete()
          .eq("user_id", user.id)
          .eq(col, targetId)
        if (plaza) delQ = delQ.eq("plaza_id", plaza)
        const { error } = await delQ
        if (error) throw error
      }
    } catch (err) {
      console.error("[FavoriteButton]", kind, err)
      // 롤백
      setLiked(!next)
      onChange?.(!next)
    } finally {
      setBusy(false)
    }
  }

  const sz = size === "md" ? 44 : size === "sm" ? 36 : 30
  const iconSz = size === "md" ? 22 : size === "sm" ? 18 : 16

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.()
        handlePress()
      }}
      disabled={busy}
      hitSlop={6}
      accessibilityLabel={liked ? "찜 해제" : "찜하기"}
      accessibilityRole="button"
      accessibilityState={{ checked: liked, busy }}
      style={({ pressed }) => [
        styles.btn,
        { width: sz, height: sz },
        pressed && { transform: [{ scale: 1.08 }] },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={lightColors.ink500} />
      ) : (
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={iconSz}
          color={liked ? "#f43f5e" : lightColors.ink500}
        />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
})
