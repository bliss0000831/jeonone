# 10 — 알려진 이슈 / TODO / 연기 항목

## 개요

코드의 의도된 미완 / 알려진 한계 / 기술 부채 / 다음 사람이 작업할 항목. 각 항목에 우선순위 / 영향 범위 / 권장 해결 방향 명시.

## 결제 / 보안 (높음)

### A4: PortOne 웹훅 리플레이 방지 (연기)
- **상태**: Phase 1 에서 연기 (PortOne 미발급)
- **위치**: `app/api/billing/webhook/portone/route.ts`
- **영향**: 공격자가 같은 웹훅을 여러 번 보내면 결제 상태 중복 갱신 가능
- **현재 방어**: `payment_webhooks` 테이블의 UNIQUE `(pg_provider, pg_payment_id, event_type)` 로 INSERT 차단
- **부족한 점**: 진짜 PortOne 발신인지 timestamp + nonce 검증 미구현
- **권장**: PortOne 정식 발급 후 X-Webhook-Signature + Webhook-Timestamp 헤더 검증

### D1: CSP enforce 전환 (연기)
- **상태**: 현재 `Content-Security-Policy-Report-Only` 모드
- **위치**: `next.config.mjs:67`
- **권장 절차**:
  1. Production 배포 후 1-2주 모니터 (browser console / Sentry)
  2. inline script / 외부 SDK 위반 보고 수집
  3. CSP 정책 보강
  4. `Content-Security-Policy` (enforce) 로 헤더 키 변경
- **위험**: 잘못 enforce 하면 화면 깨짐. report-only 데이터 충분히 모은 후 진행

## 성능 (Phase 3-B 미진행)

### C1: next/image 마이그레이션
- **상태**: 미진행
- **위치**: 50+ 파일에서 native `<img>` 사용. `components/media-thumbnail.tsx` 가 핵심.
- **이득**: 자동 srcset / AVIF/WebP / lazy loading / LCP 개선
- **위험**: object-fit / 절대 위치 / aspect-ratio 처리 변경 필요. 카드 / 매물 / hero 등 다양한 컨텍스트
- **권장**: 5개 batch 로 분할 PR
  - Batch 1: hero-banner-client + 메인 카드
  - Batch 2: property-card / property-detail
  - Batch 3: clubs / group-buying / local-food 카드
  - Batch 4: chat / 게시판
  - Batch 5: profile / mypage / 나머지

### C2: priority props on LCP candidates
- **상태**: hero-banner-client 만 적용 (`fetchPriority="high"`)
- **남은**: 첫 화면 카드 (홈 매물 1-2개, 광장 추천 등)
- **이득**: LCP 점수 개선
- **권장**: C1 마이그 시 priority prop 같이 추가

### C5: home page RSC 전환
- **상태**: 미진행 (`app/page.tsx` 는 일부 RSC, 일부 Client)
- **위치**: `app/page.tsx`, `app/(plaza)/chuncheon/page.tsx`
- **이득**: 첫 paint 빠름, JS 번들 감소
- **위험**: 인터랙션 (좋아요 / 모달 / 검색 등) 누락 가능. Client component 분리 필요
- **권장**: 단독 PR + Lighthouse 점수 비교 + dev 1주 검증

### C6: /properties RSC + 페이지네이션
- **상태**: 현재 200건 limit + 클라이언트 정렬
- **위치**: `app/api/properties/route.ts:27`
- **이득**: 메모리 / 네트워크 절감, 큰 광장 확장 대비
- **권장**: cursor-based 페이지네이션 + RSC 페이지로 전환

### C7: chat 가상화
- **상태**: 미진행 (천 개 이상 메시지 시 렌더 느림)
- **위치**: `app/(plaza)/chat/[roomId]/page.tsx`
- **권장**: react-virtuoso 또는 Tanstack Virtual 도입

### C8: API projection (`SELECT *` 명시)
- **상태**: `app/api/properties/route.ts` 가 `select('*')` 사용 (의도적 — 코멘트에 "오타 위험 회피" 명시)
- **위치**: `app/api/properties/route.ts:24`
- **고민**: 컬럼 명시 시 dbToProperty 매핑 깨질 가능성
- **권장**: `DbProperty` 타입에 정확히 매칭되는 컬럼만 SELECT. 하지만 type 동기화 부담. 추후 검토.

### C9: Noto Sans KR korean subset
- **상태**: 충족됨 (Noto Sans KR 자체가 한국어 폰트, next/font 자동 처리)
- **결론**: 추가 작업 불필요

### C10: hero banner visibility gating
- **상태**: 미진행
- **위치**: `app/page.tsx`, `components/hero-banner-client.tsx`
- **아이디어**: site_settings 또는 광장 theme 에 `hero_enabled` 토글 추가. false 시 hero 영역 자체 안 렌더 (LCP shift 감소)
- **권장**: 단독 작은 PR

### C3: profile-shell.tsx split
- **상태**: 미진행
- **위치**: `components/profile-shell.tsx`
- **이득**: client/server 경계 명확화, 번들 감소
- **권장**: `ProfileShellServer` (fetch + chrome) + `ProfileShellClient` (인터랙션) 분리

### C4: header-actions.tsx split
- **상태**: 미진행
- **위치**: `components/header-actions.tsx` (또는 비슷한 헤더 컴포넌트)
- **권장**: 알림 / 사용자 메뉴 / 검색 분리 → 각각 lazy load

## UX 보강 (Phase 4 일부 미진행)

### E4: chat missing-post UI
- **상태**: 미진행
- **위치**: `app/(plaza)/chat/[roomId]/page.tsx:188`
- **현상**: 매물/공구 등 원본 글이 삭제됐을 때 채팅방의 contextCard 가 그냥 빈 상태
- **권장**: `loadPostContext` 7개 분기 모두에서 fetch 결과 null 시 `setPostMissing(true)` → contextCard 분기에 placeholder ("원본 글이 삭제되었습니다")

## 운영 / 모니터

### Sentry alert rule
- **상태**: 코드는 자동 캡처 (D5/D6 완료) 되어 있지만 Sentry 콘솔의 알림 룰 미설정
- **권장**: error rate 평소 +20% 시 Slack/이메일 알림 룰 추가

### 매물 / 사용자 통계 dashboard
- **상태**: 어드민 페이지에 일부 통계 (`/admin` 카드들), 본격적 BI 없음
- **권장**: 슈퍼관리자 페이지에 일별 가입 / 매물 / 결제 추이 그래프

## 기술 부채

### `app/layout.tsx` 의 generateMetadata uncached 우회
- **위치**: `app/layout.tsx:15`
- **상태**: favicon 캐시 stale 버그 회피로 unstable_cache 우회 + `?_v=${logoHash}` query 추가
- **권장**: Next.js 업데이트 후 stale 버그 fix 됐는지 확인 → 캐시 다시 활성화

### point_transactions immutable 보장
- **상태**: 트리거 동결 안 됨 (Phase 1 에서 다른 트리거 제거함)
- **위치**: `point_transactions` 테이블
- **현재**: status / reverted_at / reverted_reason 만 RPC 가 UPDATE. 그 외는 INSERT 후 변경 없음 (관행).
- **권장**: BEFORE UPDATE 트리거로 status 외 컬럼 동결 (`local_food_orders` 패턴 참고)

### Type 동기화 (DbProperty 외)
- **상태**: 일부 테이블만 `types/app.ts` 에 타입. 다른 테이블은 inline `any` 또는 ad-hoc.
- **권장**: Supabase CLI 의 `supabase gen types typescript` 도입 → 자동 생성

### 컴포넌트 폴더 정리
- **상태**: `components/` 디렉터리에 100+ 파일 평면 배치
- **권장**: 도메인별 그룹화 (`components/property/`, `components/group-buying/` 등)

### 한국어 → 다국어
- **상태**: 한국어 하드코딩
- **권장**: i18next / next-intl 도입 (장기, 영어/일본어 권역 확장 고려)

## 외부 의존 위험

### NEXT_PUBLIC_* 키 노출
- 카카오 / 네이버 / Supabase anon — 모두 클라이언트 빌드에 포함됨
- 의도적 (anon key 는 RLS 로 보호되므로 안전, 카카오 client key 는 도메인 화이트리스트로 보호)
- **주의**: 시크릿 키를 `NEXT_PUBLIC_` 으로 잘못 prefix 하면 누출

### 카카오 SDK 변경 가능성
- 카카오가 SDK URL / API 변경 시 바로 깨짐
- **방어**: CSP `script-src` 에 `https://t1.kakaocdn.net`, `https://developers.kakao.com` 명시
- **모니터**: 카카오 개발자 공지 정기 확인

### 네이버 지도 API 한도
- 일/월 호출 한도 (요금제별)
- **방어**: `enforceRateLimit('geocode')` 분당 30
- **모니터**: 네이버 클라우드 콘솔 사용량

## 구식 / 정리 후보

### 구 hero banner 시스템
- 마이그 `_hero_banners_extend.sql` 등 누적
- 현재 시스템과 어드민 UI 정리 가능

### 구 chuncheon-only 시드
- 마이그 `_chuncheon_events`, `_seed_chuncheon_dongs` — 멀티-광장 이전 시점
- 다른 광장에는 자동 적용 안 됨 → 광장별 시드 generalize 필요

### secondhand_jobs_moderation 통합
- `_secondhand_jobs_moderation.sql` 마이그가 두 도메인을 합쳐 처리
- secondhand 와 jobs 가 별도 테이블이라 일관성 검토

## 테스트 인프라

### 자동화 테스트 부재
- **상태**: 단위 테스트 / 통합 테스트 거의 없음
- **권장**:
  - Vitest 도입 (lib/services 단위 테스트)
  - Playwright 도입 (핵심 사용자 플로우 E2E)
  - CI 에서 `pnpm test` 통과 강제

### dev 검증 SQL 모음
- **상태**: README 에 산발적 SQL 예시
- **권장**: `docs/handover/sql-cookbook.md` 신설 — 운영 자주 쓰는 SQL 모음

## 다음 단계 우선순위 권장

| 순위 | 항목 | 이유 |
|---|---|---|
| 1 | A4 PortOne 웹훅 리플레이 방지 | 결제 보안 |
| 2 | C2 priority + C10 hero gating | LCP 즉시 개선 |
| 3 | C1 batch 1 (hero/카드) | 이미지 최적화 시작 |
| 4 | E4 chat missing-post UI | UX 개선 |
| 5 | 자동화 테스트 도입 | 회귀 방지 |
| 6 | Type 자동 생성 | 개발 효율 |
| 7 | C5 home RSC | 큰 성능 개선이지만 위험도 높음 |
| 8 | D1 CSP enforce | 데이터 충분히 모은 후 |
| 9 | C7 chat 가상화 | 사용자 늘면 필요 |
| 10 | C3/C4 split | 점진 가능 |

## 7-Pass Audit 결과 (Phase 3-A 시점)

### Pass 1: 인증 / Rate limit / 광장 필터 ✅
- 모든 mutation 라우트에 `auth.getUser` 호출
- webhook 라우트는 서명 검증 (PortOne / fal.ai HMAC)
- Phase 4 E2/E3 에서 7개 라우트에 enforceRateLimit 추가
- 광장 필터 누락 없음 (admin/users 는 plaza_profiles 활용)

### Pass 2: SQL safety / `.or()` injection ⚠️ → ✅ 적용
- 발견: `app/api/jobs/route.ts`, `app/api/secondhand/route.ts` 의 검색 q 가 sanitize 안 됨
- PostgREST `.or()` 의 ',' '(' ')' 가 syntax 라 사용자 입력 깨뜨릴 수 있음
- **적용한 fix**: `q.replace(/[,()]/g, '').slice(0, 100)` 으로 sanitize
- search/route.ts 는 이미 `esc()` 함수로 처리됨
- board/stats 는 Phase 1 에서 이미 fix

### Pass 3: TOCTOU ⚠️ (낮은 위험)
- `MONTHLY_LIMIT_NON_AGENT` 매물 등록 한도 (2건) 가 count → INSERT 패턴
- 매물은 사용자 의도적 행동 (clubs join 처럼 빠른 클릭 X)
- 한도 위반 1-2개 추가는 큰 문제 아님
- **결론**: 알려진 한계로 기록. atomic RPC 적용은 침습적. 추후 검토.

### Pass 4: N+1 / 큰 limit 쿼리 ⚠️ → 알려진 항목
- `/api/properties` 200건 limit (페이지네이션 미도입)
- `/api/admin/approved-accounts` 500건 limit (어드민이 한 번에 보길 원함, 의도적)
- **이미 known-issues C6 에 기록됨**. cursor 기반 페이지네이션 필요.

### Pass 5: 캐시 / 이미지 / 미디어 ✅
- API 라우트의 Cache-Control 잘 설정됨 (admin private / public 적절히)
- Hero banner 의 `fetchPriority="high"` 적용됨
- next/image 마이그레이션은 known-issues C1 에 기록됨

### Pass 6: 멀티테넌시 격리 ✅
- `profiles.plaza_id` 잘못된 참조 — Phase 1 에서 모두 fix
- admin/users 가 plaza_profiles 사용으로 정상화
- 그 외 라우트 광장 필터 정상

### Pass 7: error.message 노출 ✅
- 대부분의 라우트는 일반 에러 메시지 ("처리에 실패했습니다") 사용
- `/api/health` 만 `error.message.slice(0, 100)` (운영자 대상이라 OK)
- Phase 1 검증 중 발견된 누출 (properties POST, expert-invitations DELETE) 모두 fix

## Audit 종합 결론

**즉시 적용한 fix**: 1건 (.or() sanitize on jobs/secondhand)

**권장 후속 작업** (10-known-issues 의 기존 항목과 병합):
- 매물 monthly limit atomic RPC 화 (낮은 우선순위)
- 페이지네이션 도입 (C6, 중간 우선순위)
- next/image 마이그 (C1, 큰 작업)

**더 이상 발견 안 되는 보안 주제**:
- RLS 회피, SQL injection, cross-plaza, 시크릿 노출 — 모두 안전.

## 다음 읽을 문서

- 마이그 적용 절차 → `11-deployment.md`
