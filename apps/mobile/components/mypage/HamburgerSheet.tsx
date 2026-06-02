/**
 * 마이페이지 햄버거 메뉴 시트 — 광장 web 의 햄버거 드롭다운과 동일 항목.
 *
 * 항목 (위→아래):
 *   - 사용자 카드 (닉네임, "프로필 보기")
 *   - 내 포인트 (잔액 OP)
 *   - 글쓰기 (강조)
 *   - 마이페이지 / 찜 목록 / 채팅 / 구매 내역 / 판매 관리 / 계정 유형 신청 / 설정
 *   - 로그아웃 (destructive)
 *
 * AI 영상 / AI 크레딧 기능은 제거됨.
 */

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  nickname: string | null
  pointsBalance: number | null
  onClose: () => void
  onProfile: () => void
  onPoints: () => void
  onCompose: () => void
  onMypage: () => void
  onSaved: () => void
  onChat: () => void
  onOrders: () => void
  onSales: () => void
  onAccountUpgrade: () => void
  onSubscription: () => void
  onSettlement: () => void
  onVerify: () => void
  onSettings: () => void
  onLogout: () => void
}

export function HamburgerSheet(props: Props) {
  const { visible, nickname, pointsBalance, onClose } = props
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing[4] }}
          >
            {/* 사용자 카드 */}
            <Pressable style={styles.userCard} onPress={() => { onClose(); props.onProfile() }}>
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={20} color={lightColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{nickname ?? "이웃"} 님</Text>
                <Text style={styles.userSub}>프로필 보기</Text>
              </View>
            </Pressable>

            {/* 포인트 */}
            <Pressable style={styles.pointRow} onPress={() => { onClose(); props.onPoints() }}>
              <View style={styles.pointBadge}>
                <Text style={styles.pointBadgeText}>P</Text>
              </View>
              <Text style={styles.pointLabel}>내 포인트</Text>
              <Text style={styles.pointValue}>
                {pointsBalance != null ? pointsBalance.toLocaleString() : "—"} OP
              </Text>
            </Pressable>

            {/* 글쓰기 강조 */}
            <Pressable
              style={styles.composeBtn}
              onPress={() => { onClose(); props.onCompose() }}
            >
              <Ionicons name="create-outline" size={18} color="#ffffff" />
              <Text style={styles.composeText}>글쓰기</Text>
            </Pressable>

            {/* 메뉴 리스트 */}
            <MenuItem icon="person-outline" label="마이페이지" onPress={() => { onClose(); props.onMypage() }} />
            <MenuItem icon="heart-outline" label="찜 목록" onPress={() => { onClose(); props.onSaved() }} />
            <MenuItem icon="chatbubble-ellipses-outline" label="채팅" onPress={() => { onClose(); props.onChat() }} />
            <MenuItem icon="bag-handle-outline" label="구매 내역" onPress={() => { onClose(); props.onOrders() }} />
            <MenuItem icon="storefront-outline" label="판매 관리" onPress={() => { onClose(); props.onSales() }} />
            <View style={styles.divider} />
            <MenuItem icon="ribbon-outline" label="구독 관리" onPress={() => { onClose(); props.onSubscription() }} />
            <MenuItem icon="cash-outline" label="정산 계좌" onPress={() => { onClose(); props.onSettlement() }} />
            <View style={styles.divider} />
            <MenuItem icon="shield-checkmark-outline" label="인증 신청" onPress={() => { onClose(); props.onVerify() }} />
            <MenuItem icon="person-add-outline" label="계정 유형 신청" onPress={() => { onClose(); props.onAccountUpgrade() }} />
            <MenuItem icon="settings-outline" label="설정" onPress={() => { onClose(); props.onSettings() }} />
            <View style={styles.divider} />
            <MenuItem icon="log-out-outline" label="로그아웃" destructive onPress={() => { onClose(); props.onLogout() }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function MenuItem({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: any
  label: string
  destructive?: boolean
  onPress: () => void
}) {
  const color = destructive ? "#dc2626" : lightColors.ink900
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: lightColors.muted }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing[3],
    maxHeight: "85%",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.secondary ?? "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  userSub: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "#fef3c7",
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
  },
  pointBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  pointBadgeText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  pointLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  pointValue: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
  },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f97316",
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  composeText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: fontSize.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  menuLabel: {
    fontSize: fontSize.md,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border,
    marginVertical: spacing[1],
    marginHorizontal: spacing[4],
  },
})
