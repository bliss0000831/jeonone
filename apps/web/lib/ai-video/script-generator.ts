import OpenAI from "openai"

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface PropertyData {
  title?: string
  propertyType?: string
  transactionType?: string
  price?: number | null
  deposit?: number | null
  monthlyRent?: number | null
  address?: string
  addressDetail?: string
  area?: number | null // ㎡
  floor?: number | null
  totalFloors?: number | null
  description?: string
}

export type VideoStyle = "emotional" | "professional" | "upbeat"

const STYLE_PROMPT: Record<VideoStyle, string> = {
  emotional: "따뜻하고 감성적인 어투로, 사람의 삶과 공간의 정서를 강조해주세요.",
  professional:
    "신뢰감 있고 전문적인 어투로, 입지/조건/투자가치를 부각해주세요.",
  upbeat: "밝고 활기찬 어투로, 경쾌한 리듬감 있게 말해주세요.",
}

const DURATION_TARGET: Record<15 | 30 | 60, string> = {
  15: "3~4개 짧은 문장, 약 40~55자. 핵심 포인트 1~2개만.",
  30: "5~7개 문장, 약 90~120자. 핵심 포인트 3~4개.",
  60: "10~12개 문장, 약 180~240자. 매물 전반 스토리텔링.",
}

function priceSummary(p: PropertyData): string {
  const t = p.transactionType
  if (t === "sale" && p.price) return `매매 ${fmtKrw(p.price)}`
  if (t === "jeonse" && p.deposit) return `전세 ${fmtKrw(p.deposit)}`
  if (t === "monthly" && p.deposit && p.monthlyRent)
    return `월세 ${fmtKrw(p.deposit)}/${fmtKrw(p.monthlyRent)}`
  return ""
}

function fmtKrw(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1)}억`
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`
  return `${n.toLocaleString()}원`
}

/**
 * 매물 데이터 → 한국어 나레이션 스크립트
 */
export async function generateNarrationScript(args: {
  property: PropertyData
  duration: 15 | 30 | 60
  style: VideoStyle
}): Promise<string> {
  const { property, duration, style } = args

  const system = `당신은 한국 부동산 홍보영상 나레이션 작가입니다.
- 반드시 한국어로 작성
- ${STYLE_PROMPT[style]}
- 분량: ${DURATION_TARGET[duration]}
- 과장된 수식어(최고의, 완벽한 등) 지양
- 구체적 숫자(평수/가격/층수)를 자연스럽게 녹일 것
- 맨 마지막은 부르는 듯한 따뜻한 마무리
- 결과만 출력 (설명, 따옴표, 번호 금지)`

  const user = `
[매물 정보]
- 제목: ${property.title || "-"}
- 유형: ${property.propertyType || "-"}
- 거래: ${priceSummary(property) || "-"}
- 위치: ${property.address || "-"} ${property.addressDetail || ""}
- 면적: ${property.area ? property.area + "㎡" : "-"}
- 층: ${property.floor ? property.floor + "층" : "-"}${
    property.totalFloors ? "/" + property.totalFloors + "층" : ""
  }
- 특징: ${property.description || "-"}
`.trim()

  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.8,
    max_tokens: 400,
  })

  const text = res.choices[0]?.message?.content?.trim() || ""
  if (!text) throw new Error("스크립트 생성 실패 (빈 응답)")
  return text
}
