/**
 * 팔로워 / 팔로잉 통합 화면 (?kind= 로 분기).
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import {
  listFollowers,
  listFollowing,
  type FollowEntry,
} from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"

export default function FollowersScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [tab, setTab] = useState<"followers" | "following">(
    kind === "following" ? "following" : "followers",
  )
  const [items, setItems] = useState<FollowEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const fetcher = tab === "followers" ? listFollowers : listFollowing
    ;(async () => {
      try {
        const list = await fetcher(getSupabase(), user.id, plazaId)
        setItems(list)
      } catch (e) {
        console.warn("[followers] load failed", e)
        Alert.alert("불러오기 실패", "팔로우 목록을 불러오지 못했어요. 다시 시도해 주세요.")
      } finally {
        setLoading(false)
      }
    })()
  }, [user, tab, plazaId])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        title={tab === "followers" ? "팔로워" : "팔로잉"}
      />

      <View style={styles.tabs}>
        {(["followers", "following"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={({ pressed }) => [
              styles.tabBtn,
              tab === t && styles.tabActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "followers" ? "팔로워" : "팔로잉"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.empty}>
            {tab === "followers" ? "아직 팔로워가 없어요" : "팔로우 중인 사용자가 없어요"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <UserRow entry={item} />}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  user: "일반",
  agent: "공인중개사",
  interior: "인테리어",
  moving: "이사 업체",
  cleaning: "청소 업체",
  repair: "수리 업체",
  producer: "로컬푸드 생산자",
  business: "사업자",
}

function UserRow({ entry }: { entry: FollowEntry }) {
  const router = useRouter()
  const initial = entry.nickname?.[0] ?? "?"
  return (
    <Pressable
      onPress={() => router.push(`/profile/${entry.id}` as any)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={`${entry.nickname ?? "이웃"} 프로필`}
    >
      {entry.avatar_url ? (
        <Image source={{ uri: entry.avatar_url }} cachePolicy="memory-disk" style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{initial}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{entry.nickname ?? "이웃"}</Text>
        {entry.account_type && (
          <Text style={styles.type}>
            {ACCOUNT_TYPE_LABEL[entry.account_type] ?? entry.account_type}
          </Text>
        )}
      </View>
    </Pressable>
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
  empty: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    marginTop: spacing[2],
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: lightColors.primary,
  },
  tabText: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    fontWeight: "500",
  },
  tabTextActive: {
    color: lightColors.primary,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.muted,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: lightColors.ink500,
  },
  body: { flex: 1 },
  name: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  type: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
  },
})
