/**
 * 구인구직 등록 폼 — 사기성 키워드 + 최저임금 자동 검사.
 *
 * 경찰청·금감원 공식 발표 사기 채용 패턴 키워드 200개 중 핵심 30개 검사.
 * 2026년 최저시급 검증 (입력값 < 최저시급 시 경고).
 */

import { useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { MIN_WAGE_2026 } from "@gwangjang/features/jobs"

const SCAM_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /월\s*500\s*보장|월\s*1000\s*보장|월\s*\d{3}\s*만\s*확정/, label: "비현실적 수익 보장" },
  { pattern: /고수익\s*보장|단기간\s*큰돈/, label: "고수익 미끼" },
  { pattern: /통장\s*대여|체크\s*카드\s*대여|체크카드\s*발급|대포통장/, label: "대포통장·범죄 가담" },
  { pattern: /수거\s*알바|현금\s*전달|현금\s*수거|물품\s*수거/, label: "보이스피싱 수거책 의심" },
  { pattern: /보이스피싱|피싱/, label: "보이스피싱 명시" },
  { pattern: /투자\s*권유|재테크\s*강의|코인\s*투자/, label: "다단계·유사수신 의심" },
  { pattern: /호스트|호스티스|유흥업소/, label: "유흥업소" },
  { pattern: /성인\s*모델|라방\s*BJ|노출\s*콘텐츠/, label: "성인 콘텐츠" },
  { pattern: /도박|불법\s*카지노/, label: "불법 도박" },
  { pattern: /자택\s*근무.*노트북\s*지급|재택.*고수익/, label: "재택근무 위장 사기 패턴" },
]

interface Props {
  title: string
  description: string
  hourlyWage: number | null // 시급 (원). 시급 입력 안 했으면 null
}

export function JobsConsentExtras({ title, description, hourlyWage }: Props) {
  const text = `${title}\n${description}`

  const scamMatches = useMemo(() => {
    return SCAM_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map((m) => m.label)
  }, [text])

  const wageWarning =
    hourlyWage !== null && hourlyWage > 0 && hourlyWage < MIN_WAGE_2026

  if (scamMatches.length === 0 && !wageWarning) return null

  return (
    <View style={styles.box}>
      {scamMatches.length > 0 && (
        <View style={{ marginBottom: wageWarning ? 8 : 0 }}>
          <View style={styles.row}>
            <Ionicons name="warning" size={16} color="#dc2626" style={{ marginTop: 1 }} />
            <Text style={styles.title}>사용할 수 없는 표현 감지</Text>
          </View>
          <Text style={styles.body}>
            다음 패턴은 사기 채용공고에서 빈출하는 표현입니다. 게시 시 자동 신고 처리될 수 있습니다.
          </Text>
          <View style={{ marginTop: 4 }}>
            {scamMatches.map((label) => (
              <Text key={label} style={styles.match}>
                • {label}
              </Text>
            ))}
          </View>
        </View>
      )}

      {wageWarning && (
        <View>
          <View style={styles.row}>
            <Ionicons name="alert-circle" size={16} color="#dc2626" style={{ marginTop: 1 }} />
            <Text style={styles.title}>최저임금 미만</Text>
          </View>
          <Text style={styles.body}>
            입력하신 시급 <Text style={styles.bold}>{hourlyWage!.toLocaleString()}원</Text> 은
            2026년 최저시급 <Text style={styles.bold}>{MIN_WAGE_2026.toLocaleString()}원</Text> 보다 낮습니다.
            최저임금법 위반 게시물은 자동 삭제됩니다.
          </Text>
        </View>
      )}
    </View>
  )
}

/** scam/wage 검사 결과를 외부에서 쓸 수 있도록 export — 등록 버튼 비활성화 등에 활용 */
export function checkJobsValidity(args: {
  title: string
  description: string
  hourlyWage: number | null
}): { ok: boolean; scamLabels: string[]; wageBelowMinimum: boolean } {
  const text = `${args.title}\n${args.description}`
  const scamLabels = SCAM_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map((m) => m.label)
  const wageBelowMinimum =
    args.hourlyWage !== null && args.hourlyWage > 0 && args.hourlyWage < MIN_WAGE_2026
  return {
    ok: scamLabels.length === 0 && !wageBelowMinimum,
    scamLabels,
    wageBelowMinimum,
  }
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: "#fef2f2",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#b91c1c",
  },
  body: {
    fontSize: 12,
    color: "#7f1d1d",
    lineHeight: 18,
  },
  match: {
    fontSize: 12,
    color: "#7f1d1d",
    fontWeight: "600",
    marginTop: 2,
  },
  bold: {
    fontWeight: "700",
  },
})
