/**
 * Bottom Tab Navigator — 광장 web BottomNav 와 동일한 5탭 구조.
 * 홈 / 검색 / 등록 / 채팅 / MY.
 *
 * - 채팅 탭에 안읽음 배지 (1:1 + 모임 + 공구 합산, 60초 polling).
 * - 활성 시 filled, 비활성 시 outline 아이콘.
 */

import React, { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useUnreadTotal } from "@/lib/use-unread-total"
import { useUnreadCounts } from "@/lib/use-unread-counts"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { prefetchMyPage } from "@/lib/mypage-prefetch"
import { RegisterSheet } from "@/components/RegisterSheet"

function TabIcon({
  name,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"]
  color: string
}) {
  return <Ionicons size={24} name={name} color={color} />
}

export default function TabLayout() {
  const router = useRouter()
  const unread = useUnreadTotal()
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 8) + 12
  const [registerOpen, setRegisterOpen] = useState(false)
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  // MY 탭 — 알림 unread 있으면 점 표시
  const myCounts = useUnreadCounts(user?.id ?? null)

  // 마이페이지 프로필/포인트 프리페치 — 탭 마운트 즉시 시작
  useEffect(() => {
    if (user?.id) prefetchMyPage(user.id, plazaId)
  }, [user?.id, plazaId])

  // 비로그인 시 보호된 탭(등록/채팅/MY) 진입 가드 — 커스텀 다이얼로그
  const [authPromptLabel, setAuthPromptLabel] = useState<string | null>(null)
  function guardLoginRequired(label: string) {
    setAuthPromptLabel(label)
  }

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        // web BottomNav 정독: active text-primary + scale, inactive muted
        tabBarActiveTintColor: lightColors.primary,
        tabBarInactiveTintColor: lightColors.ink500,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.95)",  // web bg-card/95
          borderTopColor: lightColors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + bottomPad,                      // web h-16
          paddingTop: 8,
          paddingBottom: bottomPad,
          // shadow-lg 미러
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,                                // 어르신 가독성 — 10→12
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarAccessibilityLabel: "홈 탭",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "검색",
          tabBarAccessibilityLabel: "검색 탭",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "search" : "search-outline"} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="register"
        options={{
          title: "등록",
          tabBarAccessibilityLabel: "등록 탭",
          // 가운데 떠 있는 원형 + 버튼 (앱 메인 컬러)
          tabBarButton: () => (
            <View style={tabStyles.centerWrap} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="등록 탭"
                onPress={() => {
                  if (!user) {
                    guardLoginRequired("등록")
                    return
                  }
                  setRegisterOpen(true)
                }}
                style={({ pressed }) => [
                  tabStyles.centerBtn,
                  pressed && { transform: [{ scale: 0.92 }], opacity: 0.95 },
                ]}
              >
                <Ionicons name="add" size={30} color="#ffffff" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "채팅",
          tabBarAccessibilityLabel: "채팅 탭",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
              color={color}
            />
          ),
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#dc2626",
            color: "#ffffff",
            fontSize: 10,
            fontWeight: "700",
            minWidth: 16,
            height: 16,
            lineHeight: 16,
            paddingHorizontal: 4,
          },
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault()
              guardLoginRequired("채팅")
            }
          },
        }}
      />
      <Tabs.Screen
        name="mypage-profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: "내정보",
          tabBarAccessibilityLabel: "마이페이지 탭",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "person" : "person-outline"} color={color} />
          ),
          // 미읽음 알림 있을 때 점 표시 (홈 헤더 종과 동일 데이터)
          tabBarBadge: myCounts.total > 0 ? "" : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#f97316",
            minWidth: 8,
            height: 8,
            borderRadius: 999,
            paddingHorizontal: 0,
            marginLeft: -2,
            marginTop: 2,
            transform: [{ scale: 0.9 }],
          },
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault()
              guardLoginRequired("마이페이지")
            }
          },
        }}
      />
    </Tabs>
      <RegisterSheet
        visible={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />
      {/* 비로그인 가드 — 커스텀 모달 (앱 톤 매칭) */}
      <Modal
        visible={authPromptLabel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAuthPromptLabel(null)}
        statusBarTranslucent
      >
        <Pressable style={authStyles.backdrop} onPress={() => setAuthPromptLabel(null)}>
          <Pressable style={authStyles.card} onPress={() => {}}>
            <View style={authStyles.iconWrap}>
              <Ionicons name="lock-closed" size={26} color={lightColors.primary} />
            </View>
            <Text style={authStyles.title}>로그인이 필요해요</Text>
            <Text style={authStyles.body}>
              {authPromptLabel && (
                <>
                  <Text style={{ fontWeight: "700", color: lightColors.ink900 }}>
                    {authPromptLabel}
                  </Text>
                  {" "}기능은 로그인 후 이용할 수 있어요.
                </>
              )}
            </Text>
            <View style={authStyles.actions}>
              <Pressable
                onPress={() => setAuthPromptLabel(null)}
                accessibilityLabel="취소"
                accessibilityRole="button"
                style={({ pressed }) => [
                  authStyles.btn,
                  authStyles.btnSecondary,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={authStyles.btnSecondaryText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAuthPromptLabel(null)
                  router.push("/auth/login" as any)
                }}
                accessibilityLabel="로그인"
                accessibilityRole="button"
                style={({ pressed }) => [
                  authStyles.btn,
                  authStyles.btnPrimary,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={authStyles.btnPrimaryText}>로그인</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const tabStyles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centerBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#225a39",     // 전원일기 그린 — 흰 + 아이콘 대비↑
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,                 // 탭바 위로 떠오르게
    borderWidth: 2,
    borderColor: "#ffffff",         // 흰 링 — 노치 느낌 (얇게)
    shadowColor: "#225a39",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
})

const authStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: lightColors.ink900,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    backgroundColor: "#f1f5f9",
  },
  btnSecondaryText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  btnPrimary: {
    backgroundColor: lightColors.primary,
  },
  btnPrimaryText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
  },
})
