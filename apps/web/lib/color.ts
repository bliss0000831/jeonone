// HEX ↔ OKLCH 간이 변환 유틸
// — 테마 색상을 CSS 변수에 주입하기 위해 사용

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace("#", "")
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return [r, g, b]
}

// sRGB → linear RGB
function linearize(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// linear RGB → OKLab → OKLCH (CSS4 색공간)
export function hexToOklchString(hex: string, fallback = "oklch(0.55 0.18 240)"): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return fallback
  const [r, g, b] = rgb.map(linearize) as [number, number, number]

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  const C = Math.sqrt(a * a + bLab * bLab)
  let h = (Math.atan2(bLab, a) * 180) / Math.PI
  if (h < 0) h += 360

  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${h.toFixed(2)})`
}

// 전경색(foreground): 배경 밝기에 따라 흑/백 자동
export function foregroundFor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return "oklch(1 0 0)"
  const [r, g, b] = rgb
  // W3C relative luminance
  const L = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  return L > 0.55 ? "oklch(0.18 0.04 230)" : "oklch(1 0 0)"
}
