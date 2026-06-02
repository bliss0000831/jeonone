# 광장 (Gwangjang) — Monorepo

Korean local community + real estate platform.

## 구조

```
gwangjang/
├── apps/
│   ├── web/        ← Next.js 16 + Capacitor (현재 production)
│   └── mobile/     ← Expo React Native (Phase 2 — 채팅/마이페이지)
└── packages/       ← M4~M9 단계에서 점진 추출
    ├── platform   (lib/native — Capacitor/RN 환경 추상화)
    ├── features   (도메인 비즈니스 로직)
    ├── types      (공유 TS 타입)
    ├── tokens     (디자인 토큰)
    ├── api-client (Supabase 호출 추상화)
    └── auth       (카카오 + Supabase Auth, web/native 분기)
```

## 기본 명령

```bash
pnpm install         # 모든 워크스페이스 설치
pnpm dev             # apps/web 개발 서버
pnpm build           # apps/web 빌드
pnpm typecheck       # apps/web 타입 체크
pnpm cap:sync        # Capacitor (Android/iOS) 동기화
```

## 모노레포 마이그레이션 진행 (M1~M9)

| 단계 | 상태 | 내용 |
|---|---|---|
| M1 | ✅ | pnpm workspaces + tsconfig.base 골격 |
| M2 | ✅ | apps/web/ + packages/ 폴더 골격 |
| M3 | ✅ | 광장 코드 전체를 apps/web/ 로 이동 |
| M4~M9 | 🟡 진행 예정 | packages/* 점진 추출 |

## Apps

### `apps/web`

기존 광장 Next.js 사이트 + Android Capacitor 앱.

```bash
cd apps/web
pnpm dev                # localhost:3000
pnpm cap:sync           # Android assets 동기화
```

자세한 내용은 `apps/web/README.md` 참고.

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind v4
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Hybrid App**: Capacitor 8 (live URL mode → https://www.gwangjang.app)
- **Mobile (Phase 2)**: Expo + React Native
- **Hosting**: Vercel
- **Storage**: Cloudflare R2
