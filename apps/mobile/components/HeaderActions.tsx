import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza, useCurrentPlazaState, plazaCityName } from "@/lib/plaza"
import { HamburgerMenu } from "@/components/HamburgerMenu"
import { UserMenu } from "@/components/UserMenu"
import { NotificationPopup } from "@/components/NotificationPopup"

// ── 모듈 레벨 캐시 ──
// 도메인 탭 전환(router.replace)으로 remount 되어도
// 이전 값을 즉시 표시 → 깜빡임 방지.
let _cachedAvatar: string | null = null
let _cachedUnread = 0
let _cacheUserId: string | null = null

export function HeaderActions({ cityName: cityNameProp }: { cityName?: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const plazaState = useCurrentPlazaState()
  const cityName = cityNameProp ?? plazaCityName(plazaState.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // 캐시에서 초기값 — remount 즉시 이전 상태 표시
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user && _cacheUserId === user.id ? _cachedAvatar : null,
  )
  const [unreadNotif, setUnreadNotif] = useState(
    user && _cacheUserId === user.id ? _cachedUnread : 0,
  )

  useEffect(() => {
    if (!user) {
      setAvatarUrl(null)
      setUnreadNotif(0)
      _cacheUserId = null
      return
    }
    let alive = true
    const supabase = getSupabase()
    ;(async () => {
      const [ppRes, notifRes] = await Promise.all([
        plazaId
          ? supabase.from("plaza_profiles").select("avatar_url").eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
          : supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
      ])
      if (!alive) return
      const av = ppRes?.data?.avatar_url ?? null
      const un = notifRes?.count ?? 0
      setAvatarUrl(av)
      setUnreadNotif(un)
      // 캐시 갱신
      _cachedAvatar = av
      _cachedUnread = un
      _cacheUserId = user.id
    })()
    return () => { alive = false }
  }, [user, plazaId])

  const handleSearch = () => {
    router.push({ pathname: "/(tabs)/search", params: { q: "", _t: String(Date.now()) } } as any)
  }

  return (
    <>
      <View style={s.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="검색" hitSlop={8} style={s.btn} onPress={handleSearch}>
          <Ionicons name="search-outline" size={21} color={lightColors.ink900} />
        </Pressable>
        {user ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="알림" hitSlop={8} style={s.btn} onPress={() => setNotifOpen(true)}>
              <Ionicons name="notifications-outline" size={22} color={lightColors.ink900} />
              {unreadNotif > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{unreadNotif > 99 ? "99+" : String(unreadNotif)}</Text>
                </View>
              )}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="내 메뉴" hitSlop={4} style={s.avatar} onPress={() => setUserMenuOpen(true)}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImg} cachePolicy="memory-disk" transition={100} contentFit="cover" />
              ) : (
                <Ionicons name="person" size={16} color={lightColors.ink500} />
              )}
            </Pressable>
          </>
        ) : (
          <Pressable hitSlop={8} style={s.loginBtn} onPress={() => router.push("/auth/login" as any)}>
            <Text style={s.loginText}>로그인</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="전체 메뉴" hitSlop={8} style={s.btn} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu-outline" size={24} color={lightColors.ink900} />
        </Pressable>
      </View>
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} cityName={cityName} />
      <UserMenu visible={userMenuOpen} onClose={() => setUserMenuOpen(false)} />
      <NotificationPopup visible={notifOpen} onClose={() => { setNotifOpen(false); setUnreadNotif(0); _cachedUnread = 0 }} />
    </>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  btn: { padding: 6, position: "relative" },
  badge: {
    position: "absolute", top: 2, right: 2,
    minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  avatar: {
    width: 32, height: 32, borderRadius: 999, overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(244,63,94,0.6)",
    backgroundColor: "#f1f5f9",
    alignItems: "center", justifyContent: "center",
    marginLeft: 6,
  },
  avatarImg: { width: "100%", height: "100%" },
  loginBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: "#f3f4f6",
  },
  loginText: { fontSize: 13, fontWeight: "600", color: "#111827" },
})
