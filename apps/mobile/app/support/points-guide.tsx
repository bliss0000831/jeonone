/**
 * 포인트 안내 — 광장 web /points-guide 와 동일.
 * 정적 안내 페이지 — 적립/사용/정책 설명.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export default function PointsGuideScreen() {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>포인트 안내</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroCoin}>
            <Text style={styles.heroCoinText}>P</Text>
          </View>
          <Text style={styles.heroTitle}>전원일기 포인트로</Text>
          <Text style={styles.heroSub}>활동도 거래도 더 즐겁게</Text>
        </View>

        <Section title="적립 방법">
          <Item icon="document-text-outline" color="#2563eb" label="게시글·매물 등록" desc="첫 등록 시 보너스 적립" />
          <Item icon="chatbubble-outline" color="#059669" label="댓글 작성" desc="댓글마다 소량 적립" />
          <Item icon="heart-outline" color="#e11d48" label="찜 받음" desc="다른 회원이 내 글을 찜하면 적립" />
          <Item icon="trophy-outline" color="#d97706" label="첫 가입 / 일일 출석" desc="가입 보너스, 매일 첫 접속 시" />
        </Section>

        <Section title="사용 방법">
          <Item icon="cart-outline" color="#7c3aed" label="공동구매·로컬푸드 결제" desc="구매 시 포인트로 일부 결제" />
          <Item icon="star-outline" color="#f59e0b" label="이벤트 응모 / 기프티콘" desc="이벤트 참여, 상품 교환" />
        </Section>

        <Section title="유의사항">
          <View style={styles.callout}>
            <Text style={styles.calloutItem}>• 적립 포인트는 무상으로 지급되며 현금 환불되지 않습니다.</Text>
            <Text style={styles.calloutItem}>• 유상 충전 포인트는 결제일로부터 7일 이내, 미사용 분에 한해 환불 가능합니다 (전자상거래법 제17조).</Text>
            <Text style={styles.calloutItem}>• 마지막 적립·사용일로부터 5년간 사용 내역이 없을 경우 자동 소멸됩니다.</Text>
            <Text style={styles.calloutItem}>• 부정 적립(자전거래·다중 계정 등) 발견 시 사전 통지 없이 회수·소멸 처리됩니다.</Text>
          </View>
        </Section>

        <Pressable
          onPress={() => router.push("/legal/terms")}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.linkText}>자세한 내용은 이용약관 제9조 →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing[5] }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function Item({
  icon,
  color,
  label,
  desc,
}: {
  icon: any
  color: string
  label: string
  desc: string
}) {
  return (
    <View style={styles.itemRow}>
      <View style={[styles.itemIcon, { backgroundColor: `${color}1a` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDesc}>{desc}</Text>
      </View>
    </View>
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
  hero: {
    alignItems: "center",
    paddingVertical: spacing[5],
  },
  heroCoin: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[3],
    shadowColor: "#f59e0b",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  heroCoinText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  heroSub: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  itemDesc: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
  callout: {
    padding: spacing[4],
    gap: 6,
  },
  calloutItem: {
    fontSize: 12,
    lineHeight: 18,
    color: lightColors.ink700,
  },
  linkBtn: {
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  linkText: {
    fontSize: fontSize.sm,
    color: lightColors.primary,
    fontWeight: "500",
  },
})
