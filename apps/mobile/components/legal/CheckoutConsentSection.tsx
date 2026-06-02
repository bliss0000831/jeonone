/**
 * 결제 화면 동의 섹션 — 공동구매·로컬푸드 등 결제 흐름 직전.
 *
 * 전상법상 의무 동의 3개:
 *  1. 개인정보 제3자 제공 (판매자에게 배송 정보 전달)
 *  2. 청약철회권 안내 확인
 *  3. 위 내용 모두 확인
 *
 * 부모가 `onChange(allChecked)` 로 결제 버튼 활성화 결정.
 */

import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  /** 판매자 이름 (제3자 제공 동의 표시용) */
  sellerName?: string
  /** 신선식품/맞춤제작 등 청약철회 제한 가능 품목인지 (true면 안내 추가) */
  isPerishable?: boolean
  onChange: (allChecked: boolean) => void
}

export function CheckoutConsentSection({ sellerName, isPerishable, onChange }: Props) {
  const [checked, setChecked] = useState({ thirdParty: false, refund: false, ack: false })
  const [expanded, setExpanded] = useState({ thirdParty: false, refund: false })

  useEffect(() => {
    onChange(checked.thirdParty && checked.refund && checked.ack)
  }, [checked, onChange])

  return (
    <View style={styles.box}>
      <Text style={styles.title}>필수 동의 사항</Text>

      {/* 1. 개인정보 제3자 제공 */}
      <View style={styles.item}>
        <View style={styles.row}>
          <Pressable
            onPress={() => setChecked((p) => ({ ...p, thirdParty: !p.thirdParty }))}
            style={styles.checkRow}
          >
            <View style={[styles.checkbox, checked.thirdParty && styles.checkboxOn]}>
              {checked.thirdParty && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.label}>
              <Text style={styles.required}>[필수]</Text> 개인정보 제3자 제공 동의
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setExpanded((p) => ({ ...p, thirdParty: !p.thirdParty }))}
            hitSlop={8}
          >
            <Ionicons
              name={expanded.thirdParty ? "chevron-up" : "chevron-down"}
              size={16}
              color={lightColors.ink500}
            />
          </Pressable>
        </View>
        {expanded.thirdParty && (
          <View style={styles.expand}>
            <Text style={styles.expandLine}>
              <Text style={styles.expandK}>제공받는 자:</Text> {sellerName || "판매자"}
            </Text>
            <Text style={styles.expandLine}>
              <Text style={styles.expandK}>제공 목적:</Text> 상품 배송·주문 확인·A/S
            </Text>
            <Text style={styles.expandLine}>
              <Text style={styles.expandK}>제공 항목:</Text> 이름, 연락처, 배송지 주소
            </Text>
            <Text style={styles.expandLine}>
              <Text style={styles.expandK}>보유·이용 기간:</Text> 배송 완료 후 30일까지
              (관련 법령상 보유 기간 별도 적용 가능)
            </Text>
            <Text style={styles.expandNote}>
              동의 거부 시 본 거래에 참여하실 수 없습니다.
            </Text>
          </View>
        )}
      </View>

      {/* 2. 청약철회 안내 */}
      <View style={styles.item}>
        <View style={styles.row}>
          <Pressable
            onPress={() => setChecked((p) => ({ ...p, refund: !p.refund }))}
            style={styles.checkRow}
          >
            <View style={[styles.checkbox, checked.refund && styles.checkboxOn]}>
              {checked.refund && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.label}>
              <Text style={styles.required}>[필수]</Text> 청약철회 안내 확인
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setExpanded((p) => ({ ...p, refund: !p.refund }))}
            hitSlop={8}
          >
            <Ionicons
              name={expanded.refund ? "chevron-up" : "chevron-down"}
              size={16}
              color={lightColors.ink500}
            />
          </Pressable>
        </View>
        {expanded.refund && (
          <View style={styles.expand}>
            <Text style={styles.expandLine}>• 발송 전: 언제든 취소 가능</Text>
            <Text style={styles.expandLine}>
              • 발송 후 7일 이내: 단순 변심 환불 가능 (반품비 구매자 부담)
            </Text>
            <Text style={styles.expandLine}>
              • 상품 자체 하자(변질·이물질·상이 상품): 청약철회 가능
            </Text>
            {isPerishable && (
              <Text style={[styles.expandLine, styles.expandWarn]}>
                ⚠ 신선식품·맞춤제작 등은 시간 경과로 가치가 감소할 경우 청약철회가
                제한될 수 있습니다 (전자상거래법 제17조 제2항).
              </Text>
            )}
          </View>
        )}
      </View>

      {/* 3. 위 내용 모두 확인 */}
      <Pressable
        onPress={() => setChecked((p) => ({ ...p, ack: !p.ack }))}
        style={styles.checkRow}
      >
        <View style={[styles.checkbox, checked.ack && styles.checkboxOn]}>
          {checked.ack && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.label}>
          <Text style={styles.required}>[필수]</Text> 위 내용을 모두 확인했습니다
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    marginBottom: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: lightColors.muted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: 10,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 4,
  },
  item: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: lightColors.ink500,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  label: {
    fontSize: 12,
    color: lightColors.ink700,
    flex: 1,
  },
  required: { color: "#dc2626", fontWeight: "700" },
  expand: {
    paddingLeft: 26,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: lightColors.border,
    marginLeft: 9,
  },
  expandLine: {
    fontSize: 11,
    color: lightColors.ink600,
    lineHeight: 16,
  },
  expandK: { fontWeight: "700", color: lightColors.ink800 },
  expandWarn: {
    color: "#b45309",
    fontWeight: "600",
    marginTop: 4,
  },
  expandNote: {
    fontSize: 11,
    color: lightColors.ink500,
    fontStyle: "italic",
    marginTop: 2,
  },
})
