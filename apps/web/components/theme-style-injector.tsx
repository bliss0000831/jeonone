// 사이트 테마 색상을 서버에서 미리 읽어 <style>로 주입.
// 멀티-광장: 광장 서브도메인이면 plazas.theme, 허브면 site_settings.theme_colors.
// 설정이 없거나 실패해도 globals.css 기본값이 그대로 쓰이도록 graceful fallback.

import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { foregroundFor, hexToOklchString } from "@/lib/color"

interface ThemeColors {
  primary?: string
  primaryColor?: string  // plazas.theme 의 키 (호환)
  accent?: string
  accentColor?: string
}

export async function ThemeStyleInjector() {
  let primary: string | undefined
  let accent: string | undefined

  try {
    const supabase = await createClient()
    const plaza = await getCurrentPlaza()

    if (plaza) {
      // 광장별 테마 (plazas.theme)
      const { data } = await supabase
        .from("plazas")
        .select("theme")
        .eq("id", plaza)
        .maybeSingle()
      const t = (data?.theme || {}) as ThemeColors
      const p = t.primary || t.primaryColor
      const a = t.accent || t.accentColor
      if (p && /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/.test(p)) primary = p
      if (a && /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/.test(a)) accent = a
    } else {
      // 허브 도메인 — site_settings.hub_theme_colors 키만 사용 (super admin 전용)
      // theme_colors (legacy 글로벌) 는 광장 admin 이 만지던 흔적 → 허브에서 무시.
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "hub_theme_colors")
        .maybeSingle()
      const raw = data?.value
      const parsed: ThemeColors =
        typeof raw === "string" ? JSON.parse(raw) : raw ?? {}
      if (parsed?.primary && /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/.test(parsed.primary)) primary = parsed.primary
      if (parsed?.accent && /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$/.test(parsed.accent)) accent = parsed.accent
    }
  } catch {
    // 실패 시 기본 팔레트
  }

  if (!primary && !accent) return null

  const rules: string[] = []
  if (primary) {
    rules.push(`--primary: ${hexToOklchString(primary)};`)
    rules.push(`--primary-foreground: ${foregroundFor(primary)};`)
    rules.push(`--ring: ${hexToOklchString(primary)};`)
    rules.push(`--sidebar-primary: ${hexToOklchString(primary)};`)
    rules.push(`--sidebar-ring: ${hexToOklchString(primary)};`)
  }
  if (accent) {
    rules.push(`--accent: ${hexToOklchString(accent)};`)
    rules.push(`--accent-foreground: ${foregroundFor(accent)};`)
  }

  const css = `:root { ${rules.join(" ")} } .dark { ${rules.join(" ")} }`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
