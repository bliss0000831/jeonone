import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@gwangjang/types/database'

// 브라우저 Supabase 클라이언트 — 모듈 싱글톤.
// 매 호출마다 새 인스턴스를 만들면 인증 토큰 리스너가 중복 등록되어
// 메모리·CPU 낭비 + 컴포넌트 재렌더 시 useEffect deps 가 흔들림.
let _client: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (_client) return _client
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}
