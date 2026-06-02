/**
 * 자막 구간 생성기
 *
 *   입력: 나레이션 스크립트 + 매물 데이터 + 영상 길이
 *   출력: [{ start, end, text, subText? }] — 초 단위 타이밍
 *
 *   전략: OpenAI structured output 으로 타이밍 분배 요청.
 *         매물 핵심 정보(위치/면적/가격)를 subText 로 병기하여 시각적 풍성함.
 */

import OpenAI from "openai"
import type { PropertyData } from "./script-generator"

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface SubtitleSegment {
  start: number // 초
  end: number // 초
  text: string // 메인 문구 (짧게, 큰 글씨)
  subText?: string // 서브라인 (작게, 예: "24평 · 남향" 같은 태그)
}

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "subtitle_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              start: { type: "number" },
              end: { type: "number" },
              text: { type: "string" },
              subText: { type: ["string", "null"] },
            },
            required: ["start", "end", "text", "subText"],
          },
        },
      },
      required: ["segments"],
    },
  },
}

export async function generateSubtitleSegments(args: {
  script: string
  duration: 15 | 30 | 60
  property: PropertyData
}): Promise<SubtitleSegment[]> {
  const { script, duration, property } = args

  const system = `당신은 부동산 홍보영상 자막 편집자입니다.
주어진 한국어 나레이션을 시각적 자막으로 변환합니다.

규칙:
- 영상 총 길이: ${duration}초
- 자막은 4~6개 구간으로 분할
- 각 구간 2~4초 유지
- text: 한 줄 핵심 문구 (최대 14자, 공백 포함)
- subText: 보조 정보 (위치/면적/가격 등 매물 fact, 최대 20자)
  · 같은 정보 반복 금지
  · subText 가 없으면 null
- 구간은 겹치지 않고 연속
- 첫 구간 start=0, 마지막 구간 end=${duration}
- 따옴표/마침표 금지 (자막은 마침표 없이)
`

  const user = `
[나레이션 스크립트]
${script}

[매물 참고 데이터]
위치: ${property.address || "-"}
유형: ${property.propertyType || "-"}
면적: ${property.area ? property.area + "㎡" : "-"}
층: ${property.floor ? property.floor + "층" : "-"}
거래: ${summarizePrice(property)}
특징: ${property.description?.slice(0, 60) || "-"}
`.trim()

  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: RESPONSE_FORMAT as any,
    temperature: 0.5,
    max_tokens: 600,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("자막 생성 실패 (빈 응답)")

  let parsed: { segments: SubtitleSegment[] }
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error("자막 JSON 파싱 실패: " + content.slice(0, 100))
  }

  // sanity check
  const segs = parsed.segments
    .filter((s) => s.end > s.start && s.text?.length > 0)
    .map((s) => ({
      start: Math.max(0, Math.min(duration, s.start)),
      end: Math.max(0, Math.min(duration, s.end)),
      text: s.text.trim().slice(0, 18),
      subText: s.subText?.trim().slice(0, 24) || undefined,
    }))

  if (segs.length === 0) throw new Error("자막 구간이 비어있습니다")
  return segs
}

function summarizePrice(p: PropertyData): string {
  const f = (n: number) =>
    n >= 100000000
      ? `${(n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1)}억`
      : n >= 10000
        ? `${Math.round(n / 10000)}만`
        : String(n)

  if (p.transactionType === "sale" && p.price) return `매매 ${f(p.price)}`
  if (p.transactionType === "jeonse" && p.deposit) return `전세 ${f(p.deposit)}`
  if (p.transactionType === "monthly" && p.deposit && p.monthlyRent)
    return `월세 ${f(p.deposit)}/${f(p.monthlyRent)}`
  return "-"
}
