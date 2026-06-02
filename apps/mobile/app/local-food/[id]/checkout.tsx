/**
 * 로컬푸드 결제 — 광장 web /local-food/[id]/checkout 1:1 미러 (RN).
 *
 * 정독 매핑:
 *   - 헤더 (← 결제하기)
 *   - 상품 카드 (썸네일 + 제목 + 단위/단가)
 *   - 수량 stepper
 *   - 받는 사람·연락처·주소 (profile.phone/full_name 자동)
 *   - 메모 프리셋
 *   - 포인트 사용
 *   - 결제 합계 (수량×단가 + 수수료 - 포인트)
 *   - 결제 버튼 (createLocalFoodOrder + payLocalFoodOrder mock)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  getLocalFoodPost,
  createLocalFoodOrder,
  payLocalFoodOrder,
  type LocalFoodPost,
} from "@gwangjang/features/local-food"
import { useAuth } from "@/lib/auth-context"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { AddressSearch } from "@/components/AddressSearch"
import { formatPhoneInput } from "@gwangjang/features/auth"
import { CheckoutConsentSection } from "@/components/legal/CheckoutConsentSection"

const GREEN = "#16a34a"

const MEMO_PRESETS = [
  "선택 안 함",
  "문 앞에 두고 가주세요",
  "경비실에 맡겨주세요",
  "택배함에 넣어주세요",
  "배송 전 미리 연락주세요",
  "직접 입력",
]

export default function LocalFoodCheckoutScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [post, setPost] = useState<LocalFoodPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)

  const [quantity, setQuantity] = useState(1)
  const [recipientName, setRecipientName] = useState("")
  const [phone, setPhone] = useState("")
  const [postcode, setPostcode] = useState("")
  const [addr1, setAddr1] = useState("")
  const [addr2, setAddr2] = useState("")
  const [memoPreset, setMemoPreset] = useState("선택 안 함")
  const [memoCustom, setMemoCustom] = useState("")
  const [availablePoints, setAvailablePoints] = useState(0)
  const [maxPct, setMaxPct] = useState(30)
  const [pointsInput, setPointsInput] = useState("")

  useEffect(() => {
    if (!id) return
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      router.back()
      return
    }
    const supabase = getSupabase()
    getLocalFoodPost(supabase, id, DEFAULT_PLAZA, user.id).then(({ post }) => {
      if (!post) {
        Alert.alert("글을 찾을 수 없습니다")
        router.back()
        return
      }
      setPost(post)
      // 🅲 profile 자동 채움 — 현재 광장 plaza_profiles 우선 (phone)
      ;(async () => {
        const [profRes, ppRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("id", user.id)
            .maybeSingle(),
          DEFAULT_PLAZA
            ? supabase
                .from("plaza_profiles")
                .select("phone")
                .eq("user_id", user.id)
                .eq("plaza_id", DEFAULT_PLAZA)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ])
        const meta = (user as any)?.user_metadata || {}
        const d: any = profRes?.data || {}
        const pp: any = (ppRes as any)?.data || {}
        const name = meta.full_name || d.full_name || ""
        const ph = meta.phone || pp.phone || d.phone || ""
        if (name) setRecipientName(name)
        if (ph) setPhone(formatPhoneInput(ph))
      })()
      setLoading(false)
    }).catch(() => {
      Alert.alert("오류", "데이터를 불러올 수 없습니다")
      setLoading(false)
      router.back()
    })
    // 포인트 잔액
    gwangjangFetch("/api/points/balance")
      .then((r) => r.json())
      .then((d) => {
        if (d?.available) setAvailablePoints(d.available)
      })
      .catch(() => {})
    // 포인트 사용 정책
    supabase
      .from("point_redemption_settings")
      .select("max_redemption_pct")
      .eq("category", "local_food")
      .maybeSingle()
      .then(({ data }) => {
        const pct = (data as any)?.max_redemption_pct
        if (pct) setMaxPct(pct)
      })
  }, [id, user, router])

  const subtotal = post ? post.price * quantity : 0
  const isFreeShipping = !!(post as any)?.free_shipping || !((post as any)?.shipping_fee)
  const shippingFee = isFreeShipping ? 0 : ((post as any)?.shipping_fee as number) || 0
  const maxPointsByPct = Math.floor((subtotal * maxPct) / 100)
  const maxPoints = Math.max(0, Math.min(availablePoints, maxPointsByPct))
  const pointsApplied = Math.min(
    Math.max(0, Math.floor(Number(pointsInput) || 0)),
    maxPoints,
  )
  const total = Math.max(0, subtotal + shippingFee - pointsApplied)

  const memo = memoPreset === "직접 입력" ? memoCustom : memoPreset === "선택 안 함" ? "" : memoPreset

  async function handleSubmit() {
    if (submitting || !id || !post) return
    if (!recipientName.trim() || !phone.trim() || !addr1.trim()) {
      Alert.alert("입력 필요", "받는 사람·연락처·주소를 모두 입력해주세요")
      return
    }
    if (quantity < 1) {
      Alert.alert("수량 오류", "수량은 1 이상이어야 합니다")
      return
    }
    setSubmitting(true)
    try {
      const r = await createLocalFoodOrder(
        (u, init) => gwangjangFetch(u, init as any),
        {
          items: [{ local_food_id: id, quantity }],
          delivery_addr: {
            recipient_name: recipientName.trim(),
            phone: phone.trim(),
            postcode: postcode.trim() || undefined,
            addr1: addr1.trim(),
            addr2: addr2.trim() || undefined,
          },
          buyer_memo: memo.trim() || null,
          points_used: pointsApplied,
        },
      )
      if (!r.ok || !r.orderId) {
        Alert.alert("주문 실패", r.error ?? "")
        return
      }
      const pay = await payLocalFoodOrder(
        (u, init) => gwangjangFetch(u, init as any),
        r.orderId,
      )
      if (!pay.ok) {
        Alert.alert("결제 실패", pay.error ?? "")
        return
      }
      Alert.alert("결제 완료", "주문이 완료되었습니다", [
        { text: "확인", onPress: () => router.replace("/(tabs)/mypage" as any) },
      ])
    } catch (e: any) {
      // 네트워크/예외로 throw 된 경우 — 무음 실패 방지 + 중복결제 방지 안내
      console.warn("[local-food] checkout failed", e)
      Alert.alert(
        "결제 오류",
        "결제 처리 중 오류가 발생했습니다. 중복 결제를 막기 위해 마이페이지 > 주문 내역을 먼저 확인해 주세요.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>결제하기</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Product card */}
          <View style={styles.productCard}>
            {!!post.images?.[0] && <Image source={{ uri: post.images[0] }} cachePolicy="memory-disk" style={styles.productImg} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.productName} numberOfLines={2}>{post.title}</Text>
              <Text style={styles.productPrice}>
                {post.price.toLocaleString()}원
                {!!post.unit && <Text style={styles.productUnit}> /{post.unit}</Text>}
              </Text>
            </View>
          </View>

          <Field label="수량">
            <View style={styles.stepperRow}>
              <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={styles.stepperBtn}>
                <Ionicons name="remove" size={18} color={lightColors.ink900} />
              </Pressable>
              <Text style={styles.stepperVal}>{quantity}</Text>
              <Pressable onPress={() => setQuantity((q) => q + 1)} style={styles.stepperBtn}>
                <Ionicons name="add" size={18} color={lightColors.ink900} />
              </Pressable>
            </View>
          </Field>

          <Field label="받는 사람 *">
            <TextInput value={recipientName} onChangeText={setRecipientName} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="연락처 *">
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(formatPhoneInput(v))}
              keyboardType="phone-pad"
              placeholder="010-1234-5678"
              style={styles.input}
              placeholderTextColor={lightColors.ink500}
            />
          </Field>

          <Field label="주소 *">
            <AddressSearch
              value={addr1}
              onChange={(_full, data) => {
                if (!data) return
                const base = data.jibunAddress || data.autoJibunAddress || data.roadAddress || data.address
                const display = data.buildingName ? `${base} (${data.buildingName})` : base
                setAddr1(display)
                if (data.zonecode) setPostcode(data.zonecode)
              }}
              placeholder="주소 검색하기"
            />
          </Field>

          <Field label="우편번호">
            <TextInput
              value={postcode}
              editable={false}
              placeholder="주소 검색 시 자동 입력"
              style={[styles.input, { backgroundColor: lightColors.muted }]}
              placeholderTextColor={lightColors.ink500}
            />
          </Field>

          <Field label="상세 주소">
            <TextInput value={addr2} onChangeText={setAddr2} placeholder="동/호수 등" placeholderTextColor={lightColors.ink500} style={styles.input} />
          </Field>

          <Field label="배송 메모">
            <View style={styles.chipWrap}>
              {MEMO_PRESETS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setMemoPreset(p)}
                  style={[styles.chip, memoPreset === p ? { backgroundColor: GREEN } : { backgroundColor: lightColors.muted }]}
                >
                  <Text style={[styles.chipText, { color: memoPreset === p ? "#ffffff" : lightColors.ink900 }]}>{p}</Text>
                </Pressable>
              ))}
            </View>
            {memoPreset === "직접 입력" && (
              <TextInput value={memoCustom} onChangeText={setMemoCustom} placeholder="메모를 입력하세요" placeholderTextColor={lightColors.ink500} style={[styles.input, { marginTop: 8 }]} />
            )}
          </Field>

          <Field label={`포인트 사용 (잔액 ${availablePoints.toLocaleString()}P)`}>
            <TextInput
              value={pointsInput}
              onChangeText={(v) => {
                // 사용 가능 최대치로 클램프 — 표시값과 실제 적용값 불일치 방지
                const n = Math.min(Number(v.replace(/[^0-9]/g, "")) || 0, maxPoints)
                setPointsInput(n > 0 ? String(n) : "")
              }}
              editable={maxPoints > 0}
              placeholder={maxPoints > 0 ? `최대 ${maxPoints.toLocaleString()}P 사용 가능` : "사용 가능한 포인트가 없어요"}
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={[styles.input, maxPoints <= 0 && { opacity: 0.5 }]}
            />
            <Text style={styles.helperText}>최대 결제금액의 {maxPct}%까지 사용 가능</Text>
          </Field>

          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>상품 금액</Text>
              <Text style={styles.totalVal}>{subtotal.toLocaleString()}원</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>배송비</Text>
              <Text style={[styles.totalVal, isFreeShipping && { color: "#10b981", fontWeight: "700" }]}>
                {isFreeShipping ? "무료배송" : `+${shippingFee.toLocaleString()}원`}
              </Text>
            </View>
            {pointsApplied > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>포인트 사용</Text>
                <Text style={[styles.totalVal, { color: "#ef4444" }]}>
                  -{pointsApplied.toLocaleString()}P
                </Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalRowMain]}>
              <Text style={styles.totalLabelMain}>최종 결제금액</Text>
              <Text style={styles.totalValMain}>{total.toLocaleString()}원</Text>
            </View>
          </View>

          <CheckoutConsentSection
            sellerName={(post as any)?.producer_name || (post as any)?.profiles?.nickname}
            isPerishable
            onChange={setConsented}
          />

          <Pressable onPress={handleSubmit} disabled={submitting || !consented} style={[styles.payBtn, (submitting || !consented) && { opacity: 0.5 }]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="card" size={18} color="#ffffff" />
                <Text style={styles.payBtnText}>{total.toLocaleString()}원 결제하기</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View><Text style={styles.label}>{label}</Text>{children}</View>
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900, marginBottom: spacing[2] },
  helperText: { fontSize: 11, color: lightColors.ink500, marginTop: 6 },

  productCard: {
    flexDirection: "row", gap: spacing[3], padding: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  productImg: { width: 60, height: 60, borderRadius: radius.md },
  productName: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink900, marginBottom: 4 },
  productPrice: { fontSize: fontSize.md, fontWeight: "700", color: GREEN },
  productUnit: { fontSize: 12, color: lightColors.ink500, fontWeight: "400" },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepperBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: lightColors.border,
    alignItems: "center", justifyContent: "center",
  },
  stepperVal: { fontSize: fontSize.lg, fontWeight: "700", color: lightColors.ink900, minWidth: 40, textAlign: "center" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  input: {
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background, fontSize: fontSize.sm, color: lightColors.ink900,
  },

  totalBox: {
    padding: spacing[4], borderRadius: radius.md,
    backgroundColor: lightColors.muted, gap: 6,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalRowMain: {
    paddingTop: spacing[2], marginTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: lightColors.border,
  },
  totalLabel: { fontSize: fontSize.sm, color: lightColors.ink500 },
  totalVal: { fontSize: fontSize.sm, color: lightColors.ink900 },
  totalLabelMain: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  totalValMain: { fontSize: fontSize.lg, fontWeight: "700", color: GREEN },

  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: radius.md, backgroundColor: GREEN,
  },
  payBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
})
