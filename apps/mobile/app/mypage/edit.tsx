/**
 * 프로필 정보 편집 — 광장 web /mypage/edit 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더: ← 프로필 정보 편집
 *   - 큰 원형 아바타 (w-28 h-28 = 112px) + 우하단 카메라 버튼
 *   - 폼 필드:
 *     - 닉네임 (max 10자)
 *     - 연락처 (010-...)
 *     - 자기소개 (textarea, 5 rows)
 *     - 내 지역 / 서비스 지역 — 강원특별자치도 춘천시 (고정) + 동 선택
 *     - 영업시간 — business 전용
 *     - 전문분야 — agent/interior/moving/cleaning/repair/producer 전용
 *     - 추가 서비스 지역 — 서비스 제공자 전용
 *     - 웹사이트
 *     - 카카오톡 ID
 *   - 하단 sticky 저장 버튼
 */

import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"
import { useCurrentPlaza } from "@/lib/plaza"
import { listPlazaRegions, listChildDongs, type Region } from "@/lib/region-utils"

const SERVICE_TYPES = ["agent", "interior", "moving", "cleaning", "repair"]

// 광장별 시/도 prefix — 가입 지역 시/군 앞에 붙는 행정구역 상위.
const PLAZA_PROVINCE: Record<string, string> = {
  chuncheon: "강원특별자치도",
  gangneung: "강원특별자치도",
}

// 시/군 fallback dong 목록 (regions level=2 미시드 시 사용).
const CHUNCHEON_DONGS = [
  "신북읍", "동내면", "동산면", "동면", "사북면", "서면", "남면", "남산면",
  "북산면", "신사우동", "교동", "조운동", "강남동", "근화동", "후평1동",
  "후평2동", "후평3동", "효자1동", "효자2동", "효자3동", "석사동",
  "퇴계동", "온의동", "약사명동", "소양동",
]

interface Profile {
  id: string
  nickname: string | null
  phone: string | null
  avatar_url: string | null
  location: string | null
  bio: string | null
  account_type: string | null
  business_hours: string | null
  specialties: string[] | null
  service_areas: string[] | null
  website: string | null
  kakao_id: string | null
}

export default function EditProfileScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { user } = useAuth()
  const plaza = useCurrentPlaza()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const loadedRef = useRef(false)
  useUnsavedChangesGuard(formDirty)
  const [uploading, setUploading] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dongPickerOpen, setDongPickerOpen] = useState(false)
  const [cityPickerOpen, setCityPickerOpen] = useState(false)

  // 가입 지역(시/군) — 광장의 level=1 regions
  const [cities, setCities] = useState<Region[]>([])
  const [selectedCity, setSelectedCity] = useState<Region | null>(null)
  // 선택한 시/군의 동/면(level=2) — DB 시드 있으면 사용, 없으면 fallback
  const [dongs, setDongs] = useState<string[]>([])

  const [form, setForm] = useState({
    nickname: "",
    phone: "",
    intro: "",
    avatar_url: "",
    business_hours: "",
    specialties: "",
    service_areas: "",
    website: "",
    kakao_id: "",
  })
  const [selectedDong, setSelectedDong] = useState("")
  const isServiceProvider =
    profile?.account_type ? SERVICE_TYPES.includes(profile.account_type) : false

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [form, selectedDong])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        // 광장 통합: global profiles에서 모든 필드, plaza_profiles에서 account_type만
        const [profRes, ppRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          plaza
            ? (supabase as any)
                .from("plaza_profiles")
                .select("account_type")
                .eq("user_id", user.id)
                .eq("plaza_id", plaza)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled || !profRes.data) return
        const p = {
          ...profRes.data,
          account_type: ppRes?.data?.account_type ?? "user",
        } as Profile
        setProfile(p)
        // location 파싱: "강원특별자치도 춘천시 효자동" → city="춘천시", dong="효자동"
        // 또는 "강원특별자치도 화천군 사내면" → city="화천군", dong="사내면"
        if (p.location) {
          const parts = p.location.split(" ").filter(Boolean)
          // parts[1] 이 보통 시/군, parts[2..] 가 동/면
          if (parts.length >= 3) setSelectedDong(parts.slice(2).join(" "))
        }
        setForm({
          nickname: p.nickname || "",
          phone: p.phone || "",
          intro: p.bio || "",
          avatar_url: p.avatar_url || "",
          business_hours: p.business_hours || "",
          specialties: (p.specialties || []).join(", "),
          service_areas: (p.service_areas || []).join(", "),
          website: p.website || "",
          kakao_id: p.kakao_id || "",
        })
      } finally {
        if (!cancelled) { setLoading(false); loadedRef.current = true }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // 시/군 목록 로드 + 프로필 location 으로부터 selectedCity 자동 매칭
  useEffect(() => {
    if (!plaza) return
    let alive = true
    ;(async () => {
      const list = await listPlazaRegions(plaza)
      if (!alive) return
      setCities(list)
      // location 에서 시/군 이름 매칭 (긴 이름 우선)
      const loc = profile?.location || ""
      if (loc) {
        const sorted = [...list].sort((a, b) => b.name.length - a.name.length)
        const hit = sorted.find((r) => loc.includes(r.name))
        if (hit) setSelectedCity(hit)
      }
    })()
    return () => {
      alive = false
    }
  }, [plaza, profile?.location])

  // 선택한 시/군의 동/면 목록 로드 — DB 시드 없으면 chuncheon 만 fallback 제공
  useEffect(() => {
    if (!selectedCity) {
      setDongs([])
      return
    }
    let alive = true
    ;(async () => {
      const children = await listChildDongs(selectedCity.id)
      if (!alive) return
      if (children.length > 0) {
        setDongs(children.map((c) => c.name))
      } else if (selectedCity.name === "춘천시") {
        setDongs(CHUNCHEON_DONGS)
      } else {
        setDongs([])
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedCity])

  // 시/군 변경 시 — 현재 dong 이 해당 시/군 목록에 없으면 reset
  useEffect(() => {
    if (selectedDong && dongs.length > 0 && !dongs.includes(selectedDong)) {
      setSelectedDong("")
    }
  }, [dongs, selectedDong])

  async function handleAvatarUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다")
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (res.canceled || !res.assets?.[0]) return
    const asset = res.assets[0]

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", {
        uri: asset.uri,
        name: "avatar.jpg",
        type: "image/jpeg",
      } as any)
      fd.append("folder", "avatar")
      const upRes = await gwangjangFetch("/api/upload", {
        method: "POST",
        body: fd,
      })
      if (!upRes.ok) throw new Error("업로드 실패")
      const { url } = await upRes.json()
      setForm((f) => ({ ...f, avatar_url: url }))
    } catch (e: any) {
      Alert.alert("업로드 실패", e?.message || "다시 시도해주세요")
    } finally {
      setUploading(false)
    }
  }

  function splitTags(s: string): string[] | null {
    const arr = s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
    return arr.length > 0 ? arr : null
  }

  async function handleSave() {
    if (!profile) return
    if (!form.nickname.trim()) {
      Alert.alert("입력 필요", "닉네임을 입력해주세요")
      return
    }
    if (form.nickname.length > 10) {
      Alert.alert("길이 초과", "닉네임은 최대 10자")
      return
    }
    if (isServiceProvider && !selectedDong) {
      Alert.alert("입력 필요", "서비스 지역(동)을 선택해주세요")
      return
    }
    // 전화번호 형식 검증 — 입력된 경우에만 (숫자 9~11자리)
    if (form.phone.trim()) {
      const phoneDigits = form.phone.replace(/[^0-9]/g, "")
      if (phoneDigits.length < 9 || phoneDigits.length > 11) {
        Alert.alert("전화번호 확인", "전화번호를 올바르게 입력해주세요 (숫자 9~11자리)")
        return
      }
    }
    // 웹사이트 형식 검증 — 입력된 경우에만 (도메인 형태)
    if (form.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+.*$/i.test(form.website.trim())) {
      Alert.alert("웹사이트 확인", "올바른 웹사이트 주소를 입력해주세요 (예: https://example.com)")
      return
    }

    setSaving(true)
    try {
      const supabase = getSupabase()
      const province = (plaza && PLAZA_PROVINCE[plaza]) || ""
      // city 가 있으면 "<province> <city>[ <dong>]" 형태로 저장
      const location = selectedCity
        ? `${province ? province + " " : ""}${selectedCity.name}${selectedDong ? " " + selectedDong : ""}`
        : null
      // 광장별 격리(🅲): 광장에 종속된 필드는 plaza_profiles 에 저장.
      // 공통(nickname/avatar_url/bio/phone/...) 은 plaza_profiles 와 profiles 양쪽에 저장
      // (호환성 — profile fallback 경로가 끊기지 않도록).
      const payload = {
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || null,
        location,
        bio: form.intro.trim() || null,
        avatar_url: form.avatar_url || null,
        business_hours: form.business_hours.trim() || null,
        specialties: splitTags(form.specialties),
        service_areas: splitTags(form.service_areas),
        website: form.website.trim() || null,
        kakao_id: form.kakao_id.trim() || null,
        region_id: selectedCity?.id ?? null,
      }
      // 광장 통합: profiles만 업데이트 (account_type은 plaza_profiles에서 관리)
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          nickname: payload.nickname,
          phone: payload.phone,
          location: payload.location,
          bio: payload.bio,
          avatar_url: payload.avatar_url,
          business_hours: payload.business_hours,
          specialties: payload.specialties,
          service_areas: payload.service_areas,
          website: payload.website,
          kakao_id: payload.kakao_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)
      if (profErr) throw profErr
      // 가입 지역 변경 시 list 화면 region AsyncStorage 무효화
      // → 다음 진입 시 가입지역 디폴트로 다시 매칭됨
      if (plaza) {
        try {
          const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default
          await AsyncStorage.removeItem(`region.selected.v1:${plaza}`)
          // 마이페이지 캐시도 무효화 — 저장한 변경사항이 즉시 보이도록
          if (profile?.id) {
            await AsyncStorage.removeItem(`mypage:cache:v2:${profile.id}:${plaza}`)
          }
        } catch {
          /* noop */
        }
      }
      setFormDirty(false)
      router.back()
    } catch (e: any) {
      Alert.alert("저장 실패", e?.message || "다시 시도해주세요")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  const showBusinessHours = profile?.account_type === "business"
  const showSpecialties = isServiceProvider || profile?.account_type === "producer"
  const showServiceAreas = isServiceProvider

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>프로필 정보 편집</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <Pressable onPress={handleAvatarUpload} disabled={uploading} style={styles.avatarWrap}>
              <View style={styles.avatarBig}>
                {form.avatar_url ? (
                  <Image source={{ uri: form.avatar_url }} cachePolicy="memory-disk" style={styles.avatarBigImg} />
                ) : (
                  <Text style={styles.avatarBigLetter}>
                    {(form.nickname?.[0] ?? "?").toUpperCase()}
                  </Text>
                )}
                {uploading && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#ffffff" />
                  </View>
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={20} color={lightColors.background} />
              </View>
            </Pressable>
          </View>

          <Field label="닉네임" helper="한글, 영어, 숫자만 사용할 수 있어요. (최대 10자)">
            <TextInput
              style={styles.input}
              value={form.nickname}
              onChangeText={(v) => setForm((f) => ({ ...f, nickname: v }))}
              placeholder="닉네임을 입력하세요"
              placeholderTextColor={lightColors.ink500}
              maxLength={10}
            />
          </Field>

          <Field label="연락처">
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder="010-0000-0000"
              placeholderTextColor={lightColors.ink500}
              keyboardType="phone-pad"
            />
          </Field>

          <Field label="자기소개" helper="간단한 자기소개를 작성해보세요.">
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.intro}
              onChangeText={(v) => setForm((f) => ({ ...f, intro: v }))}
              placeholder="자기소개를 입력해주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </Field>

          <Field
            label="가입 지역 (시/군)"
            icon="map-outline"
            helper="가입 지역은 부동산·중고·게시판 등 지역별 글의 기본 필터로 사용돼요."
          >
            <Pressable onPress={() => setCityPickerOpen(true)} style={styles.dongSelect}>
              <Text
                style={[
                  styles.dongSelectText,
                  !selectedCity && { color: lightColors.ink500 },
                ]}
              >
                {selectedCity?.name || "시/군 선택"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={lightColors.ink500} />
            </Pressable>
          </Field>

          <Field
            label={isServiceProvider ? "서비스 지역" : "내 지역"}
            icon="location-outline"
            helper={
              isServiceProvider
                ? "서비스를 제공하는 동을 선택해주세요. 선택한 지역의 고객들에게 우선 노출됩니다."
                : "내 프로필에 표시될 동네를 선택해주세요. (선택)"
            }
          >
            <View style={styles.locationRow}>
              <View style={styles.locationFixed}>
                <Text style={styles.locationFixedText}>
                  {(plaza && PLAZA_PROVINCE[plaza]) || ""} {selectedCity?.name || ""}
                </Text>
              </View>
              <Pressable
                onPress={() => selectedCity && setDongPickerOpen(true)}
                style={[styles.dongSelect, !selectedCity && { opacity: 0.5 }]}
                disabled={!selectedCity}
              >
                <Text
                  style={[
                    styles.dongSelectText,
                    !selectedDong && { color: lightColors.ink500 },
                  ]}
                >
                  {selectedDong || (selectedCity ? "동/면 선택" : "시/군 먼저 선택")}
                </Text>
                <Ionicons name="chevron-down" size={16} color={lightColors.ink500} />
              </Pressable>
            </View>
            {selectedCity ? (
              <View style={styles.locationPreview}>
                <Text style={styles.locationPreviewText}>
                  <Text style={{ fontWeight: "700" }}>선택한 지역: </Text>
                  {(plaza && PLAZA_PROVINCE[plaza]) || ""} {selectedCity.name}
                  {selectedDong ? " " + selectedDong : ""}
                </Text>
              </View>
            ) : null}
            <Text style={styles.expertHint}>
              *{" "}
              <Text style={{ fontWeight: "700" }}>공인중개사 / 홈즈(인테리어·수리·이사·청소)</Text>
              {" "}전문가 분들은 이 지역을 기준으로 다른 사용자의 초대하기 후보에 노출돼요.
            </Text>
          </Field>

          {showBusinessHours && (
            <Field label="영업시간" icon="time-outline">
              <TextInput
                style={styles.input}
                value={form.business_hours}
                onChangeText={(v) => setForm((f) => ({ ...f, business_hours: v }))}
                placeholder="예: 평일 09:00-21:00 · 주말 10:00-22:00"
                placeholderTextColor={lightColors.ink500}
              />
            </Field>
          )}

          {showSpecialties && (
            <Field
              label="전문분야"
              icon="pricetag-outline"
              helper="최대 5~6개를 추천드려요. 콤마로 구분합니다."
            >
              <TextInput
                style={styles.input}
                value={form.specialties}
                onChangeText={(v) => setForm((f) => ({ ...f, specialties: v }))}
                placeholder="예: 원룸, 투룸, 전세 (콤마로 구분)"
                placeholderTextColor={lightColors.ink500}
              />
            </Field>
          )}

          {showServiceAreas && (
            <Field
              label="추가 서비스 지역"
              icon="location-outline"
              helper="대표 지역 외 출장/영업 가능한 동을 콤마로 추가할 수 있어요."
            >
              <TextInput
                style={styles.input}
                value={form.service_areas}
                onChangeText={(v) => setForm((f) => ({ ...f, service_areas: v }))}
                placeholder="예: 효자동, 석사동, 후평동"
                placeholderTextColor={lightColors.ink500}
              />
            </Field>
          )}

          <Field label="웹사이트" icon="globe-outline">
            <TextInput
              style={styles.input}
              value={form.website}
              onChangeText={(v) => setForm((f) => ({ ...f, website: v }))}
              placeholder="https://"
              placeholderTextColor={lightColors.ink500}
              keyboardType="url"
              autoCapitalize="none"
            />
          </Field>

          <Field label="카카오톡 ID" icon="chatbubble-outline">
            <TextInput
              style={styles.input}
              value={form.kakao_id}
              onChangeText={(v) => setForm((f) => ({ ...f, kakao_id: v }))}
              placeholder="오픈채팅 링크 또는 ID"
              placeholderTextColor={lightColors.ink500}
              autoCapitalize="none"
            />
          </Field>
        </ScrollView>

        <View style={styles.saveBar}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              (saving || pressed) && { opacity: 0.85 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveText}>저장</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={dongPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDongPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDongPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>동 선택</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {dongs.length === 0 ? (
                <Text style={{ padding: 16, color: lightColors.ink500, textAlign: "center" }}>
                  등록된 동/면이 없어요
                </Text>
              ) : null}
              {dongs.map((d) => {
                const active = d === selectedDong
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setSelectedDong(d)
                      setDongPickerOpen(false)
                    }}
                    style={({ pressed }) => [
                      styles.dongItem,
                      active && { backgroundColor: "rgba(59,130,246,0.08)" },
                      pressed && !active && { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dongItemText,
                        active && { color: lightColors.primary, fontWeight: "700" },
                      ]}
                    >
                      {d}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={lightColors.primary} />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={cityPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCityPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCityPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>시/군 선택</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {cities.length === 0 ? (
                <Text style={{ padding: 16, color: lightColors.ink500, textAlign: "center" }}>
                  등록된 시/군이 없어요
                </Text>
              ) : null}
              {cities.map((c) => {
                const active = c.id === selectedCity?.id
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setSelectedCity(c)
                      setCityPickerOpen(false)
                    }}
                    style={({ pressed }) => [
                      styles.dongItem,
                      active && { backgroundColor: "rgba(59,130,246,0.08)" },
                      pressed && !active && { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dongItemText,
                        active && { color: lightColors.primary, fontWeight: "700" },
                      ]}
                    >
                      {c.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={lightColors.primary} />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function Field({
  label,
  icon,
  helper,
  children,
}: {
  label: string
  icon?: any
  helper?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: spacing[4] }}>
      <View style={styles.labelRow}>
        {icon && <Ionicons name={icon} size={14} color={lightColors.ink500} />}
        <Text style={styles.label}>{label}</Text>
      </View>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
}

const AVATAR_SIZE = 112

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },
  avatarSection: { alignItems: "center", paddingVertical: spacing[6] },
  avatarWrap: { position: "relative" },
  avatarBig: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarBigImg: { width: "100%", height: "100%" },
  avatarBigLetter: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.ink500,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink900,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  expertHint: {
    marginTop: 8,
    fontSize: 11,
    color: colors.ink500,
    lineHeight: 16,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink900 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.ink900,
  },
  textarea: { minHeight: 110, paddingTop: 12 },
  helper: { fontSize: 11, color: colors.ink500, marginTop: 6 },
  locationRow: { flexDirection: "row", gap: 8 },
  locationFixed: {
    paddingHorizontal: spacing[3],
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(241,245,249,0.6)",
  },
  locationFixedText: { fontSize: fontSize.sm, color: colors.ink500 },
  dongSelect: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  dongSelectText: { fontSize: fontSize.sm, color: colors.ink900 },
  locationPreview: {
    marginTop: 8,
    backgroundColor: "rgba(241,245,249,0.4)",
    borderRadius: radius.md,
    padding: spacing[3],
  },
  locationPreviewText: { fontSize: fontSize.sm, color: colors.ink900 },
  saveBar: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveBtn: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontSize: fontSize.md, fontWeight: "700", color: "#ffffff" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing[4],
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dongItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dongItemText: { fontSize: fontSize.sm, color: colors.ink900 },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
