/**
 * 전문가 초대 풀스크린 — 부동산/홈즈 서비스 전문가 도메인 제거됨.
 *
 * 공인중개사·인테리어·이사·청소·수리 전문가 카테고리가 모두 사라져
 * 이 화면은 더 이상 초대할 전문가 유형이 없습니다.
 * 호출 경로는 남아있을 수 있으므로 안내 placeholder 만 렌더합니다.
 */

import { StyleSheet, Pressable, Text, View } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

export default function InviteExpertScreen() {
  const router = useRouter()

  return (
    <View style={styles.modalBackdrop}>
      <Stack.Screen
        options={{ headerShown: false, presentation: "transparentModal", animation: "fade" }}
      />
      <Pressable style={StyleSheet.absoluteFillObject} onPress={() => router.back()} />
      <View style={styles.modalCard}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>전문가 초대</Text>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="close" size={20} color={lightColors.ink500} />
          </Pressable>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons
            name="information-circle-outline"
            size={48}
            color={lightColors.ink500}
            style={{ opacity: 0.5 }}
          />
          <Text style={styles.emptyTitle}>전문가 초대 기능은 사용할 수 없습니다</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: spacing[3],
    textAlign: "center",
  },
})
