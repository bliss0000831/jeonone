# 11 — 배포 절차

## 개요

광장의 production 배포 흐름. Vercel + Supabase + Cloudflare R2 + Sentry 4개 인프라가 협조해 동작. 머지 → 자동 빌드 → 배포 → 검증의 표준 절차와 롤백 방법.

## 인프라 맵

```
GitHub (main)
   ↓ webhook
Vercel
   ├ build (Next.js)
   ├ Sentry source map upload (SENTRY_AUTH_TOKEN 있을 시)
   └ deploy → Edge / Lambda / 서울 region
        ↓ 외부 호출
        ├ Supabase (Postgres + Auth + Realtime)
        ├ Cloudflare R2 (이미지 / 동영상)
        ├ Upstash Redis (rate limit)
        ├ Sentry (에러)
        ├ PortOne (결제)
        ├ 카카오/네이버 (지도/로그인)
        └ Tour API (관광 이벤트 cron)
```

## 표준 배포 흐름

### 1. PR 머지 → main
GitHub PR 머지 시 main 에 새 commit. Vercel 이 webhook 받아 자동 빌드 시작.

### 2. Vercel 빌드
- `pnpm install`
- `pnpm build` (Next.js 16 + Turbopack 또는 webpack)
- 환경변수 적용 (Vercel 콘솔 설정)
- Sentry source map 업로드 (`SENTRY_AUTH_TOKEN` 있을 시)
- VERCEL_GIT_COMMIT_SHA → Sentry release 태그

### 3. 배포
- production: `https://gwangjang.app/` + 모든 광장 서브도메인
- 일부 정적 자원은 Edge, 일부 SSR 은 Lambda
- 동시 deployment 두 개 가능 (이전 + 신규) — Vercel 이 트래픽 라우팅

### 4. 마이그레이션 적용 (수동)
Vercel 빌드는 마이그를 자동 적용하지 않음. 별도로:
```bash
supabase db push
```

순서 권장:
- 코드가 새 컬럼/테이블/RPC 의존하면 → **마이그 먼저, 코드 머지 나중**
- 또는 **점검 모드 → 마이그 → 코드 → 점검 해제**

### 5. 배포 후 검증
- `/api/health` 200
- 핵심 라우트 smoke test (홈 / 매물 / 채팅)
- Sentry UI 에서 새 release 표시 확인

## 환경별 배포

### Production (`gwangjang.app`)
- main 브랜치 머지 → 자동
- 도메인: `https://gwangjang.app/` + `https://*.gwangjang.app/`
- robots: 광장별 페이지만 index, 어드민/슈퍼/auth 등 noindex (자동)
- VERCEL_ENV = "production"

### Preview (PR / 개발 브랜치)
- 모든 PR 마다 자동 preview URL
- robots: noindex / nofollow (자동, `app/layout.tsx` 의 robots metadata)
- Supabase / R2 등은 production 과 동일 또는 별도 dev 프로젝트
- VERCEL_ENV = "preview"

### Development (로컬)
- `pnpm dev`
- localhost:3000
- `?plaza=chuncheon` 또는 `dev-plaza` 쿠키로 광장 진입
- VERCEL_ENV 미주입 → NODE_ENV = "development"

## 마이그레이션 적용

### 로컬 dev DB
```bash
supabase db reset       # 모든 마이그 재실행 (데이터 날아감)
supabase migration up   # 미적용 마이그만
```

### Production DB
```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

### 안전 절차 (위험한 마이그)
1. 점검 모드 ON (`MAINTENANCE_MODE=true` Vercel env + 재배포 트리거)
2. DB backup (Supabase Dashboard > Database > Backups)
3. 마이그 적용
4. 검증 SQL (예: `SELECT COUNT(*) FROM new_table` / `EXPLAIN` 으로 인덱스 확인)
5. 점검 모드 OFF
6. 모니터 (Sentry / health)

### 마이그 적용 실패 시
- 로그 확인 (`supabase db push` 출력)
- 일부 마이그만 적용된 상태이면 → 수동 정리 필요
- BEGIN/COMMIT 으로 감싸있어 부분 실패 시 자동 롤백

## R2 설정

### Bucket 생성 (1회)
1. Cloudflare R2 > Create bucket
2. 이름: production / dev 분리
3. CORS 설정:
```json
[
  {
    "AllowedOrigins": ["https://gwangjang.app", "https://*.gwangjang.app"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```
4. Public access: 의도된 폴더만 (또는 worker 통해 라우팅)
5. Lifecycle: 90일 미사용 미디어 cold tier 이동 (선택)

### Custom domain (권장)
`https://media.gwangjang.app/` 등 사용자 정의 도메인 매핑. R2 settings > Custom domains.

## Sentry 설정

### 1. 프로젝트 생성
Sentry > Create Project > Next.js 선택

### 2. DSN 복사
- `NEXT_PUBLIC_SENTRY_DSN` (client)
- `SENTRY_DSN` (server)

### 3. Source map upload
- `SENTRY_AUTH_TOKEN` 발급 (Settings > Auth Tokens)
- Vercel env 추가
- 다음 빌드부터 자동 업로드

### 4. release 태깅
- `VERCEL_GIT_COMMIT_SHA` 자동 (next.config.mjs 가 처리)

### 5. 알림 룰 (Sentry 콘솔)
- error rate 평소 +20% → Slack/이메일
- 새 issue → 즉시 알림
- 특정 tag (예: `cron`) → 별도 채널

## DNS / 광장 서브도메인

### 와일드카드 설정
DNS 에서 `*.gwangjang.app` → Vercel 의 IP / CNAME.

광장 추가 시 DNS 변경 없음 (와일드카드라 자동).

Vercel 콘솔의 Domains 에서 각 광장별로 확인:
- `gwangjang.app` (apex)
- `chuncheon.gwangjang.app`
- `gangneung.gwangjang.app`
- ...

## 배포 후 체크리스트

```
배포 직후 (5분 내):
  ☐ /api/health 200
  ☐ 홈페이지 렌더링 (status 200)
  ☐ 매물 / 모임 / 공구 목록 페이지 OK
  ☐ 로그인 → 마이페이지 OK
  ☐ Sentry UI 에 새 release 표시

30분 내:
  ☐ Sentry error rate 평소 수준
  ☐ 핵심 mutation (매물 등록 / 채팅 / 좋아요) smoke test
  ☐ 광장 어드민 페이지 진입 OK

24시간 내:
  ☐ Sentry 누적 에러 평소와 비교
  ☐ 결제 (실 또는 mock) 정상
  ☐ Cron firing 정상 (Vercel cron logs)
  ☐ 모니터링 그래프 (Vercel Analytics, Supabase, Upstash)
```

## 롤백

### Vercel 1-click 롤백
1. Vercel 콘솔 > Deployments
2. 이전 안정 deployment 선택
3. "Promote to Production" 클릭
4. 즉시 트래픽 전환

### DB 롤백
- 마이그 forward-only 권장이지만 위험 시
- 각 마이그 파일 하단의 rollback SQL 실행
- 또는 backup 으로 PITR (Supabase Dashboard)

### env 롤백
1. Vercel 콘솔에서 env 값 되돌림
2. 재배포 트리거 (빈 commit push 또는 Vercel "Redeploy")

### 결제 / 데이터 손상 의심
1. **즉시 점검 모드 ON** (`MAINTENANCE_MODE=true` env + 재배포)
2. DB backup
3. 영향 범위 분석 (Supabase Studio SQL)
4. 수동 정정
5. 점검 해제

## 새 광장 추가 절차 (운영)

### 1. plazas INSERT
```sql
INSERT INTO plazas (id, name, parent_region, center_lat, center_lng, is_active, is_open_soon, sort_order)
VALUES ('daejeon', '대전광장', '충청권', 36.350, 127.385, false, true, 30);
```

### 2. DNS / Vercel
- DNS 와일드카드라 자동 또는
- 명시적 도메인 등록 (Vercel Domains)

### 3. 광장 어드민 임명
```sql
INSERT INTO plaza_admins (user_id, plaza_id, role)
VALUES ('<admin-user-id>', 'daejeon', 'admin');
```

### 4. PortOne 채널 (결제 시)
- 슈퍼관리자 콘솔 `/super-admin/plaza-payments` 에서:
- store_id / channel_key / business_number 등 입력
- payments_enabled = true

### 5. 활성화
```sql
UPDATE plazas SET is_active = TRUE, is_open_soon = FALSE WHERE id = 'daejeon';
```

### 6. 검증
- `https://daejeon.gwangjang.app/` 진입
- 가입 → plaza_profiles INSERT 확인
- 매물 / 게시판 / 모임 등 기능 동작

## env 변경 → 재배포

env 만 바꿔도 이미 배포된 코드에는 안 적용됨. 재배포 필요:

### 옵션 1: Vercel 콘솔 "Redeploy"
- Deployments > 최신 > "..." > Redeploy

### 옵션 2: 빈 commit
```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

## Cron 설정

### Vercel cron (vercel.json)
```json
{
  "crons": [
    { "path": "/api/cron/group-buying-auto-process", "schedule": "0 * * * *" },
    { "path": "/api/cron/evaluate-points", "schedule": "*/15 * * * *" },
    ...
  ]
}
```

### Vercel 콘솔 확인
Settings > Cron Jobs 에서 활성/비활성, 마지막 firing 결과 확인 가능.

### 외부 cron 추가 옵션
GitHub Actions / Render / Railway 등에서 `Authorization: Bearer $CRON_SECRET` 으로 호출 가능.

## 모니터 / 운영

### Daily 체크
- /api/health
- Sentry error rate
- Vercel deployment 상태
- Supabase storage / DB 사용량
- Upstash Redis 사용량 (rate limit)

### Weekly 체크
- DB backup 정상
- 광장별 활성 사용자 수
- 결제 통계
- R2 사용량 + 비용

### Monthly 체크
- 외부 API 비용 (네이버 / 카카오 / fal.ai / PortOne)
- Vercel 배포 / 함수 호출 비용
- Sentry 사용량 한도

## 흔한 배포 문제

### "Module not found" 빌드 에러
- pnpm-lock.yaml 변경 빠뜨림 → 의존성 추가 후 commit 필수
- Node 버전 불일치 → `package.json` engines 또는 `.nvmrc`

### 환경변수 누락으로 빌드 통과 / 런타임 실패
- env 추가 후 재배포 의무
- env 검증 스크립트 (선택) — 빌드 시 필수 키 체크

### Supabase RLS 정책 변경 후 마이그 적용 안 됨
- `NOTIFY pgrst, 'reload schema'` 빠뜨림 → schema cache stale
- Supabase Dashboard > Database > Reload schema 수동 트리거

### Sentry release 태그 안 나옴
- VERCEL_GIT_COMMIT_SHA 가 dev에선 비어있음 (정상)
- production 빌드에선 자동 주입 — 안 나오면 next.config 의 sentryOptions 확인

## 다음 읽을 문서

- 마이그 작성 / 시점별 의도 → `09-migrations.md`
- 환경변수 → `08-environment.md`
- 알려진 이슈 → `10-known-issues.md`
