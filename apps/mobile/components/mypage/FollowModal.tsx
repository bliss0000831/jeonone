/**
 * FollowModal — 팔로워/팔로잉 목록 (web 1:1 — 중앙 카드 모달).
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import {
  listFollowers,
  listFollowing,
  type FollowEntry,
} from "@gwangjang/features/profile"
import { getSupabase } from "@/lib/supabase"

interface Props {
  visible: boolean
  kind: "followers" | "following"
  userId: string | null
  onClose: () => void
}

export function FollowModal({ visible, kind, userId, onClose }: Props) {
  const [items, setItems] = useState<FollowEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible || !userId) return
    let cancelled = false
    setLoading(true)
    const fn = kind === "followers" ? listFollowers : listFollowing
    fn(getSupabase(), userId)
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visible, kind, userId])

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
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation && e.stopPropagation()}
        >
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {kind === "followers" ? "팔로워" : "팔로잉"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={lightColors.ink900} />
            </Pressable>
          </View>

          {/* 콘텐츠 */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>
                {kind === "followers"
                  ? "아직 팔로워가 없습니다"
                  : "아직 팔로잉하는 사용자가 없습니다"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} cachePolicy="memory-disk" style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>
                        {(item.nickname?.[0] ?? "?").toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.nickname || "이웃"}</Text>
                  </View>
                </View>
              )}
            
              removeClippedSubviews={true}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={11}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderRadius: 20,
    width: "100%",
    maxWidth: 440,
    maxHeight: Math.round(Dimensions.get("window").height * 0.7),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
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
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  center: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontSize: 13,
    color: lightColors.ink500,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.muted,
  },
  avatarFallback: {
    backgroundColor: lightColors.secondary ?? "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.primary,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink900,
  },
})
