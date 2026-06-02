/**
 * ProfileSidebar — 광장 web 의 components/profile/profile-sidebar.tsx 1:1 미러.
 *
 * info 탭 내용. 역할별 SidebarBlocks 매트릭스에 따라 블록 노출.
 * 7 블록: intro / contact / specialties / serviceAreas / stats / verify / hours.
 */

import { Linking, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { RoleConfig } from "./role-config"

export interface SidebarData {
  bio: string | null
  business_hours: string | null
  specialties: string[] | null
  service_areas: string[] | null
  response_rate: number | null
  avg_response_minutes: number | null
  completed_deals: number | null
  is_verified_phone: boolean | null
  is_verified_business: boolean | null
  is_verified_license: boolean | null
  phone?: string | null
  website?: string | null
  kakao_id?: string | null
  location?: string | null
}

export interface BusinessInfo {
  business_name: string | null
  business_number: string | null
  registration_number: string | null
  office_address: string | null
  contact_phone: string | null
  requested_type: string
}

interface Props {
  data: SidebarData
  role: RoleConfig
  mode: "self" | "other"
  onEdit?: () => void
  businessInfo?: BusinessInfo | null
}

export function ProfileSidebar({ data, role, mode, onEdit, businessInfo }: Props) {
  const blocks = role.sidebar
  const hasContactData = !!(data.phone || data.website || data.kakao_id || data.location)
  const hasAny =
    blocks.intro ||
    blocks.stats ||
    blocks.verify ||
    blocks.specialties ||
    blocks.hours ||
    blocks.serviceAreas ||
    (blocks.contact && (mode === "self" || hasContactData)) ||
    !!businessInfo

  if (!hasAny) return null

  return (
    <View style={styles.wrap}>
      {/* 소개 */}
      {blocks.intro && (
        <Block title="소개" onEdit={mode === "self" ? onEdit : undefined}>
          {data.bio ? (
            <Text style={styles.body}>{data.bio}</Text>
          ) : (
            <Text style={styles.empty}>
              {mode === "self" ? "자기소개를 작성해보세요" : "소개가 없습니다"}
            </Text>
          )}
        </Block>
      )}

      {/* 연락처 / 지역 */}
      {blocks.contact && (mode === "self" || hasContactData) && (
        <Block title="연락처 / 지역" onEdit={mode === "self" ? onEdit : undefined}>
          <View style={{ gap: 8 }}>
            <ContactItem
              icon="location-outline"
              label="내 지역"
              value={data.location}
              emptyText={mode === "self" ? "동네를 설정해보세요" : null}
            />
            <ContactItem
              icon="call-outline"
              label="연락처"
              value={data.phone}
              href={data.phone ? `tel:${data.phone}` : undefined}
              emptyText={mode === "self" ? "연락처를 등록해보세요" : null}
            />
            <ContactItem
              icon="globe-outline"
              label="웹사이트"
              value={data.website}
              href={
                data.website
                  ? data.website.startsWith("http")
                    ? data.website
                    : `https://${data.website}`
                  : undefined
              }
              emptyText={mode === "self" ? "웹사이트를 등록해보세요" : null}
            />
            <ContactItem
              icon="chatbubble-outline"
              label="카카오톡"
              value={data.kakao_id}
              href={
                data.kakao_id && data.kakao_id.startsWith("http")
                  ? data.kakao_id
                  : undefined
              }
              emptyText={mode === "self" ? "카카오톡 ID를 등록해보세요" : null}
            />
          </View>
        </Block>
      )}

      {/* 전문 분야 */}
      {blocks.specialties && (
        <Block title="전문 분야" onEdit={mode === "self" ? onEdit : undefined}>
          {data.specialties && data.specialties.length > 0 ? (
            <View style={styles.tagWrap}>
              {data.specialties.map((s) => (
                <View key={s} style={styles.tagPrimary}>
                  <Text style={styles.tagPrimaryText}>#{s}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>
              {mode === "self" ? "전문 분야를 추가해보세요" : "등록된 전문 분야가 없습니다"}
            </Text>
          )}
        </Block>
      )}

      {/* 서비스 지역 */}
      {blocks.serviceAreas && (
        <Block title="서비스 지역" onEdit={mode === "self" ? onEdit : undefined}>
          {data.service_areas && data.service_areas.length > 0 ? (
            <View style={styles.tagWrap}>
              {data.service_areas.map((a) => (
                <View key={a} style={styles.tagSecondary}>
                  <Ionicons name="location-outline" size={11} color={lightColors.ink700} />
                  <Text style={styles.tagSecondaryText}>{a}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>
              {mode === "self" ? "서비스 지역을 설정해보세요" : "-"}
            </Text>
          )}
        </Block>
      )}

      {/* 인증 */}
      {blocks.verify && (
        <Block title="인증">
          <View style={{ gap: 8 }}>
            <VerifyItem ok={!!data.is_verified_phone} icon="call-outline" label="휴대폰" />
            <VerifyItem ok={!!data.is_verified_business} icon="mail-outline" label="사업자" />
          </View>
        </Block>
      )}

      {/* 영업 시간 */}
      {blocks.hours && (
        <Block title="영업 시간" onEdit={mode === "self" ? onEdit : undefined}>
          {data.business_hours ? (
            <Text style={styles.body}>{data.business_hours}</Text>
          ) : (
            <Text style={styles.empty}>
              {mode === "self" ? "영업시간을 설정해보세요" : "-"}
            </Text>
          )}
        </Block>
      )}

      {/* 사업자 정보 — account_type_requests 에서 승인된 사업자 정보 표시 */}
      {businessInfo && (
        <Block title="사업자 정보">
          <View style={{ gap: 8 }}>
            {businessInfo.business_name ? (
              <BizInfoRow label="상호" value={businessInfo.business_name} />
            ) : null}
            {businessInfo.office_address ? (
              <BizInfoRow label="사업장 주소" value={businessInfo.office_address} />
            ) : null}
            {businessInfo.business_number ? (
              <BizInfoRow label="사업자 번호" value={businessInfo.business_number} />
            ) : null}
            {businessInfo.registration_number && businessInfo.requested_type === "agent" ? (
              <BizInfoRow label="등록번호" value={businessInfo.registration_number} />
            ) : null}
            {businessInfo.contact_phone ? (
              <BizInfoRow
                label="연락처"
                value={businessInfo.contact_phone}
                href={`tel:${businessInfo.contact_phone}`}
              />
            ) : null}
          </View>
        </Block>
      )}

      {/* 활동 지표 — 맨 하단 */}
      {blocks.stats && (
        <Block title="활동 지표">
          <View style={{ gap: 10 }}>
            <Stat
              icon="trending-up-outline"
              label="응답률"
              value={data.response_rate != null ? `${data.response_rate}%` : "-"}
            />
            <Stat
              icon="time-outline"
              label="평균 응답"
              value={
                data.avg_response_minutes != null
                  ? formatMinutes(data.avg_response_minutes)
                  : "-"
              }
            />
            <Stat
              icon="trophy-outline"
              label="완료 거래"
              value={data.completed_deals != null ? `${data.completed_deals}건` : "-"}
            />
          </View>
        </Block>
      )}
    </View>
  )
}

// ─── 서브 컴포넌트 ──────────────────────────────────────────

function Block({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit?: () => void
  children: React.ReactNode
}) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>{title}</Text>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={6}>
            <Text style={styles.editLink}>편집</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  )
}

function ContactItem({
  icon,
  label,
  value,
  href,
  emptyText,
}: {
  icon: any
  label: string
  value?: string | null
  href?: string
  emptyText?: string | null
}) {
  if (!value && !emptyText) return null
  const onPress = href ? () => { Linking.openURL(href).catch(() => {}) } : undefined
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactLeft}>
        <Ionicons name={icon} size={16} color={lightColors.ink500} />
        <Text style={styles.contactLabel}>{label}</Text>
      </View>
      {value ? (
        onPress ? (
          <Pressable onPress={onPress} hitSlop={4}>
            <Text style={styles.contactValueLink} numberOfLines={1}>
              {value}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.contactValue} numberOfLines={1}>
            {value}
          </Text>
        )
      ) : (
        <Text style={styles.contactEmpty} numberOfLines={1}>
          {emptyText}
        </Text>
      )}
    </View>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: string
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.contactLeft}>
        <Ionicons name={icon} size={16} color={lightColors.ink500} />
        <Text style={styles.contactLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function VerifyItem({
  ok,
  icon,
  label,
}: {
  ok: boolean
  icon: any
  label: string
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.contactLeft}>
        <Ionicons name={icon} size={16} color={lightColors.ink500} />
        <Text style={styles.contactLabel}>{label}</Text>
      </View>
      <View style={styles.verifyRight}>
        <Ionicons
          name="checkmark-circle"
          size={16}
          color={ok ? "#22c55e" : "rgba(100,116,139,0.4)"}
        />
        <Text style={[styles.verifyText, { color: ok ? "#16a34a" : lightColors.ink500 }]}>
          {ok ? "인증" : "미인증"}
        </Text>
      </View>
    </View>
  )
}

function BizInfoRow({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href?: string
}) {
  const onPress = href ? () => { Linking.openURL(href).catch(() => {}) } : undefined
  return (
    <View style={styles.contactRow}>
      <Text style={styles.contactLabel}>{label}</Text>
      {onPress ? (
        <Pressable onPress={onPress} hitSlop={4}>
          <Text style={styles.contactValueLink} numberOfLines={1}>
            {value}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.contactValue} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  )
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}시간 ${rem}분` : `${h}시간`
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  block: {
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: spacing[4],
  },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[2],
  },
  blockTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  editLink: {
    fontSize: fontSize.xs,
    color: lightColors.primary,
    fontWeight: "500",
  },
  body: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    lineHeight: 20,
  },
  empty: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagPrimary: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.1)",
  },
  tagPrimaryText: {
    fontSize: 12,
    color: lightColors.primary,
    fontWeight: "500",
  },
  tagSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: lightColors.muted,
  },
  tagSecondaryText: {
    fontSize: 12,
    color: lightColors.ink700,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  contactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  contactLabel: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  contactValue: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    flexShrink: 1,
    textAlign: "right",
  },
  contactValueLink: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.primary,
    textDecorationLine: "underline",
    flexShrink: 1,
    textAlign: "right",
  },
  contactEmpty: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    textAlign: "right",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  verifyRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  verifyText: {
    fontSize: 12,
    fontWeight: "500",
  },
})
