/**
 * 햄버거 메뉴 — 전원일기 드로어 (레퍼런스 gwjeonwon.vercel.app header.tsx 미러).
 *
 * 구성:
 *   - 녹색 헤더: 농부 로고 + "강원 전원일기" + 시/군
 *   - 메인 메뉴(원형 녹색 아이콘 + 큰 라벨): 홈 / 농기구·자재 / 로컬푸드 / 경매장 / 일손 / 소식통
 *   - 커뮤니티: 마을 사랑방 / 무료 나눔 / 농업 일기 / 정부지원금 / 살림 정보 / 궁금해요
 *   - 하단: 로그인·회원가입 (비로그인) 또는 마이페이지 + 로그아웃 (로그인)
 *
 * 어르신 친화: 큰 글씨(17~18px), 큰 터치영역, 단순 구조.
 */

import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlazaState } from "@/lib/plaza"

const GREEN = "#225a39"
const LOGO = require("../assets/images/logo-farmer.png")

interface Props {
  visible: boolean
  onClose: () => void
  cityName?: string
}

const MAIN: { icon: any; label: string; route: string }[] = [
  { icon: "home", label: "홈으로", route: "/(tabs)" },
  { icon: "construct", label: "농기구/자재 사고팔기", route: "/secondhand" },
  { icon: "leaf", label: "강원 로컬푸드", route: "/local-food" },
  { icon: "hammer", label: "만물 경매장", route: "/auction" },
  { icon: "build", label: "농기구 대여", route: "/rental" },
  { icon: "people", label: "일손 찾기", route: "/jobs" },
  { icon: "newspaper", label: "전원 소식통", route: "/board" },
]

const COMMUNITY: { label: string; route: string }[] = [
  { label: "마을 사랑방", route: "/board/c/free" },
  { label: "무료 나눔", route: "/board/c/share" },
  { label: "농업 일기", route: "/board/c/daily" },
  { label: "정부지원금", route: "/board/c/subsidy" },
  { label: "살림 정보", route: "/board/c/life" },
  { label: "궁금해요", route: "/board/c/qna" },
]

export function HamburgerMenu({ visible, onClose, cityName }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const plaza = useCurrentPlazaState()

  const go = (route: string) => {
    onClose()
    setTimeout(() => router.push(route as any), 50)
  }

  const handleLogout = async () => {
    const doLogout = async () => {
      await signOut()
      onClose()
      router.replace("/(tabs)" as any)
    }
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm("정말 로그아웃 하시겠어요?") : true
      if (ok) await doLogout()
      return
    }
    const { Alert } = require("react-native")
    Alert.alert("로그아웃", "정말 로그아웃 하시겠어요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: doLogout },
    ])
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingTop: insets.top }]} onPress={(e) => e.stopPropagation()}>
          {/* 녹색 헤더 */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Image source={LOGO} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{plaza.name}</Text>
              {cityName ? <Text style={styles.headerSub}>{cityName}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
            {/* 메인 메뉴 */}
            {MAIN.map((m) => (
              <Pressable key={m.label} style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]} onPress={() => go(m.route)}>
                <View style={styles.navIcon}>
                  <Ionicons name={m.icon} size={24} color={GREEN} />
                </View>
                <Text style={styles.navLabel}>{m.label}</Text>
              </Pressable>
            ))}

            <View style={styles.sep} />

            {/* 커뮤니티 */}
            <Text style={styles.sectionLabel}>커뮤니티</Text>
            {COMMUNITY.map((c) => (
              <Pressable key={c.label} style={({ pressed }) => [styles.boardRow, pressed && styles.boardRowPressed]} onPress={() => go(c.route)}>
                <Text style={styles.boardLabel}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* 하단 로그인 / 마이페이지 */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {user ? (
              <>
                <Pressable style={styles.myRow} onPress={() => go("/(tabs)/mypage-profile")}>
                  <Ionicons name="person-circle-outline" size={24} color={GREEN} />
                  <Text style={styles.myText}>마이페이지</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={{ marginLeft: "auto" }} />
                </Pressable>
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={20} color="#dc2626" />
                  <Text style={styles.logoutText}>로그아웃</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.loginBtn} onPress={() => go("/auth/login")}>
                <Ionicons name="person-outline" size={20} color="#ffffff" />
                <Text style={styles.loginText}>로그인 / 회원가입</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  sheet: {
    width: 320,
    maxWidth: "85%",
    height: "100%",
    backgroundColor: "#f7f6f0",
  },
  // 녹색 헤더
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: GREEN,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#ffffff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  closeBtn: { padding: 4 },

  // 메인 메뉴 행
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginHorizontal: 8,
    borderRadius: 14,
  },
  navRowPressed: { backgroundColor: "rgba(34,90,57,0.08)" },
  navIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(34,90,57,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 17, fontWeight: "800", color: "#1e293b" },

  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "#d8d4c8", marginVertical: 12, marginHorizontal: 16 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.5,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  boardRow: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
  },
  boardRowPressed: { backgroundColor: "rgba(34,90,57,0.05)", borderLeftColor: GREEN },
  boardLabel: { fontSize: 16, fontWeight: "600", color: "#475569" },

  // 하단
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e0d6",
    backgroundColor: "#ffffff",
    gap: 10,
  },
  myRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f1f5f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  myText: { fontSize: 16, fontWeight: "800", color: "#1e293b" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "rgba(220,38,38,0.3)",
    borderRadius: 14,
    paddingVertical: 13,
  },
  logoutText: { fontSize: 16, fontWeight: "800", color: "#dc2626" },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
  },
  loginText: { fontSize: 17, fontWeight: "800", color: "#ffffff" },
})
