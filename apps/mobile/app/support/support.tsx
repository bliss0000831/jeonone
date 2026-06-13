/**
 * 고객센터 — 광장 web /support 정적 안내 페이지.
 * 이메일 / 운영 시간 / FAQ 링크.
 */

import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export default function SupportScreen() {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>고객센터</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <View style={styles.heroIcon}>
          <Ionicons name="headset-outline" size={36} color={lightColors.primary} />
        </View>
        <Text style={styles.heroTitle}>도움이 필요하신가요?</Text>
        <Text style={styles.heroSub}>
          이용 중 문의 / 신고 / 분쟁 등 궁금한 점이 있으시면 언제든 연락해주세요.
        </Text>

        <View style={styles.card}>
          <Pressable
            onPress={() => Linking.openURL("mailto:ikdohyeon@gmail.com")}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: lightColors.muted }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
              <Ionicons name="mail-outline" size={20} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>이메일</Text>
              <Text style={styles.value}>ikdohyeon@gmail.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: "rgba(245,158,11,0.1)" }]}>
              <Ionicons name="time-outline" size={20} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>운영 시간</Text>
              <Text style={styles.value}>평일 오전 9시 ~ 오후 6시</Text>
              <Text style={styles.helper}>주말·공휴일 휴무</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Pressable
            onPress={() => router.push("/support/faq")}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: lightColors.muted }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: "rgba(6,182,212,0.1)" }]}>
              <Ionicons name="help-circle-outline" size={20} color="#0891b2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>자주 묻는 질문</Text>
              <Text style={styles.helper}>대부분의 질문은 FAQ에서 확인 가능합니다</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
          </Pressable>
        </View>

        <Text style={styles.note}>
          긴급한 사안 (사기·범죄 등) 은 가까운 경찰서 (사이버수사 182) 에 신고 부탁드립니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  heroIcon: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59,130,246,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing[3],
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
    textAlign: "center",
    marginBottom: 4,
  },
  heroSub: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    textAlign: "center",
    marginBottom: spacing[5],
    lineHeight: 20,
  },
  card: {
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  value: {
    fontSize: 13,
    color: lightColors.ink700,
    marginTop: 2,
  },
  helper: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border,
  },
  note: {
    fontSize: 11,
    color: lightColors.ink500,
    textAlign: "center",
    marginTop: spacing[5],
    lineHeight: 16,
  },
})
