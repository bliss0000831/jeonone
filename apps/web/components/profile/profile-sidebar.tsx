"use client"

import Link from "next/link"
import {
  BadgeCheck, Clock, MapPin, Tag, TrendingUp, Award, Phone, Mail, Globe, MessageCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BusinessInfo } from "@/lib/services/business-info"
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

interface ProfileSidebarProps {
  data: SidebarData
  role: RoleConfig
  mode: "self" | "other"
  businessInfo?: BusinessInfo | null
}

export function ProfileSidebar({ data, role, mode, businessInfo }: ProfileSidebarProps) {
  const blocks = role.sidebar
  const hasContactData = !!(data.phone || data.website || data.kakao_id || data.location)
  const hasAny =
    blocks.intro || blocks.stats || blocks.verify || blocks.specialties ||
    blocks.hours || blocks.serviceAreas ||
    (blocks.contact && (mode === "self" || hasContactData)) ||
    !!businessInfo

  if (!hasAny) return null

  return (
    <aside className="space-y-4">
      {blocks.intro && (
        <Block title="소개" editHref={mode === "self" ? "/mypage/edit" : undefined}>
          {data.bio ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {data.bio}
            </p>
          ) : (
            <EmptyLine text={mode === "self" ? "자기소개를 작성해보세요" : "소개가 없습니다"} />
          )}
        </Block>
      )}

      {blocks.contact && (mode === "self" || hasContactData) && (
        <Block title="연락처 / 지역" editHref={mode === "self" ? "/mypage/edit" : undefined}>
          <ul className="space-y-2 text-sm">
            <ContactItem
              icon={MapPin}
              label="내 지역"
              value={data.location}
              emptyText={mode === "self" ? "동네를 설정해보세요" : null}
            />
            <ContactItem
              icon={Phone}
              label="연락처"
              value={data.phone}
              href={data.phone ? `tel:${data.phone}` : undefined}
              emptyText={mode === "self" ? "연락처를 등록해보세요" : null}
            />
            <ContactItem
              icon={Globe}
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
              icon={MessageCircle}
              label="카카오톡"
              value={data.kakao_id}
              href={
                data.kakao_id && data.kakao_id.startsWith("http")
                  ? data.kakao_id
                  : undefined
              }
              emptyText={mode === "self" ? "카카오톡 ID를 등록해보세요" : null}
            />
          </ul>
        </Block>
      )}

      {blocks.specialties && (
        <Block
          title="전문 분야"
          editHref={mode === "self" ? "/mypage/edit" : undefined}
        >
          {data.specialties && data.specialties.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.specialties.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                >
                  #{s}
                </span>
              ))}
            </div>
          ) : (
            <EmptyLine text={mode === "self" ? "전문 분야를 추가해보세요" : "등록된 전문 분야가 없습니다"} />
          )}
        </Block>
      )}

      {blocks.serviceAreas && (
        <Block title="서비스 지역" editHref={mode === "self" ? "/mypage/edit" : undefined}>
          {data.service_areas && data.service_areas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.service_areas.map((a) => (
                <span
                  key={a}
                  className="px-2 py-0.5 rounded-full bg-secondary text-xs flex items-center gap-1"
                >
                  <MapPin className="w-3 h-3" />
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <EmptyLine text={mode === "self" ? "서비스 지역을 설정해보세요" : "-"} />
          )}
        </Block>
      )}

      {blocks.verify && (
        <Block title="인증">
          <ul className="space-y-2 text-sm">
            <VerifyItem ok={!!data.is_verified_phone} icon={Phone} label="휴대폰" />
            <VerifyItem ok={!!data.is_verified_business} icon={Mail} label="사업자" />
          </ul>
        </Block>
      )}

      {blocks.hours && (
        <Block title="영업 시간" editHref={mode === "self" ? "/mypage/edit" : undefined}>
          {data.business_hours ? (
            <p className="text-sm whitespace-pre-wrap">{data.business_hours}</p>
          ) : (
            <EmptyLine text={mode === "self" ? "영업시간을 설정해보세요" : "-"} />
          )}
        </Block>
      )}

      {businessInfo && (
        <Block title="사업자 정보">
          <dl className="space-y-2 text-sm">
            {businessInfo.business_name && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">상호</dt>
                <dd className="font-medium text-right truncate">{businessInfo.business_name}</dd>
              </div>
            )}
            {businessInfo.office_address && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">사업장 주소</dt>
                <dd className="font-medium text-right truncate">{businessInfo.office_address}</dd>
              </div>
            )}
            {businessInfo.business_number && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">사업자 번호</dt>
                <dd className="font-medium text-right truncate">{businessInfo.business_number}</dd>
              </div>
            )}
            {businessInfo.registration_number && businessInfo.requested_type === "agent" && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">등록번호</dt>
                <dd className="font-medium text-right truncate">{businessInfo.registration_number}</dd>
              </div>
            )}
            {businessInfo.contact_phone && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground shrink-0">연락처</dt>
                <dd className="font-medium text-right truncate">
                  <a href={`tel:${businessInfo.contact_phone}`} className="text-primary hover:underline">
                    {businessInfo.contact_phone}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </Block>
      )}

      {blocks.stats && (
        <Block title="활동 지표">
          <dl className="space-y-2.5 text-sm">
            <Stat
              icon={TrendingUp}
              label="응답률"
              value={data.response_rate != null ? `${data.response_rate}%` : "-"}
            />
            <Stat
              icon={Clock}
              label="평균 응답"
              value={
                data.avg_response_minutes != null
                  ? formatMinutes(data.avg_response_minutes)
                  : "-"
              }
            />
            <Stat
              icon={Award}
              label="완료 거래"
              value={data.completed_deals != null ? `${data.completed_deals}건` : "-"}
            />
          </dl>
        </Block>
      )}
    </aside>
  )
}

function Block({
  title,
  editHref,
  children,
}: {
  title: string
  editHref?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {editHref && (
          <Link href={editHref} className="text-xs text-primary hover:underline">
            편집
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function VerifyItem({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean
  icon: typeof Phone
  label: string
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-medium",
          ok ? "text-green-600" : "text-muted-foreground",
        )}
      >
        <BadgeCheck className={cn("w-4 h-4", ok ? "text-green-500" : "text-muted-foreground/40")} />
        {ok ? "인증" : "미인증"}
      </span>
    </li>
  )
}

function ContactItem({
  icon: Icon,
  label,
  value,
  href,
  emptyText,
}: {
  icon: typeof Phone
  label: string
  value?: string | null
  href?: string
  emptyText?: string | null
}) {
  if (!value && !emptyText) return null
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground shrink-0">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      {value ? (
        href ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="font-medium text-primary hover:underline truncate text-right"
          >
            {value}
          </a>
        ) : (
          <span className="font-medium truncate text-right">{value}</span>
        )
      ) : (
        <span className="text-muted-foreground text-xs text-right">{emptyText}</span>
      )}
    </li>
  )
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}시간 ${rem}분` : `${h}시간`
}
