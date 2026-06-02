/**
 * HomeTab — 전원일기 농업 허브 홈 (RN).
 * 웹 components/farm-home.tsx 와 동일 구조: 히어로/날씨/검색/퀵액션,
 * 소통과나눔·정보와혜택 타일, 농기구·로컬푸드·경매·일손·커뮤니티 대형카드, 고객센터.
 */

import { useState } from "react"
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, Linking,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { useCurrentPlazaState } from "@/lib/plaza"
import PlazaSelector from "@/components/PlazaSelector"

const GREEN = "#16a34a"
const GREEN_DARK = "#166534"

function cityOf(name: string) {
  return name.replace(/\s*전원일기$/, "").replace(/광장$/, "").trim() || "전원일기"
}

export default function HomeTab() {
  const router = useRouter()
  const plaza = useCurrentPlazaState()
  const city = cityOf(plaza.name)
  const [plazaOpen, setPlazaOpen] = useState(false)

  const go = (path: string) => () => router.push(path as any)
  const comingSoon = () => Alert.alert("준비 중", "곧 열립니다. 조금만 기다려 주세요!")

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* 상단 바 */}
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <Ionicons name="leaf" size={20} color={GREEN} />
          <Text style={styles.brand} numberOfLines={1}>{plaza.name}</Text>
        </View>
        <Pressable style={styles.locChip} onPress={() => setPlazaOpen(true)}>
          <Ionicons name="location-outline" size={14} color={GREEN_DARK} />
          <Text style={styles.locText}>동네 설정</Text>
          <Ionicons name="chevron-down" size={14} color={GREEN_DARK} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* 히어로 */}
        <View style={styles.hero}>
          <View style={styles.heroCircle}>
            <Ionicons name="leaf" size={44} color={GREEN_DARK} />
          </View>
          <Text style={styles.heroTitle}>{plaza.name}</Text>
          <Text style={styles.heroSub}>{city} 농업인을 위한 따뜻한 마을 장터</Text>
        </View>

        {/* 날씨 칩 */}
        <View style={styles.weatherRow}>
          <View style={styles.weatherChip}>
            <Ionicons name="sunny" size={15} color="#f59e0b" />
            <Text style={styles.weatherText}>{city}</Text>
          </View>
          <View style={[styles.weatherChip, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="leaf" size={15} color={GREEN_DARK} />
            <Text style={[styles.weatherText, { color: GREEN_DARK }]}>농사하기 좋은 날씨</Text>
          </View>
        </View>

        {/* 검색 */}
        <Pressable style={styles.search} onPress={go("/search")}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <Text style={styles.searchPh}>무엇을 도와드릴까요?</Text>
          <Ionicons name="mic-outline" size={18} color={GREEN} />
        </Pressable>
        <Text style={styles.searchHint}>농기구, 로컬푸드, 지원금 등 원하시는 정보를 검색하세요</Text>

        {/* 퀵 액션 */}
        <View style={styles.row3}>
          <Quick icon="camera" label={"사진으로\n올리기"} onPress={go("/secondhand/register")} />
          <Quick icon="mic" label={"음성으로\n검색"} onPress={go("/search")} />
          <Quick icon="call" label={"전화\n문의"} tint="#f43f5e" bg="#ffe4e6" onPress={go("/support")} />
        </View>

        {/* 소통과 나눔 */}
        <Text style={styles.sectionTitle}>소통과 나눔</Text>
        <View style={styles.row3}>
          <Tile icon="chatbubble-ellipses" label="자유게시판" onPress={go("/board")} />
          <Tile icon="camera" label="일상 공유" onPress={go("/board")} />
          <Tile icon="gift" label="무료 나눔" onPress={go("/sharing")} />
        </View>

        {/* 정보와 혜택 */}
        <Text style={styles.sectionTitle}>정보와 혜택</Text>
        <View style={styles.row3}>
          <Tile icon="bulb" label="생활 정보" onPress={go("/board")} />
          <Tile icon="cash" label="정부 지원금" onPress={go("/board")} />
          <Tile icon="help-circle" label="질문 답변" onPress={go("/support")} />
        </View>

        {/* 대형 기능 카드 */}
        <View style={{ paddingHorizontal: 16, marginTop: 8, gap: 14 }}>
          <Feature icon="construct" title="농기구/자재" subtitle="사고팔기" desc="트랙터, 경운기, 하우스 자재 등" colors={["#78350f", "#292524"]} onPress={go("/secondhand")} />
          <Feature icon="nutrition" title={`${city} 로컬푸드`} subtitle="직거래 장터" desc="방금 수확한 신선한 농산물" colors={["#166534", "#15803d"]} onPress={go("/local-food")} />
          <Feature icon="hammer" title="만물 경매장" subtitle="경매 / 즉시 거래" desc="농산물·농기구 경매 거래소" colors={["#1c1917", "#451a03"]} onPress={comingSoon} />
          <Feature icon="people" title="일손 찾기" subtitle="품앗이 / 인력" desc="구인·구직, 품앗이 게시판" colors={["#14532d", "#166534"]} onPress={go("/jobs")} />
          <Feature icon="chatbubbles" title="마을 커뮤니티" subtitle="전원 소식통" desc="이웃들의 동네 소식" colors={["#1e293b", "#14532d"]} onPress={go("/board")} />
        </View>

        {/* 오늘의 농사 일지 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="leaf" size={18} color={GREEN} />
            <Text style={styles.cardTitle}>오늘의 농사 일지</Text>
          </View>
          <Diary title="제철 농사 팁" desc="파종·수확 적기와 작물 관리 정보를 확인하세요." />
          <Diary title="이달의 농사 일정" desc="모종 정식, 웃거름, 적과 작업 등 일정 안내." />
          <Diary title="이번 달 교육" desc="스마트팜·친환경 인증 교육 일정." />
        </View>

        {/* 고객센터 */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0 }]}>고객센터</Text>
          <Pressable style={styles.callBtn} onPress={() => Linking.openURL("tel:").catch(() => {})}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callText}>바로 전화걸기</Text>
          </Pressable>
        </View>
      </ScrollView>

      <PlazaSelector
        visible={plazaOpen}
        onClose={() => setPlazaOpen(false)}
        currentPlazaId={plaza.id}
        currentPlazaName={plaza.name}
      />
    </SafeAreaView>
  )
}

function Quick({ icon, label, onPress, tint, bg }: { icon: any; label: string; onPress: () => void; tint?: string; bg?: string }) {
  return (
    <Pressable style={styles.quick} onPress={onPress}>
      <View style={[styles.quickIcon, { backgroundColor: bg ?? "#dcfce7" }]}>
        <Ionicons name={icon} size={22} color={tint ?? GREEN} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  )
}

function Tile({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <Ionicons name={icon} size={26} color="#fff" />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  )
}

function Feature({ icon, title, subtitle, desc, colors, onPress }: { icon: any; title: string; subtitle: string; desc: string; colors: [string, string]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.feature}>
        <View style={styles.featureIcon}><Ionicons name={icon} size={30} color="#fff" /></View>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{subtitle}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
        <View style={styles.featureBtn}>
          <Text style={styles.featureBtnText}>보러가기</Text>
          <Ionicons name="chevron-forward" size={15} color={GREEN_DARK} />
        </View>
      </LinearGradient>
    </Pressable>
  )
}

function Diary({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={styles.diary}>
      <Text style={styles.diaryTitle}>🌱 {title}</Text>
      <Text style={styles.diaryDesc}>{desc}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0fdf4" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#f0fdf4" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  brand: { fontSize: 18, fontWeight: "800", color: GREEN_DARK },
  locChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#dcfce7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  locText: { fontSize: 13, fontWeight: "700", color: GREEN_DARK },

  hero: { alignItems: "center", paddingTop: 12, paddingBottom: 12 },
  heroCircle: { width: 104, height: 104, borderRadius: 52, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(22,163,74,0.2)", marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: GREEN_DARK },
  heroSub: { fontSize: 13, fontWeight: "700", color: "#15803d", marginTop: 4 },

  weatherRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 8, paddingBottom: 12 },
  weatherChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  weatherText: { fontSize: 13, fontWeight: "600", color: "#334155" },

  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: "#e2e8f0" },
  searchPh: { flex: 1, fontSize: 14, color: "#94a3b8" },
  searchHint: { textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 8 },

  row3: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 12 },
  quick: { flex: 1, alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 14 },
  quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 12, fontWeight: "600", textAlign: "center", color: "#334155" },

  sectionTitle: { textAlign: "center", fontSize: 15, fontWeight: "800", color: "#334155", marginTop: 20, marginBottom: 4 },
  tile: { flex: 1, alignItems: "center", gap: 8, backgroundColor: GREEN_DARK, borderRadius: 16, paddingVertical: 20 },
  tileLabel: { fontSize: 14, fontWeight: "800", color: "#fff" },

  feature: { borderRadius: 24, padding: 22, alignItems: "center" },
  featureIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  featureTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  featureSub: { fontSize: 15, fontWeight: "700", color: "#fff", marginTop: 2 },
  featureDesc: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  featureBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, marginTop: 14 },
  featureBtnText: { fontSize: 14, fontWeight: "800", color: GREEN_DARK },

  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: "#fff", borderRadius: 20, padding: 18 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1e293b" },
  diary: { backgroundColor: "#f0fdf4", borderRadius: 12, padding: 12, marginTop: 8 },
  diaryTitle: { fontSize: 14, fontWeight: "700", color: "#166534" },
  diaryDesc: { fontSize: 12, color: "#64748b", marginTop: 3 },

  callBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN_DARK, borderRadius: 14, paddingVertical: 15 },
  callText: { fontSize: 15, fontWeight: "800", color: "#fff" },
})
