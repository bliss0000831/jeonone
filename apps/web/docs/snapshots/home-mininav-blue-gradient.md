# 홈 카테고리 미니네비 — 파랑 그라데이션 원형 아이콘 (원본 스냅샷)

이 디자인은 사용자가 "되돌려줘" 라고 요청할 수 있는 보존본입니다.
파일: `components/home-page.tsx` 의 카테고리 미니네비 섹션을 아래 코드로 교체하세요.

## 시각 특징
- 진한 파랑 그라데이션 배경 (광장 primary 컬러 기반)
- 흰 반투명 원형 아이콘 8개 (4x2 그리드 모바일 / 1x8 PC)
- 라벨 흰색 작은 글씨, 아이콘 아래

## 원본 코드

```tsx
{/* 게시판 섹션 - 광장 테마 primary 색상 (--primary CSS var) */}
<div
  className="text-white"
  style={{
    background:
      'linear-gradient(to right, color-mix(in srgb, var(--primary) 70%, black 30%), var(--primary))',
  }}
>
  <div className="max-w-7xl mx-auto px-4 py-2.5">
    <div className="grid grid-cols-4 md:grid-cols-8 gap-y-2 gap-x-1 max-w-2xl md:max-w-5xl mx-auto">
      {[
        { href: "/board",        icon: MessageSquare, iconKey: "home.minimav.board.icon",        label: "게시판" },
        { href: "/secondhand",   icon: ShoppingCart,  iconKey: "home.minimav.secondhand.icon",   label: "중고거래" },
        { href: "/sharing",      icon: HandHeart,     iconKey: "home.minimav.sharing.icon",      label: "나눔" },
        { href: "/clubs",        icon: UserCircle2,   iconKey: "home.minimav.clubs.icon",        label: "모임" },
        { href: "/local-food",   icon: Leaf,          iconKey: "home.minimav.local_food.icon",   label: "로컬푸드" },
        { href: "/group-buying", icon: Users,         iconKey: "home.minimav.group_buying.icon", label: "공동구매" },
        { href: "/jobs",         icon: Briefcase,     iconKey: "home.minimav.jobs.icon",         label: "구인구직" },
        { href: "/new-store",    icon: Store,         iconKey: "home.minimav.new_store.icon",    label: "신장개업" },
      ].map(({ href, icon: Icon, iconKey, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          className="group flex flex-col items-center gap-1 py-1 active:scale-95 transition-transform"
        >
          <EditableIcon
            iconKey={iconKey}
            fallback={Icon}
            tileClassName="w-9 h-9 rounded-full bg-white/15 group-hover:bg-white/25 transition-colors"
            iconClassName="w-[18px] h-[18px]"
          />
          <span className="text-[11px] font-medium leading-none">{label}</span>
        </Link>
      ))}
    </div>
  </div>
</div>
```

## git 으로 빠르게 되돌리는 방법
```
git show fdd210b:components/home-page.tsx > /tmp/old-home.tsx
# 또는 해당 섹션만 복사
```

또는 사용자가 사진 보여주면서 "이거로 되돌려" 라고 하면 위 코드로 교체.
