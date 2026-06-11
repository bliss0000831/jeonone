/**
 * HomeTab — 강원 전원일기 농업 허브 홈 (RN).
 * 레퍼런스(gwjeonwon.vercel.app) 와 동일 구성: 히어로(농부 로고)·날씨·검색,
 * 소통과나눔·정보와혜택, 퀵액션, 농기구·로컬푸드·경매·일손 사진 카드,
 * 전원 소식통 배너, 공지사항·오늘의 농사 일지.
 */

import { useState, useEffect } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, TextInput } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image, ImageBackground } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { useCurrentPlazaState, useCurrentRegion } from "@/lib/plaza"
import PlazaSelector from "@/components/PlazaSelector"
import { HamburgerMenu } from "@/components/HamburgerMenu"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"

const GREEN = "#225a39"
const GREEN_DARK = "#1c4e31"
const BROWN = "#8a6d3b"

const IMG = {
  logo: require("../../assets/images/logo-farmer.png"),
  bg: require("../../assets/images/gangwon-bg.jpg"),
  equipment: require("../../assets/images/card-farm-equipment.jpg"),
  food: require("../../assets/images/card-local-food.jpg"),
  auction: require("../../assets/images/card-auction.jpg"),
  workers: require("../../assets/images/card-workers.jpg"),
  news: require("../../assets/images/banner-news.jpg"),
}

const DIARY = [
  { icon: "leaf" as const, title: "흙 살리기", desc: "퇴비·유기물을 꾸준히 넣으면 땅심이 좋아져요." },
  { icon: "rainy" as const, title: "물 주기", desc: "아침 일찍이나 해 질 무렵에 주면 물이 덜 마릅니다." },
  { icon: "book" as const, title: "병해충 살피기", desc: "잎 앞뒤를 자주 살펴 일찍 발견하면 피해가 적어요." },
]

export default function HomeTab() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const region = useCurrentRegion(plaza.id)
  const { user } = useAuth()
  const [q, setQ] = useState("")
  const [plazaSelectorOpen, setPlazaSelectorOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [weather, setWeather] = useState<{ temp: number; condition: string; humidity: number } | null>(null)
  const [notices, setNotices] = useState<{ id: string; title: string; date: string; isNew: boolean }[]>([])

  // 날씨 — 실데이터 시도, 실패 시 숨김 (가짜 표시 금지)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await gwangjangFetch("/api/weather?region=" + encodeURIComponent(region))
        if (!r.ok) return
        const d = await r.json()
        if (cancelled || !d?.ok) return
        const temp = d.current?.temp
        const condition = d.forecast?.[0]?.text
        const humidity = d.current?.humidity
        if (typeof temp === "number" && typeof condition === "string" && condition && typeof humidity === "number") {
          setWeather({ temp, condition, humidity })
        }
      } catch {
        // 실패/CORS — 가짜 값 넣지 않고 숨김
      }
    })()
    return () => { cancelled = true }
  }, [region])

  // 공지 — supabase notices 실데이터 (내 시군 + 전체 대상, 내 시군 먼저)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let q = getSupabase()
          .from("notices")
          .select("id, title, created_at, is_pinned, region")
          .eq("is_published", true)
          .eq("plaza_id", plaza.id)
        // 내 시군 전용 + 전체(도 전역) 공지만 (다른 시군 제외)
        if (region) q = q.or(`region.eq.${region},region.is.null`)
        const { data, error } = await q
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(30)
        if (cancelled || error || !data) return
        const sorted = [...(data as any[])].sort((a, b) => {
          // 내 시군 전용 먼저, 전체는 뒤로
          const am = a.region && a.region === region ? 0 : 1
          const bm = b.region && b.region === region ? 0 : 1
          return am - bm
        }).slice(0, 5)
        setNotices(
          sorted.map((n: any) => ({
            id: String(n.id),
            title: n.title,
            date: n.created_at ? new Date(n.created_at).toLocaleDateString("ko-KR") : "",
            isNew: n.created_at ? Date.now() - new Date(n.created_at).getTime() < 14 * 24 * 60 * 60 * 1000 : false,
          })),
        )
      } catch {
        if (!cancelled) setNotices([])
      }
    })()
    return () => { cancelled = true }
  }, [plaza.id, region])

  const go = (p: string) => () => router.push(p as any)
  const comingSoon = () => Alert.alert("준비 중", "곧 열립니다. 조금만 기다려 주세요!")
  const search = () => { if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}` as any) }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* 상단 바 — 로고·앱이름 제거, 홍천군 칩 좌측 시작 */}
      <View style={styles.topbar}>
        <Pressable style={styles.locChip} onPress={() => setPlazaSelectorOpen(true)}>
          <Ionicons name="location-outline" size={14} color={GREEN_DARK} />
          <Text style={styles.locText} numberOfLines={1}>{region}</Text>
          <Ionicons name="chevron-down" size={14} color={GREEN_DARK} />
        </Pressable>
        <View style={styles.topRight}>
          {user ? (
            <Pressable style={styles.loginBtn} onPress={() => router.push("/(tabs)/mypage-profile" as any)}>
              <Ionicons name="person-outline" size={14} color="#ffffff" />
              <Text style={styles.loginBtnText}>{user.user_metadata?.nickname ?? user.user_metadata?.name ?? "마이"}님</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.loginBtn} onPress={() => router.push("/auth/login" as any)}>
              <Ionicons name="person-outline" size={14} color="#ffffff" />
              <Text style={styles.loginBtnText}>로그인</Text>
            </Pressable>
          )}
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} hitSlop={6} accessibilityLabel="전체 메뉴">
            <Ionicons name="menu" size={20} color={GREEN_DARK} />
            <Text style={styles.menuBtnText}>메뉴</Text>
          </Pressable>
        </View>
      </View>

      <PlazaSelector
        visible={plazaSelectorOpen}
        onClose={() => setPlazaSelectorOpen(false)}
        currentPlazaId={plaza.id}
        currentPlazaName={plaza.name}
      />
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} cityName={region} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <ImageBackground source={IMG.bg} style={{ width: "100%" }} imageStyle={{ opacity: 0.18 }}>
          {/* 히어로 */}
          <View style={styles.hero}>
            <Image source={IMG.logo} style={styles.heroLogo} contentFit="cover" />
            <Text style={styles.heroTitle}>{plaza.name}</Text>
            <Text style={styles.heroSub}>{plaza.name.replace(/\s*전원일기$/, "")} 농업인을 위한 따뜻한 마을 장터</Text>
          </View>

          {/* 날씨 + 농사 팁 (날씨에 따라 팁 변경) */}
          {weather && (
            <View style={styles.weatherRow}>
              <View style={styles.weatherChip}>
                <Ionicons name="sunny" size={15} color="#f59e0b" />
                <Text style={styles.weatherText}>{region}</Text>
                <Text style={[styles.weatherText, { color: GREEN, fontWeight: "800" }]}>{weather.temp}°</Text>
                <Text style={styles.weatherMuted}>{weather.condition}</Text>
                <Ionicons name="water-outline" size={13} color="#64748b" />
                <Text style={styles.weatherMuted}>{weather.humidity}%</Text>
              </View>
              <View style={styles.farmTipChip}>
                <Ionicons name="leaf" size={14} color={GREEN} />
                <Text style={styles.farmTipText}>
                  {weather.temp >= 30 ? "폭염 주의 — 한낮 작업 피하기"
                    : weather.temp >= 25 ? "하우스 환기 좋은 날"
                    : weather.temp >= 15 ? "밭일 하기 좋은 날씨"
                    : weather.temp >= 5 ? "아침 서리 주의"
                    : "동파 주의 — 수도관 보온"}
                </Text>
              </View>
            </View>
          )}

          {/* 검색 */}
          <View style={styles.search}>
            <Ionicons name="search" size={18} color="#94a3b8" />
            <TextInput
              value={q} onChangeText={setQ} onSubmitEditing={search} returnKeyType="search"
              placeholder="무엇을 도와드릴까요?" placeholderTextColor="#94a3b8" style={styles.searchInput}
            />
            <Pressable onPress={go("/search")} style={styles.micBtn}><Ionicons name="mic" size={16} color={GREEN} /></Pressable>
          </View>
          <Text style={styles.searchHint}>농기구, 로컬푸드, 지원금 등 원하시는 정보를 검색하세요</Text>

          {/* 농기구·로컬푸드·경매·일손 — 2열 사진 카드 */}
          <View style={styles.cardGrid}>
            <PhotoCard compact img={IMG.equipment} icon="construct" title="농기구/자재" subtitle="사고팔기" onPress={go("/secondhand")} />
            <PhotoCard compact img={IMG.food} icon="nutrition" title="강원 로컬푸드" subtitle="직거래 장터" light onPress={go("/local-food")} />
            <PhotoCard compact img={IMG.auction} icon="hammer" title="만물 경매장" subtitle="경매 / 즉시 거래" onPress={go("/auction")} />
            <PhotoCard compact img={IMG.workers} icon="people" title="일손 찾기" subtitle="품앗이 / 인력" onPress={go("/jobs")} />
          </View>

          {/* 소통과 나눔 */}
          <Text style={styles.sectionTitle}>소통과 나눔</Text>
          <View style={styles.row3}>
            <BoardTile icon="chatbubble-ellipses" label="마을 사랑방" onPress={go("/board/c/free")} />
            <BoardTile icon="camera" label="농업 일기" onPress={go("/board/c/daily")} />
            <BoardTile icon="gift" label="무료 나눔" onPress={go("/board/c/share")} />
          </View>

          {/* 정보와 혜택 */}
          <Text style={styles.sectionTitle}>정보와 혜택</Text>
          <View style={styles.row3}>
            <BoardTile icon="bulb" label="살림 정보" onPress={go("/board/c/life")} />
            <BoardTile icon="cash" label="정부 지원금" onPress={go("/board/c/subsidy")} />
            <BoardTile icon="help-circle" label="궁금해요" onPress={go("/board/c/qna")} />
          </View>

          {/* 퀵 액션 */}
          <View style={[styles.row3, { marginTop: 18 }]}>
            <Quick icon="help-circle" label={"자주 하는\n질문"} onPress={go("/support/faq")} />
            <Quick icon="search" label={"검색하기"} onPress={go("/search")} />
            <Quick icon="headset" label={"고객\n문의"} tint={BROWN} bg="#f3ede1" onPress={go("/support/support")} />
          </View>

        {/* 전원 소식통 배너 */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 16 }}>
          <Pressable onPress={go("/board")} style={styles.newsBanner}>
            <ImageBackground source={IMG.news} style={styles.newsBg} imageStyle={{ borderRadius: 24 }}>
              <LinearGradient colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.25)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newsOverlay}>
                <Text style={styles.newsKicker}>마을 커뮤니티</Text>
                <Text style={styles.newsTitle}>전원 소식통</Text>
                <View style={styles.newsBtn}><Text style={styles.newsBtnText}>보러가기 →</Text></View>
              </LinearGradient>
            </ImageBackground>
          </Pressable>
        </View>

        {/* 공지사항 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><Ionicons name="megaphone" size={16} color={GREEN} /></View>
            <Text style={styles.cardTitle}>{region} 공지사항</Text>
          </View>
          {notices.length === 0 ? (
            <Text style={styles.emptyNotice}>아직 등록된 공지가 없어요</Text>
          ) : (
            notices.map((n) => (
              <View key={n.id} style={styles.noticeRow}>
                <View style={[styles.tag, { backgroundColor: GREEN_DARK }]}>
                  <Text style={styles.tagText}>공지</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.noticeDate}>{n.date}</Text>
                </View>
                {n.isNew && <Text style={styles.newBadge}>NEW</Text>}
              </View>
            ))
          )}
          <Pressable onPress={go("/support/notice")}><Text style={styles.more}>더보기 →</Text></Pressable>
        </View>

        {/* 농사 꿀팁 */}
        <View style={[styles.card, { borderColor: "rgba(138,109,59,0.25)" }]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "rgba(138,109,59,0.12)" }]}><Ionicons name="leaf" size={16} color={BROWN} /></View>
            <Text style={styles.cardTitle}>농사 꿀팁</Text>
          </View>
          {DIARY.map((d, i) => (
            <View key={i} style={styles.diary}>
              <View style={styles.diaryHead}><Ionicons name={d.icon} size={15} color={BROWN} /><Text style={styles.diaryTitle}>{d.title}</Text></View>
              <Text style={styles.diaryDesc}>{d.desc}</Text>
            </View>
          ))}
        </View>
        </ImageBackground>
      </ScrollView>
    </SafeAreaView>
  )
}

function BoardTile({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.boardTile} onPress={onPress}>
      <Ionicons name={icon} size={26} color="#fff" />
      <Text style={styles.boardLabel}>{label}</Text>
    </Pressable>
  )
}

function Quick({ icon, label, onPress, tint, bg }: { icon: any; label: string; onPress: () => void; tint?: string; bg?: string }) {
  return (
    <Pressable style={styles.quick} onPress={onPress}>
      <View style={[styles.quickIcon, { backgroundColor: bg ?? "#dcfce7" }]}><Ionicons name={icon} size={24} color={tint ?? GREEN} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  )
}

function PhotoCard({ img, icon, title, subtitle, desc, light, compact, onPress }: { img: any; icon: any; title: string; subtitle: string; desc?: string; light?: boolean; compact?: boolean; onPress: () => void }) {
  if (compact) {
    return (
      <Pressable onPress={onPress} style={styles.photoCardCompact}>
        <ImageBackground source={img} style={styles.photoBgCompact} imageStyle={{ borderRadius: 16 }}>
          <LinearGradient
            colors={light ? ["rgba(255,255,255,0.35)", "rgba(0,0,0,0.55)"] : ["rgba(0,0,0,0.45)", "rgba(0,0,0,0.78)"]}
            style={styles.photoOverlayCompact}
          >
            <View style={styles.photoIconCompact}><Ionicons name={icon} size={24} color="#fff" /></View>
            <Text style={styles.photoTitleCompact}>{title}</Text>
            <Text style={styles.photoSubCompact}>{subtitle}</Text>
          </LinearGradient>
        </ImageBackground>
      </Pressable>
    )
  }
  return (
    <Pressable onPress={onPress} style={styles.photoCard}>
      <ImageBackground source={img} style={styles.photoBg} imageStyle={{ borderRadius: 24 }}>
        <LinearGradient
          colors={light ? ["rgba(255,255,255,0.4)", "rgba(0,0,0,0.45)"] : ["rgba(0,0,0,0.5)", "rgba(0,0,0,0.75)"]}
          style={styles.photoOverlay}
        >
          <View style={styles.photoIcon}><Ionicons name={icon} size={30} color="#fff" /></View>
          <Text style={styles.photoTitle}>{title}</Text>
          <Text style={styles.photoSub}>{subtitle}</Text>
          {desc ? <Text style={styles.photoDesc}>{desc}</Text> : null}
          <View style={styles.photoBtn}><Text style={styles.photoBtnText}>보러가기 →</Text></View>
        </LinearGradient>
      </ImageBackground>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f6f0" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#f7f6f0" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexShrink: 1 },
  brandLogo: { width: 28, height: 28, borderRadius: 14 },
  brand: { fontSize: 16, fontWeight: "900", color: GREEN_DARK, flexShrink: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  // 속초 칩 = 로그인 버튼: 동일 paddingVertical(9) 로 높이 일치 (고정 height 대신 — RN Web 호환)
  locChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#dcfce7", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, maxWidth: 120, flexShrink: 0 },
  locText: { fontSize: 13, fontWeight: "700", color: GREEN_DARK, flexShrink: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  loginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  loginBtnText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  menuBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "#bbf7d0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7.5 },
  menuBtnText: { fontSize: 13, fontWeight: "800", color: GREEN_DARK },

  hero: { alignItems: "center", paddingTop: 19, paddingBottom: 14 },
  heroLogo: { width: 110, height: 110, borderRadius: 55, marginBottom: 7, borderWidth: 4, borderColor: "rgba(22,101,52,0.3)" },
  heroTitle: { fontSize: 30, fontWeight: "900", color: GREEN, includeFontPadding: false },
  heroSub: { fontSize: 14, fontWeight: "700", color: BROWN, marginTop: 4 },
  farmTipChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  farmTipText: { fontSize: 13, fontWeight: "700", color: GREEN },

  weatherRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 8, paddingBottom: 14, paddingHorizontal: 16 },
  weatherChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  weatherText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  weatherMuted: { fontSize: 13, color: "#64748b" },

  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 2, borderColor: "rgba(21,128,61,0.3)" },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12, color: "#1e293b" },
  micBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(21,128,61,0.1)", alignItems: "center", justifyContent: "center" },
  searchHint: { textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 8 },

  sectionTitle: { textAlign: "center", fontSize: 16, fontWeight: "800", color: "#3f3a2e", marginTop: 20, marginBottom: 10 },
  row3: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  boardTile: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN_DARK, borderRadius: 16, paddingVertical: 18, minHeight: 92 },
  boardLabel: { fontSize: 14, fontWeight: "800", color: "#fff" },

  quick: { flex: 1, alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 16, paddingVertical: 14, borderWidth: 2, borderColor: "rgba(21,128,61,0.2)" },
  quickIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 13, fontWeight: "700", textAlign: "center", color: "#3f3a2e" },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, marginTop: 16 },
  photoCardCompact: { width: "47.5%", flexGrow: 1, borderRadius: 16, overflow: "hidden", minHeight: 150 },
  photoBgCompact: { width: "100%", minHeight: 150, justifyContent: "center" },
  photoOverlayCompact: { flex: 1, minHeight: 150, alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 16 },
  photoIconCompact: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(120,120,120,0.55)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  photoTitleCompact: { fontSize: 17, fontWeight: "900", color: "#fff", textAlign: "center", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 6 },
  photoSubCompact: { fontSize: 13, fontWeight: "700", color: "#f1f5f9", marginTop: 2, textAlign: "center" },

  photoCard: { borderRadius: 24, overflow: "hidden", minHeight: 280 },
  photoBg: { width: "100%", minHeight: 280, justifyContent: "center" },
  photoOverlay: { flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 24 },
  photoIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(120,120,120,0.55)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  photoTitle: { fontSize: 26, fontWeight: "900", color: "#fff", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 6 },
  photoSub: { fontSize: 20, fontWeight: "800", color: "#f1f5f9", marginTop: 2 },
  photoDesc: { fontSize: 15, color: "#e2e8f0", marginTop: 8 },
  photoBtn: { marginTop: 18, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 26, paddingVertical: 12 },
  photoBtnText: { fontSize: 16, fontWeight: "800", color: GREEN_DARK },

  newsBanner: { borderRadius: 24, overflow: "hidden" },
  newsBg: { width: "100%", height: 180, justifyContent: "center" },
  newsOverlay: { flex: 1, justifyContent: "center", paddingHorizontal: 28, borderRadius: 24 },
  newsKicker: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  newsTitle: { color: "#fff", fontSize: 30, fontWeight: "900", marginBottom: 12, textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 6 },
  newsBtn: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, alignSelf: "flex-start" },
  newsBtnText: { color: GREEN_DARK, fontWeight: "800", fontSize: 14 },

  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: "#fff", borderRadius: 20, padding: 18, borderWidth: 2, borderColor: "rgba(21,128,61,0.2)" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardHeadIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(21,128,61,0.12)", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#3f3a2e" },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  noticeTitle: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  noticeDate: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  newBadge: { color: "#dc2626", fontSize: 10, fontWeight: "800" },
  emptyNotice: { textAlign: "center", fontSize: 14, color: "#94a3b8", paddingVertical: 12 },
  more: { textAlign: "center", color: GREEN, fontWeight: "800", marginTop: 8, fontSize: 15 },

  diary: { backgroundColor: "rgba(138,109,59,0.06)", borderRadius: 12, padding: 13, marginTop: 8 },
  diaryHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  diaryTitle: { fontSize: 15, fontWeight: "800", color: BROWN },
  diaryDesc: { fontSize: 13, color: "#475569", marginTop: 4 },
})
