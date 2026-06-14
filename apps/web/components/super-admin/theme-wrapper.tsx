'use client'

/**
 * 슈퍼어드민 전용 테마 컨텍스트.
 *
 * 전역 next-themes (지역 사이트) 는 화이트 강제. 슈퍼어드민만 별도로
 * localStorage 키 'super-admin-theme' 으로 light/dark 토글 가능.
 *
 * Tailwind 의 `dark:` variant 가 동작하도록 wrapper div 에 `dark` 클래스 토글.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface Ctx {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const ThemeCtx = createContext<Ctx>({
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
})

export function useSuperAdminTheme() {
  return useContext(ThemeCtx)
}

const KEY = 'super-admin-theme'

export function SuperAdminThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  // 초기 로드 — localStorage 에서 복구
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'dark' || saved === 'light') {
        setThemeState(saved)
      }
    } catch {}
    setMounted(true)
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {}
  }
  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light')

  // mount 전엔 light 로 SSR — hydration mismatch 방지
  const effective = mounted ? theme : 'light'

  return (
    <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>
      <div className={effective === 'dark' ? 'dark' : ''} data-super-theme={effective}>
        {children}
      </div>
    </ThemeCtx.Provider>
  )
}
