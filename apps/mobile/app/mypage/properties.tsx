/**
 * 내 매물 목록 (공인중개사).
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { listMyProperties } from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"
import { ListItemCard } from "@/components/mypage/ListItemCard"

export default function MyPropertiesScreen() {
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const list = await listMyProperties(getSupabase(), user.id, plazaId)
        setItems(list)
      } catch (e) {
        console.warn("[properties] load failed", e)
        Alert.alert("불러오기 실패", "매물을 불러오지 못했어요. 다시 시도해 주세요.")
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="내 매물" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="home-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>등록한 매물이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => {
            const tone =
              item.status === "active"
                ? "primary"
                : item.status === "reserved"
                  ? "amber"
                  : "muted"
            const label =
              item.status === "active"
                ? "판매중"
                : item.status === "reserved"
                  ? "예약중"
                  : "거래완료"
            return (
              <ListItemCard
                image={item.images?.[0]}
                imageFallback="home-outline"
                title={item.title}
                subtitle={item.address}
                meta={`${item.price?.toLocaleString()}만원`}
                badge={{ label, tone: tone as any }}
              />
            )
          }}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  emptyTitle: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    marginTop: spacing[2],
  },
})
