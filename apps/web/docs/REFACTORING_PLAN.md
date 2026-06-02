# Refactoring Plan

이 문서는 **점진적으로** 진행해야 할 refactoring 항목을 정리합니다.
한 번에 PR 1개씩, 빌드 + 수동 테스트 후 머지하는 흐름을 권장합니다.

## God Components 분할 (8-16 시간)

### 1. `components/header.tsx` (1047 줄)

**현재 책임**:
- Logo / branding
- Desktop navigation menu
- 광장 / hub 분기 로직
- Search box
- Notification bell
- Invitation bell
- User menu (login/logout/profile)
- Mobile drawer
- Theme color 적용
- 광장 정보 카드 (popover)

**제안 분할** (각각 별도 파일, header.tsx 는 조립만):

```
components/header/
├── header.tsx                  ← 조립 (~150 줄)
├── header-logo.tsx             ← 로고 + plaza name (~50 줄)
├── header-desktop-nav.tsx      ← 데스크톱 메뉴 (~200 줄)
├── header-mobile-drawer.tsx    ← 모바일 햄버거 메뉴 (~250 줄)
├── header-user-menu.tsx        ← 사용자 dropdown (~150 줄)
├── header-search.tsx           ← 검색 바 (~80 줄)
└── header-plaza-info-popover.tsx  ← 광장 정보 카드 (~150 줄)
```

**주의**:
- 현재 `useSiteBranding`, `useUserLocation` 등 hook 의존성 많음 — 자식 컴포넌트는
  prop drilling 또는 context 활용
- 모바일 drawer 의 open/close 상태는 부모 (header.tsx) 에서 관리하고 props 로 전달
- 빌드 후 모바일/데스크톱 모두 수동 테스트 필요

### 2. `components/home-page.tsx` (1034 줄)

**현재 책임**:
- Hero carousel (배너 슬라이드)
- AI video 위젯
- 공지사항 카드
- 추천 매물 그리드
- 카테고리 탭
- 우리동네 위젯 (chuncheon-news, plaza-live-widget)
- 인기 매물 목록
- 신규 매물 목록

**제안 분할**:

```
components/home/
├── home-page.tsx                  ← 조립 (~100 줄)
├── home-hero-carousel.tsx         ← 배너 슬라이드 (~250 줄)
├── home-ai-video-widget.tsx       ← AI 영상 위젯 (~100 줄)
├── home-announcements.tsx         ← 공지 카드 (~80 줄)
├── home-property-grid.tsx         ← 매물 그리드 (재사용 — sort 별로 props) (~150 줄)
├── home-category-tabs.tsx         ← 카테고리 탭 (~100 줄)
└── home-neighborhood-section.tsx  ← 우리동네 위젯 묶음 (~200 줄)
```

**주의**:
- props 로 properties 배열을 받는 형태로 변경 (현재는 모두 prop)
- 카테고리 탭 클릭 시 useState 관리 — 그대로 유지

### 3. `components/profile/profile-shell.tsx` (1519 줄)

**현재 책임**:
- 프로필 헤더 (avatar / 닉네임 / 팔로워 수)
- Tab 시스템 (작성글, 저장, 리뷰, 통계)
- 각 탭별 데이터 fetch (11개 카테고리 저장 등)
- followers 모달
- reviews 모달 (이미 분리됨: `profile/reviews-modal.tsx`)
- 통계 차트
- 편집 버튼

**제안 분할**:

```
components/profile/
├── profile-shell.tsx              ← 조립 + 탭 관리 (~200 줄)
├── profile-header.tsx             ← 헤더 카드 (~100 줄)
├── profile-tab-posts.tsx          ← 작성글 탭 내용 (~250 줄)
├── profile-tab-saved.tsx          ← 저장 탭 (11개 카테고리) (~350 줄)
├── profile-tab-reviews.tsx        ← 리뷰 탭 (~150 줄)
├── profile-tab-stats.tsx          ← 통계 탭 (~150 줄)
├── profile-followers-modal.tsx    ← 팔로워 모달 (~100 줄)
├── profile-services-section.tsx   ← 서비스 카드 (~100 줄)
└── profile-reviews-modal.tsx      ← 이미 존재 (유지)
```

**주의**:
- 탭별 데이터 fetch 는 lazy 하게 (탭 클릭 시 fetch) — 현재 useEffect deps 살펴볼 것
- `withPlaza()` 패턴은 각 탭 컴포넌트에 그대로 전달

## 진행 권장 순서

1. **헤더 분할** — 가장 visible 한 컴포넌트, 회귀 빨리 발견 가능
2. **홈 페이지 분할** — hero carousel 독립적
3. **프로필 분할** — 가장 복잡, 마지막에

각 단계마다:
- [ ] 새 컴포넌트 파일 생성 + 코드 옮김
- [ ] 부모에서 import 갱신
- [ ] `pnpm build` 통과 확인
- [ ] 로컬에서 직접 클릭하며 회귀 테스트
- [ ] PR 머지 → Vercel 배포 확인

## 시간 추정

| 컴포넌트 | 줄수 | 예상 시간 |
|----------|-----|----------|
| header.tsx | 1047 | 4~6시간 |
| home-page.tsx | 1034 | 3~5시간 |
| profile-shell.tsx | 1519 | 6~10시간 |
| **합계** | **3600** | **13~21시간** |

## 자동화 도구 권장

- **VS Code "Extract Component" refactoring** (활성화 필요)
- **eslint-plugin-react** + `react/jsx-max-depth` 룰
- 분할 후 `npx jscpd` 로 중복 코드 검사
