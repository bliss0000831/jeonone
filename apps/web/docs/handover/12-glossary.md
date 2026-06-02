# 12 — 비즈니스 용어집 (Glossary)

> 신규 개발자가 코드 곳곳에서 만나는 한국어 비즈니스 용어를 빠르게 이해할 수 있게 정리.

## 멀티테넌트 / 지역

### 광장 (Plaza)
지역 단위 테넌트. 각 광장은 자체 서브도메인을 가진다 (`chuncheon.gwangjang.app`, `gangneung.gwangjang.app` 등). DB에서는 `plazas` 테이블의 `id` (TEXT PK) 로 식별. `chuncheon`, `gangneung`, `wonju` 등 한국 지역 ID를 사용. 사용자는 광장마다 별도 가입(`plaza_profiles`)하지만 `auth.users` / `profiles` 는 전역 1개.

### 허브 (Hub)
루트 도메인 (`gwangjang.app`). 광장 진입 전 안내 / 광장 선택 페이지. 멀티-광장 인덱스 역할. middleware 가 `host` 를 보고 광장이 아니라고 판단되면 hub 로 라우팅.

### 동네 / 지역 (region / dong)
광장 *내부* 의 하위 분류. 예: 춘천광장 안의 "효자동", "온의동" 등. `regions` 테이블 또는 `koreaRegions` 상수에서 관리. 광장과 다르게 격리되지 않음 — 같은 광장 안 모든 동네가 한 광장으로 묶임. 사용자의 거주 동네는 `profiles.location` 에 저장.

### 본거지 / 동네 설정
사용자가 자신의 거주 동네를 설정. UI 의 "동네 설정" 버튼으로 변경 가능. 매물 검색 시 "내 주변" 필터링에 사용.

## 사용자 유형 (account_type)

### 일반인 (`individual`)
기본 계정 유형. 대부분의 사용자가 여기 해당. 매물 등록은 월 2건 한도 (`MONTHLY_LIMIT_NON_AGENT`).

### 사장님 (`business`)
일반 자영업자 / 가게 운영자. 신장개업 / 게시판 등에서 노출.

### 공인중개사 (`agent`)
부동산 중개업자. 매물 등록 무제한 (직업이라 N건 자연스러움). 매물 카드의 "중개" 뱃지로 표시. 인증 절차가 별도로 있을 수 있음 (account-requests).

### 생산자 (`producer`)
로컬푸드 직거래 판매자. `producer_settlements` 테이블에 정산 계좌(KYC) 등록 필수.

### 인테리어 / 이사 / 청소 / 수리 (`interior` / `moving` / `cleaning` / `repair`)
서비스 업종 4종. 각각 동일 패턴의 게시판/요청 시스템을 가짐.

### 슈퍼관리자 / 관리자
- `profiles.role = 'superadmin'` (legacy) 또는 `plaza_admins.role = 'super'` 가 슈퍼관리자.
- `profiles.role = 'admin'` 또는 `plaza_admins` 의 다른 role 이 광장 어드민.
- 슈퍼관리자는 모든 광장 어드민 페이지 접근 가능.

## 신뢰 / 평판

### 이웃 별 (Neighbor Star)
사용자 평점. 1~5점 별 5개 시스템. 이전엔 "신뢰지수 36.5°C" 같은 체온 비유 시스템이었지만 2026-04 마이그(`20260618000000_neighbor_star_system.sql`) 에서 5점 별점으로 교체. `profiles.trust_score` (NULL = 후기 없음) + `profiles.review_count` 로 저장.

### 후기 (Review)
거래/모임 종료 후 작성. `reviews` 테이블. 응답 속도 / 정확성 / 친절함 3개 항목 1~5점 → 평균 = 별점. 한 거래당 1번 (UNIQUE index on `reviewer_id + source_type + source_id`).

### 평판 점수 (reputation_score)
포인트 시스템 내부 점수. `user_points.reputation_score`. 신고/회수 시 -10. 너무 낮으면 `is_suspended = TRUE` 로 포인트 적립 정지.

## 콘텐츠 / 기능

### 매물 (Property)
부동산. `properties` 테이블. 매매 / 전세 / 월세 / 단기임대 거래 타입. 일반/오피스텔/아파트/원룸 등 매물 타입.

### 공동구매 (Group Buying)
여러 명이 모여서 단가를 낮추는 구매. `group_buying_posts` (글) + `group_buying_participants` (참여자). 결제 모드(`payment_required`) 켜면 실제 결제 / 끄면 단순 모집.

### 모임 (Club)
취미/스포츠 모임. `clubs` 테이블. 정원(`max_members`) 마감 시 채팅방 자동 오픈. 모임장은 강제 마감 가능.

### 로컬푸드 (Local Food)
지역 생산자가 직접 판매하는 농산물. `local_food` 글 + `local_food_orders` 주문. 택배 단일 배송. 에스크로 형태로 PG 결제.

### 게시판 (Board)
일반 글타래. `board_posts` + `board_comments`. 카테고리별 분류. 신고 가능 옵션 (`reportable`).

### 구인구직 (Jobs)
`jobs_posts`. `kind` = 'offer' (구인) / 'seeking' (구직). 시급 / 근무일 / 근무시간 / 위치.

### 서비스 (Services)
인테리어 / 이사 / 청소 / 수리 4종. 견적 요청 vs 업체 등록 둘 다 지원.

### 신장개업 (New Store)
새로 오픈한 가게 홍보. `new_store_posts`.

### 나눔 (Sharing)
무료/저가 물품 나눔. `sharing_posts`.

### 중고거래 (Secondhand)
개인 간 중고 물품 매매. `secondhand_posts`.

### 채팅 (Chat)
1:1 채팅 (`chat_rooms`) + 클럽/공구 단체 채팅 (멤버 기반). Supabase realtime 으로 실시간 수신.

### 1:1 vs 단체 채팅
1:1 = `chat_rooms.buyer_id` + `chat_rooms.seller_id` (또는 buyer_id = expert_invitations 의 expert_id).
단체 = `club_members` (모임 정원 마감 후) / `group_buying_participants` (공구 모집 마감 후).

### 다이렉트 메시지 (DM)
`chat_rooms.post_type = 'direct'` 인 1:1 채팅. 매물 글이 아닌 사용자 프로필에서 시작.

### 공지 채팅 (admin_notice)
`chat_rooms.post_type = 'admin_notice'`. 어드민이 사용자에게 보내는 단방향 메시지. 답장 불가.

## 결제 / 정산

### 결제 (Pay)
PortOne (구 아임포트) 통합. dev 에선 mock-pay 모드 (실제 결제 없이 흐름 시뮬레이션). production 에선 PortOne 채널키를 광장별로 `plazas.portone_channel_key` 에 저장.

### 가맹점 주문번호 (pg_merchant_uid)
서비스 측이 발급하는 주문 식별자 (UUID). PG 의 `pg_payment_id` 와 별도. UNIQUE 제약.

### Idempotency Key (멱등성 키)
클라이언트가 결제 시도 시 발급하는 UUID. 같은 buyer + 같은 key 의 재시도는 기존 주문 반환 (DB 레벨 UNIQUE 인덱스). 네트워크 재시도/사용자 재클릭 안전.

### 수수료 (Fee)
`local_food_orders.fee_amount` — 플랫폼 수수료(생산자 부담). `settlement_amount` (생산자 정산) = `amount - fee_amount` (GENERATED 컬럼).

### 환불 (Refund)
`status = 'refund_requested'` (구매자 요청) → `'refunded'` (승인). 포인트 사용분 환원은 `points_refund_spend` RPC 자동 호출.

### 정산 (Settlement)
`settled_at` 기록. 보통 거래 완료(`confirmed`) 후 일정 기간 보류 → 정산. 월별 batch는 `billing-monthly-payout` cron.

### 에스크로 (Escrow)
구매자 결제 → 플랫폼 보관 → 운송 / 구매확정 후 판매자 정산. PortOne 실 운영 시 PG가 보관 역할.

## 포인트

### 포인트 (Point)
플랫폼 내 통화. 1포인트 = 1원 환산 (기본). `user_points` 테이블에 잔액 / lifetime 합계 저장.

### 적립 (Earn)
글쓰기 / 댓글 / 좋아요 받기 등 활동 보상. `point_transactions.type = 'earn'` + `status = 'pending'` (24h evaluation_at) → cron 으로 'confirmed' 전환 시 잔액 반영.

### 사용 (Spend)
결제 시 일부 충당. `points_spend_atomic` RPC 호출. 카테고리별 한도 (`point_redemption_settings.max_redemption_pct` 예: 30%).

### 회수 (Revert)
신고/위반 시 적립 취소. `points_revert_one` RPC. earn 만 잔액 회수.

### 환불 (Refund)
주문 취소 시 사용 포인트 복구. `points_refund_spend` RPC. spend tx 만 status='reverted' + 잔액 +금액. 멱등성 (이미 reverted 면 no-op).

### 점프 / 글 올리기 (Bump)
글의 `bumped_at` 갱신 → 목록 상단 노출. `bump_tickets` 차감 또는 포인트 사용. `bump_purchase_ticket_atomic` RPC.

### 오늘의 매물 (Featured)
`properties.is_featured = TRUE`. 어드민이 수동 토글. 홈/매물 목록 상단에 강조 표시.

### 도배 / 스팸 / 도배 방어 (Spam / Rate Limit)
같은 사용자가 짧은 시간 안에 많은 요청을 보내는 것. `enforceRateLimit` 헬퍼로 차단 (Upstash Redis sliding window). 대표 케이스: 댓글 도배, 채팅 도배, 신고 도배.

## 운영 / 어드민

### 어드민 (Admin)
광장별 관리자. `plaza_admins.role IN ('admin', 'moderator')` 또는 legacy `profiles.role = 'admin'`. 광장 단위 게시판 / 매물 / 회원 관리.

### 슈퍼 어드민 (Super Admin)
플랫폼 최상위 관리자. `plaza_admins.role = 'super'` 또는 legacy `profiles.role = 'superadmin'`. 모든 광장 + 결제 채널 + 광장 추가/삭제 가능.

### 슈퍼관리자 콘솔 (Super Admin Console)
`/super-admin` 라우트. 별도 비밀번호 + TOTP 2FA (`SUPER_ADMIN_*` 환경변수). 일반 로그인 + 2차 인증.

### 점검 모드 (Maintenance Mode)
`MAINTENANCE_MODE=true` 환경변수. middleware 가 모든 요청을 503 + `/maintenance` 페이지로 rewrite. `/api/health` 만 통과.

### 광장 어드민 (Plaza Admin)
한 광장 안에서만 관리 권한. cross-plaza 차단 로직으로 다른 광장 데이터 못 건드림.

### 사이트 라벨 (site_labels)
UI 에 표시되는 텍스트(라벨)을 코드 안에 하드코딩하지 않고 `site_labels` 테이블로 분리. 어드민이 슬로건 / 메뉴명 등을 코드 수정 없이 변경 가능. site-labels-client provider 가 React context 로 주입.

### 사이트 설정 (site_settings)
`key-value` JSON. 글로벌 설정 (운영 메일, 점검 메시지, SEO 메타, hero 배너 등). production fail-closed 가드 적용된 곳 있음.

### 어드민 알림 (Admin Notify)
어드민이 사용자에게 보내는 일괄 메시지. `/api/admin/notify` 엔드포인트. rate limit (`admin-notify` LimitName) 적용.

## 기술 / 보안

### RLS (Row Level Security)
Supabase/Postgres 의 행-수준 권한. 정책별 USING / WITH CHECK 절로 누가 SELECT/INSERT/UPDATE/DELETE 가능한지 정의. 광장 격리 / 본인만 조회 등 핵심 보안 layer.

### Service-role 클라이언트
`SUPABASE_SERVICE_ROLE_KEY` 로 만든 admin client. RLS 우회. 라우트 위에서 명시적 권한 체크 통과 후만 사용. `lib/supabase/admin.ts`.

### TOCTOU (Time-of-Check to Time-of-Use)
검증 시점 vs 실행 시점 사이 race condition. 예: 모임 정원 체크 → INSERT 사이에 동시 요청. RPC + advisory lock + FOR UPDATE 로 해결.

### Atomic RPC
단일 트랜잭션 안에서 검증 + 변경을 모두 처리하는 Postgres 함수. `club_join_atomic`, `gb_join_atomic_v2`, `points_spend_atomic` 등.

### Advisory Lock
Postgres 의 명시적 트랜잭션 락. `pg_advisory_xact_lock(hashtext(key))` — 같은 key 의 다른 트랜잭션은 대기. 모임 join, 공구 join 같은 직렬화 필수 영역에 사용.

### Fail-closed / Fail-open
- Fail-closed: 실패 시 거부 (보안 우선). 예: ratelimit Redis 장애 시 login/signup은 차단.
- Fail-open: 실패 시 허용 (가용성 우선). 예: ratelimit Redis 장애 시 일반 mutation은 통과.

### Magic Byte 검증
업로드된 파일이 실제로 선언된 형식인지 binary header 첫 몇 바이트 확인. 확장자/Content-Type 위조 방지. R2 업로드 전 적용.

### Idempotent
같은 요청을 여러 번 보내도 결과가 같음. 멱등성. 결제 / cancel / 환불 같은 곳에 필수.

## 특수 용어

### 전문가 초대 (Expert Invitation)
매물 / 공구 등에서 다른 전문가(공인중개사/생산자 등)를 초대해 채팅에 참여시키는 기능. `expert_invitations` 테이블. 초대 받은 쪽이 수락하면 같은 채팅방에 join.

### 신고 (Report)
신고 가능한 콘텐츠 (`reports` 테이블). 카테고리 / 사유 / 첨부. `boards.reportable = TRUE` 인 게시판만 신고 버튼 표시. 신고 누적 시 자동 차감 (점수 / 글 숨김).

### 알림 (Notification)
앱 내 알림 (`notifications` 테이블). 종류: 댓글, 좋아요, 구매, 정산 등. 읽음 처리 (`read_at`).

### 팝업 / 공지 (Popup / Announcement)
`popup_layers`, `announcements` 테이블. 어드민이 사이트 상단/모달로 띄울 수 있는 일시적 메시지.

### 히어로 배너 (Hero Banner)
홈 화면 상단의 큰 슬라이드 배너. `hero_banners` 테이블. 광장별 / 글로벌 분기 가능.

### 오피셜 (Official) / 인증 마크
일부 어드민 인증 계정에 표시되는 뱃지. UI 표현용.

### Mini Nav / Mini Map
홈 화면의 작은 네비게이션 바 / 작은 지도 위젯. 컴포넌트로 분리.
