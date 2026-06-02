# `(plaza)` 라우트 그룹

광장 서브도메인 (`chuncheon.gwangjang.app`, `gangneung.gwangjang.app` 등) 진입 시 보이는 페이지들.

## URL
괄호 폴더 `(plaza)` 는 URL 에 나타나지 않는다. 즉:
- 파일: `app/(plaza)/properties/page.tsx`
- URL: `/properties` ✅ (광장 서브도메인 기준)

## 광장 격리 원칙
이 그룹의 모든 페이지는 **현재 광장 데이터만** 보여줘야 함.

```ts
import { getCurrentPlaza } from '@/lib/plaza/server'

export default async function Page() {
  const plaza = await getCurrentPlaza()  // 'chuncheon' / 'gangneung' / null
  if (!plaza) return notFound()

  const supabase = await createClient()
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('plaza_id', plaza)   // ← 핵심
}
```

INSERT 시 `plaza_id` 필수.

자세한 가이드: `docs/MULTI_PLAZA_HANDOFF.md`
