/**
 * HomeTab — 강원 전원일기 농업 허브 홈 (RN).
 * 레퍼런스(gwjeonwon.vercel.app) 와 동일 구성: 히어로(농부 로고)·날씨·검색,
 * 소통과나눔·정보와혜택, 퀵액션, 농기구·로컬푸드·경매·일손 사진 카드,
 * 전원 소식통 배너, 공지사항·오늘의 농사 일지.
 */

import { useState } from "react"
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, TextInput } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { Image, ImageBackground } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { useCurrentPlazaState } from "@/lib/plaza"

const GREEN = "#225a39"
const GREEN_DARK = "#1c4e31"
const BROWN = "#8a6d3b"

const IMG = {
  logo: require("../../assets/images/logo-farmer.jpg"),
  bg: require("../../assets/images/gangwon-bg.jpg"),
  equipment: require("../../assets/images/card-farm-equipment.jpg"),
  food: require("../../assets/images/card-local-food.jpg"),
  auction: require("../../assets/images/card-auction.jpg"),
  workers: require("../../assets/images/card-workers.jpg"),
  news: require("../../assets/images/banner-news.jpg"),
}

const REGION = "홍천군"
const NOTICES = [
  { type: "공지", title: "홍천군 농업인 수당 신청 안내", date: "2026.04.15", isNew: true },
  { type: "지원금", title: "홍천군 친환경농업 직접지불금 신청", date: "2026.04.14", isNew: true },
  { type: "교육", title: "홍천 스마트팜 교육 수강생 모집", date: "2026.04.12", isNew: false },
]
const DIARY = [
  { icon: "leaf" as const, title: "감자 심기 적기", desc: "이번 주가 감자 파종 최적기입니다. 토양 온도 10도 이상 확인하세요." },
  { icon: "calendar" as const, title: "4월 농사 일정", desc: "고추 모종 정식, 마늘 웃거름, 사과나무 적과 작업" },
  { icon: "book" as const, title: "이번 달 교육", desc: "4/20 스마트팜 기초반, 4/25 친환경 인증 교육" },
]

export default function HomeTab() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const [q, setQ] = useState("")
  const go = (p: string) => () => router.push(p as any)
  const comingSoon = () => Alert.alert("준비 중", "곧 열립니다. 조금만 기다려 주세요!")
  const search = () => { if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}` as any) }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* 상단 바 */}
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <Image source={IMG.logo} style={styles.brandLogo} contentFit="cover" />
          <Text style={styles.brand} numberOfLines={1}>{plaza.name}</Text>
        </View>
        <Pressable style={styles.locChip} onPress={comingSoon}>
          <Ionicons name="location-outline" size={14} color={GREEN_DARK} />
          <Text style={styles.locText}>{REGION}</Text>
          <Ionicons name="chevron-down" size={14} color={GREEN_DARK} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <ImageBackground source={IMG.bg} style={{ width: "100%" }} imageStyle={{ opacity: 0.18 }}>
          {/* 히어로 */}
          <View style={styles.hero}>
            <Image source={IMG.logo} style={styles.heroLogo} contentFit="cover" />
            <Text style={styles.heroTitle}>{plaza.name}</Text>
            <Text style={styles.heroSub}>강원도 농업인을 위한 따뜻한 마을 장터</Text>
          </View>

          {/* 날씨 */}
          <View style={styles.weatherRow}>
            <View style={styles.weatherChip}>
              <Ionicons name="sunny" size={15} color="#f59e0b" />
              <Text style={styles.weatherText}>{REGION}</Text>
              <Text style={[styles.weatherText, { color: GREEN, fontWeight: "800" }]}>28°</Text>
              <Text style={styles.weatherMuted}>맑음</Text>
              <Ionicons name="water-outline" size={13} color="#64748b" />
              <Text style={styles.weatherMuted}>45%</Text>
            </View>
            <View style={[styles.weatherChip, { backgroundColor: "#dcfce7" }]}>
              <Ionicons name="leaf" size={14} color={GREEN_DARK} />
              <Text style={[styles.weatherText, { color: GREEN_DARK }]}>하우스 환기 좋은 날</Text>
            </View>
          </View>

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

          {/* 소통과 나눔 */}
          <Text style={styles.sectionTitle}>소통과 나눔</Text>
          <View style={styles.row3}>
            <BoardTile icon="chatbubble-ellipses" label="자유게시판" onPress={go("/board/c/free")} />
            <BoardTile icon="camera" label="일상 공유" onPress={go("/board/c/daily")} />
            <BoardTile icon="gift" label="무료 나눔" onPress={go("/board/c/share")} />
          </View>

          {/* 정보와 혜택 */}
          <Text style={styles.sectionTitle}>정보와 혜택</Text>
          <View style={styles.row3}>
            <BoardTile icon="bulb" label="생활 정보" onPress={go("/board/c/life")} />
            <BoardTile icon="cash" label="정부 지원금" onPress={go("/board/c/subsidy")} />
            <BoardTile icon="help-circle" label="질문 답변" onPress={go("/board/c/qna")} />
          </View>

          {/* 퀵 액션 */}
          <View style={[styles.row3, { marginTop: 18 }]}>
            <Quick icon="camera" label={"사진으로\n올리기"} onPress={go("/secondhand/register")} />
            <Quick icon="mic" label={"음성으로\n검색"} onPress={go("/search")} />
            <Quick icon="call" label={"전화\n문의"} tint={BROWN} bg="#f3ede1" onPress={comingSoon} />
          </View>

        {/* 대형 사진 카드 4개 */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 16 }}>
          <PhotoCard img={IMG.equipment} icon="construct" title="농기구/자재" subtitle="사고팔기" desc="트랙터, 경운기, 하우스 자재 등" onPress={go("/secondhand")} />
          <PhotoCard img={IMG.food} icon="nutrition" title="강원 로컬푸드" subtitle="직거래 장터" desc="방금 수확한 신선한 농산물" light onPress={go("/local-food")} />
          <PhotoCard img={IMG.auction} icon="hammer" title="만물 경매장" subtitle="경매 / 즉시 거래" desc="농산물·농기구 경매 거래소" onPress={go("/auction")} />
          <PhotoCard img={IMG.workers} icon="people" title="일손 찾기" subtitle="품앗이 / 인력" desc="구인·구직, 품앗이 게시판" onPress={go("/jobs")} />

          {/* 전원 소식통 배너 */}
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
            <Text style={styles.cardTitle}>{REGION} 공지사항</Text>
          </View>
          {NOTICES.map((n, i) => (
            <View key={i} style={styles.noticeRow}>
              <View style={[styles.tag, { backgroundColor: n.type === "공지" ? GREEN_DARK : n.type === "지원금" ? "#b45309" : "#a16207" }]}>
                <Text style={styles.tagText}>{n.type}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle} numberOfLines={1}>{n.title}</Text>
                <Text style={styles.noticeDate}>{n.date}</Text>
              </View>
              {n.isNew && <Text style={styles.newBadge}>NEW</Text>}
            </View>
          ))}
          <Pressable onPress={go("/notice")}><Text style={styles.more}>더보기 →</Text></Pressable>
        </View>

        {/* 오늘의 농사 일지 */}
        <View style={[styles.card, { borderColor: "rgba(138,109,59,0.25)" }]}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "rgba(138,109,59,0.12)" }]}><Ionicons name="leaf" size={16} color={BROWN} /></View>
            <Text style={styles.cardTitle}>오늘의 농사 일지</Text>
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

function PhotoCard({ img, icon, title, subtitle, desc, light, onPress }: { img: any; icon: any; title: string; subtitle: string; desc: string; light?: boolean; onPress: () => void }) {
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
          <Text style={styles.photoDesc}>{desc}</Text>
          <View style={styles.photoBtn}><Text style={styles.photoBtnText}>보러가기 →</Text></View>
        </LinearGradient>
      </ImageBackground>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f6f0" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#f7f6f0" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  brandLogo: { width: 30, height: 30, borderRadius: 15 },
  brand: { fontSize: 18, fontWeight: "900", color: GREEN_DARK },
  locChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#dcfce7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  locText: { fontSize: 13, fontWeight: "700", color: GREEN_DARK },

  hero: { alignItems: "center", paddingTop: 16, paddingBottom: 14 },
  heroLogo: { width: 130, height: 130, borderRadius: 65, marginBottom: 12, borderWidth: 4, borderColor: "rgba(22,101,52,0.3)" },
  heroTitle: { fontSize: 30, fontWeight: "900", color: GREEN },
  heroSub: { fontSize: 14, fontWeight: "700", color: BROWN, marginTop: 4 },

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
  more: { textAlign: "center", color: GREEN, fontWeight: "800", marginTop: 8, fontSize: 15 },

  diary: { backgroundColor: "rgba(138,109,59,0.06)", borderRadius: 12, padding: 13, marginTop: 8 },
  diaryHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  diaryTitle: { fontSize: 15, fontWeight: "800", color: BROWN },
  diaryDesc: { fontSize: 13, color: "#475569", marginTop: 4 },
})
