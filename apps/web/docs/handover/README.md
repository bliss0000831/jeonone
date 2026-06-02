# 광장 (Gwangjang) 코드 인계 문서

> 신규 개발자 / 인수인계 / 외주 협업용 문서. 시스템 동작과 구조를 깊이 있게 설명한다.

## 누구를 위한 문서인가

- **신규 합류 개발자**: 첫 1~2주 동안 시스템 구조를 이해하고 첫 PR을 자신 있게 올릴 수 있게.
- **외주/협력 개발자**: 특정 기능만 작업할 때 그 기능 영역만 빠르게 파악.
- **운영자/관리자**: 어드민 권한 / 점검 모드 / cron / 모니터링 동작 이해.

## 어떻게 읽을까

| 처음 들어오면 | 기능을 추가하려면 | 운영을 하려면 |
|---|---|---|
| 00 → 01 → 02 → 03 | 04 + 해당 05/* | 06/* + 11 |

## 인덱스

### 시작하기
- [00. Quick Start (첫날 30분 가이드)](./00-quick-start.md)

### 시스템 기반
- [01. 아키텍처 / 스택 / 폴더 구조](./01-architecture.md)
- [02. 멀티 광장 (멀티테넌시) 모델](./02-multi-plaza.md)
- [03. 인증 / RLS / 관리자 계층](./03-auth-permissions.md)
- [04. 데이터 모델](./04-data-model.md)

### 기능 모듈 (`05-features/`)
- [부동산 매물](./05-features/property.md)
- [공동구매](./05-features/group-buying.md)
- [모임 (Clubs)](./05-features/clubs.md)
- [로컬푸드 직거래](./05-features/local-food.md)
- [게시판 / 구인구직](./05-features/board-jobs.md)
- [서비스 (인테리어/청소/이사/수리)](./05-features/services.md)
- [채팅](./05-features/chat.md)
- [결제 (PortOne / mock-pay)](./05-features/payments.md)
- [포인트 시스템](./05-features/points.md)

### 운영 (`06-operations/`)
- [광장 어드민](./06-operations/admin.md)
- [슈퍼 어드민](./06-operations/super-admin.md)
- [Cron Jobs](./06-operations/cron-jobs.md)
- [점검 모드 (Maintenance)](./06-operations/maintenance.md)

### 인프라 / 보조
- [07. 외부 연동 (PortOne / R2 / Sentry / Maps)](./07-integrations.md)
- [08. 환경변수 전수](./08-environment.md)
- [09. 마이그레이션 히스토리](./09-migrations.md)
- [10. 알려진 이슈 / TODO / 연기 항목](./10-known-issues.md)
- [11. 배포 절차 (Vercel + Supabase + R2)](./11-deployment.md)
- [12. 비즈니스 용어집 (광장, 이웃별 등)](./12-glossary.md)
- [13. 코딩 컨벤션 / 패턴 가이드](./13-coding-conventions.md)

## 문서 작성 원칙

- **Why** 우선 — 왜 그렇게 만들었는지부터.
- **핵심 파일 경로 표시** — `lib/services/ratelimit.ts:15` 처럼 정확히.
- **시퀀스 플로우** — 주문 결제 같은 다단계 흐름은 단계별로.
- **주의점 (Gotchas)** — 다음 사람이 깨뜨릴 만한 곳 명시.

## 문서가 stale 됐을 때

코드 수정 시 관련 문서도 같이 업데이트하는 걸 PR review 체크리스트에 포함 권장. 마이그레이션은 추가 시 `09-migrations.md` 에 한 줄 추가.
