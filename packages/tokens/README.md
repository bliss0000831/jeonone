# `@gwangjang/tokens`

광장 **디자인 토큰** — RN 용 TS 객체로 제공.

## ⚠️ 단일 소스 정책 (M7)

광장 모노레포는 **dual-source 토큰 관리** 채택:

| 환경 | 캐노니컬 | 형식 |
|---|---|---|
| 웹 | `apps/web/app/globals.css` | CSS 변수 + Tailwind v4 `@theme inline` |
| RN | **이 패키지** | TypeScript 객체 |

양측 값은 **수동으로 일치 유지**. Phase 2 RN 안정화 후 통합 검토 (codegen 또는 단일 JSON → 양쪽 빌드).

토큰 변경 시: 양쪽 모두 업데이트. 본 파일 각 토큰 옆 globals.css 줄 번호 명시 (변경 시 빠른 위치 찾기).

## 사용

```ts
import {
  lightColors, darkColors, getColors,
  fontSize, fontWeight, lineHeight, letterSpacing,
  spacing, semanticSpacing,
  radius,
  shadows,
} from "@gwangjang/tokens"

// 또는 모듈별:
import { getColors } from "@gwangjang/tokens/colors"
import { fontSize } from "@gwangjang/tokens/typography"

// RN StyleSheet 예시:
const colors = getColors("light")
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    padding: spacing[4],
    borderRadius: radius.lg,
    ...shadows.md,
  },
  price: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.ink900,
  },
})
```

## 모듈

| 서브패스 | 책임 | RN 용 형식 |
|---|---|---|
| `/colors` | light + dark 컬러 (background, primary, ink-* 등) | hex string |
| `/typography` | Pretendard, fontSize/Weight/LineHeight/letterSpacing | px (RN 표준) |
| `/spacing` | Tailwind 매칭 간격 (1=4px, 2=8px, ...) | px |
| `/radius` | 모서리 반경 (sm/md/lg/xl) | px |
| `/shadows` | 그림자 (RN shadowColor/Offset + Android elevation) | RNShadow 객체 |

## OKLCH → hex 변환 정확도 한계

웹 globals.css 는 oklch 색공간 사용. 픽셀 정확 변환은 culori 같은
색공간 라이브러리 필요. 현재 값은:
- 코드 주석에 명시된 근사값 (예: "#0ea5e9 근사")
- Tailwind 표준 팔레트 매칭 (sky-500, orange-500, red-600)

Phase 2 RN 화면 비교 시 디자이너 검수 → ±10 hex 단위 미세 조정 가능.

## 원칙

- **의존성 0** — 순수 TS 객체. 런타임 의존 X.
- web 측은 globals.css 그대로 (이 패키지 사용 X).
- RN 측은 이 패키지의 토큰을 StyleSheet 에 직접 사용.
- web 디자인 변경 시 → globals.css 우선 → 이 파일 동기화 → PR.
