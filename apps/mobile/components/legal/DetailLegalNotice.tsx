/**
 * 모바일 디테일 페이지 최하단 면책 박스 — 부동산/홈즈/공구/로컬푸드/중고/모임/구인/신장개업 공용.
 *
 * 도메인별 톤이 다를 수 있어 variant 분기:
 *  - "neutral"   : 일반 (게시판/중고/모임/공구 등) — 회색
 *  - "agent"     : 공인중개사 매물 — 회색, 중개사 정보 강조
 *  - "directDeal": 직거래 부동산 매물 — 노란 경고
 *  - "service"   : 홈즈(인테리어/이사/수리/청소) — 회색, 시공 책임 강조
 */

import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  variant?: "neutral" | "agent" | "directDeal" | "service"
}

const TEXT_BY_VARIANT: Record<NonNullable<Props["variant"]>, { title: string; body: string }> = {
  neutral: {
    title: "통신판매중개자 안내",
    body:
      "본 플랫폼은 「전자상거래 등에서의 소비자보호에 관한 법률」 제20조에 따른 통신판매중개자로서 거래 당사자가 아닙니다. 게시 정보의 정확성·적법성 및 거래 이행에 대한 책임은 등록자에게 있습니다.",
  },
  agent: {
    title: "중개사 등록 매물",
    body:
      "본 매물은 공인중개사가 등록한 매물입니다. 거래 및 계약은 해당 중개사무소를 통해 진행하시기 바랍니다. 계약 전 반드시 등기부등본 및 중개사 등록증을 확인하세요.",
  },
  directDeal: {
    title: "⚠ 직거래 매물 — 안전수칙",
    body:
      "본 매물은 일반회원이 등록한 직거래 매물입니다. 공인중개사를 통하지 않은 거래는 법적 보호가 제한될 수 있으며, 거래 과정에서 발생하는 분쟁에 대해 본 플랫폼은 책임지지 않습니다. 등기부등본·신분증 확인 등 안전거래 수칙을 반드시 준수해주세요.",
  },
  service: {
    title: "시공·서비스 책임 안내",
    body:
      "본 업체의 시공·수리·청소·이사 서비스 품질, A/S, 하자보수, 계약 이행 등 모든 책임은 해당 업체에 있으며, 본 플랫폼은 중재 노력을 할 수 있으나 법적 책임은 지지 않습니다. 계약 전 반드시 서면 견적서·계약서를 받으세요.",
  },
}

export const DetailLegalNotice = memo(function DetailLegalNotice({ variant = "neutral" }: Props) {
  const router = useRouter()
  const isWarn = variant === "directDeal"
  const { title, body } = TEXT_BY_VARIANT[variant]
  return (
    <Pressable
      onPress={() => router.push("/legal/terms")}
      style={[styles.box, isWarn && styles.boxWarn]}
      hitSlop={4}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <Ionicons
          name={isWarn ? "warning-outline" : "information-circle-outline"}
          size={16}
          color={isWarn ? "#b45309" : lightColors.ink700}
          style={{ marginTop: 1 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isWarn && styles.titleWarn]}>{title}</Text>
          <Text style={[styles.body, isWarn && styles.bodyWarn]}>{body}</Text>
        </View>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  box: {
    marginHorizontal: spacing[3],
    marginVertical: spacing[4],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: lightColors.muted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  boxWarn: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
  },
  title: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 4,
  },
  titleWarn: { color: "#92400e" },
  body: {
    fontSize: 11,
    color: lightColors.ink500,
    lineHeight: 17,
  },
  bodyWarn: { color: "#92400e" },
})
