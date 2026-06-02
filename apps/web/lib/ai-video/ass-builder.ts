/**
 * ASS (Advanced SubStation Alpha) 자막 파일 생성기
 *
 *   영상 style 에 따라 자동으로 자막 디자인 매핑:
 *     · emotional    → Cinema    (하단 중앙, 반투명 블랙 박스, 우아한 페이드)
 *     · professional → Broadcast (하단 띠배경 + 골드 테두리, 뉴스 스타일)
 *     · upbeat       → Reels     (중앙 큰 글씨, 흰 글씨 + 검정 외곽선, 강한 페이드)
 *
 *   좌표계: PlayResX=1080, PlayResY=1920 (9:16 세로 영상 기준)
 *   다른 비율일 때도 같은 좌표로 작동 (ffmpeg 가 비율에 맞게 스케일링)
 */

import type { VideoStyle } from "./script-generator"
import type { SubtitleSegment } from "./subtitle-generator"

export type AspectRatio = "9:16" | "1:1" | "16:9"

/**
 * 영상 비율에 따른 Play 해상도
 */
function getPlayRes(ratio: AspectRatio): { x: number; y: number } {
  if (ratio === "16:9") return { x: 1920, y: 1080 }
  if (ratio === "1:1") return { x: 1080, y: 1080 }
  return { x: 1080, y: 1920 } // 9:16
}

/**
 * 초 → ASS 타임스탬프 (H:MM:SS.CC)
 */
function fmtTime(sec: number): string {
  if (sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const whole = Math.floor(s)
  const cs = Math.floor((s - whole) * 100)
  return `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
}

/**
 * ASS 안전 텍스트 이스케이프
 */
function escAss(text: string): string {
  return text.replace(/\n/g, "\\N").replace(/\{/g, "(").replace(/\}/g, ")")
}

/**
 * ─── 스타일 정의 ───────────────────────────────────────
 *
 *  Style 필드 순서 (ASS v4+):
 *    Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
 *    OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,
 *    ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,
 *    Alignment, MarginL, MarginR, MarginV, Encoding
 *
 *  색상은 &H<alpha><BB><GG><RR> — little-endian. alpha 0 = 불투명, FF = 투명
 *  Alignment: 1=하좌 2=하중 3=하우 5=상좌 6=상중 7=상우 9=우중 10=중중 11=좌중
 *  BorderStyle: 1=Outline+Shadow, 3=Opaque Box
 */

interface StyleDef {
  name: string
  def: string // Style Body
  wrap: (text: string, subText?: string) => string // Dialogue text with override tags
}

function cinemaStyle(font: string): StyleDef {
  // 하단 중앙, 반투명 블랙 박스 위에 흰 글씨. 페이드 200ms.
  return {
    name: "Cinema",
    // BorderStyle=3 (Opaque Box), BackColour 반투명 블랙, Outline 6 (박스 패딩)
    def: `Style: Cinema,${font},56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H802D2D2D,1,0,0,0,100,100,2,0,3,6,0,2,60,60,120,1`,
    wrap: (text, subText) => {
      const main = `{\\fad(250,250)}${escAss(text)}`
      if (!subText) return main
      return `{\\fad(250,250)}${escAss(text)}\\N{\\fs36\\alpha&H40&}${escAss(subText)}`
    },
  }
}

function broadcastStyle(font: string): StyleDef {
  // 하단 골드 테두리, 굵은 글씨 — 뉴스/방송 느낌
  return {
    name: "Broadcast",
    // PrimaryColour 흰색, OutlineColour 골드(&H00FFB400 = BB:FF GG:B4 RR:00)
    def: `Style: Broadcast,${font},62,&H00FFFFFF,&H00FFFFFF,&H0000B4FF,&HA0000000,1,0,0,0,100,100,1,0,1,4,2,2,80,80,160,1`,
    wrap: (text, subText) => {
      const main = `{\\fad(150,150)\\bord4\\shad3}${escAss(text)}`
      if (!subText) return main
      return `{\\fad(150,150)\\bord4\\shad3}${escAss(text)}\\N{\\fs40\\c&H00F0F0F0&\\bord2}${escAss(subText)}`
    },
  }
}

function reelsStyle(font: string): StyleDef {
  // 중앙 상단쪽, 큰 글씨, 검정 외곽선 — 인스타 릴스/틱톡 스타일
  return {
    name: "Reels",
    // Alignment=5 (상좌)가 아닌 5=TopLeft 구버전... v4+에선 7=TopLeft, 8=TopCenter
    // 여기선 중앙약간위 표현: Alignment=8, MarginV=200
    def: `Style: Reels,${font},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,6,0,8,60,60,340,1`,
    wrap: (text, subText) => {
      const main = `{\\fad(180,180)\\t(0,200,\\fscx110\\fscy110)\\t(200,400,\\fscx100\\fscy100)}${escAss(text)}`
      if (!subText) return main
      return `${main}\\N{\\fs48\\c&H00F5E500&\\bord4}${escAss(subText)}`
    },
  }
}

const STYLE_MAP: Record<VideoStyle, (font: string) => StyleDef> = {
  emotional: cinemaStyle,
  professional: broadcastStyle,
  upbeat: reelsStyle,
}

/**
 * ASS 파일 전체 생성
 */
export function buildAss(args: {
  segments: SubtitleSegment[]
  videoStyle: VideoStyle
  ratio: AspectRatio
  fontName?: string // ffmpeg fontsdir 에 등록된 폰트 이름
}): string {
  const fontName = args.fontName || "Noto Sans KR"
  const styleDef = STYLE_MAP[args.videoStyle](fontName)
  const { x, y } = getPlayRes(args.ratio)

  const header = `[Script Info]
Title: Gwangjang AI Video Subtitle
ScriptType: v4.00+
PlayResX: ${x}
PlayResY: ${y}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleDef.def}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  const events = args.segments
    .map((seg) => {
      const text = styleDef.wrap(seg.text, seg.subText)
      return `Dialogue: 0,${fmtTime(seg.start)},${fmtTime(seg.end)},${styleDef.name},,0,0,0,,${text}`
    })
    .join("\n")

  return header + events + "\n"
}
