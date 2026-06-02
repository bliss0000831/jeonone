# 홈 카테고리 미니네비 — 파랑 그라데이션 (한 줄 가로 스크롤 버전, v2)

> 사용자가 "파랑 그라데이션 색깔로 되돌려줘" 라고 하면 이 스냅샷을 적용하세요.
>
> 이 버전은 한 줄 가로 스크롤 + 우측 펄스 화살표 chip 디자인입니다.
> (원형 4×2 그리드 버전은 `home-mininav-blue-gradient.md` 참고)

## 시각 특징
- 진한 파랑 그라데이션 배경 (`var(--primary)` 기반, 좌측이 30% 어두움)
- 흰 반투명 원형 아이콘 + 라벨 한 줄 가로 스크롤
- 우측 펄스 화살표 chip (모바일 overflow 시)
- PC overflow 없을 때 가운데 정렬, 화살표 숨김
- 배너 이미지 배경 **사용 안 함**

## 되돌리는 방법

### 1) `components/category-mini-nav.tsx` — 배경 분기 제거

현재(이미지 배경 지원) 버전의 다음 블록을 찾아서:

```tsx
<div
  className="relative text-white isolate"
  style={
    backgroundImageUrl
      ? undefined
      : {
          background:
            'linear-gradient(to right, color-mix(in srgb, var(--primary) 70%, black 30%), var(--primary))',
        }
  }
>
  {/* 배너 이미지 배경 — 있으면 사용 */}
  {backgroundImageUrl && (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={backgroundImageUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover -z-10"
      />
      {/* 배너보다 더 어두운 오버레이 (가독성 + 구분감) */}
      <div className="absolute inset-0 -z-10 bg-black/55" />
    </>
  )}
  <div className="max-w-2xl md:max-w-5xl mx-auto py-2.5 px-4 relative">
```

아래 코드로 교체:

```tsx
<div
  className="text-white"
  style={{
    background:
      'linear-gradient(to right, color-mix(in srgb, var(--primary) 70%, black 30%), var(--primary))',
  }}
>
  <div className="max-w-2xl md:max-w-5xl mx-auto py-2.5 px-4 relative">
```

그리고 props 시그니처에서 `backgroundImageUrl` 제거 (또는 무시해도 무방):

```tsx
export function CategoryMiniNav({ items }: { items: MiniNavItem[] }) {
```

### 2) `components/home-page.tsx` — 호출부 단순화

다음을:

```tsx
<CategoryMiniNav
  backgroundImageUrl={banners[bannerIndex]?.image_url || null}
  items={[ ... ]}
/>
```

이렇게 변경:

```tsx
<CategoryMiniNav
  items={[ ... ]}
/>
```

> Note: `bannerIndex` state 와 `HeroBannerClient` 의 `currentIndex` / `onIndexChange` props 는 그대로 두어도 무해합니다. (완전 정리하고 싶다면 같이 제거 가능)

## 핵심 색상 값 (직접 지정용)
- 배경 그라데이션:
  ```css
  linear-gradient(to right,
    color-mix(in srgb, var(--primary) 70%, black 30%),
    var(--primary)
  )
  ```
- 광장 primary 컬러는 `app/globals.css` 또는 plaza theme 에서 정의됨

## 적용일
2026-05-04 — 배너 이미지 배경 도입 직전 시점의 디자인
