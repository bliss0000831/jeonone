# 부동산 매물 (Property)

## 1. 개요

광장(Gwangjang) 의 핵심 기능 중 하나. 각 광장(지역) 안에서 매매·전세·월세 매물을 등록·검색·찜·문의(채팅)·신고할 수 있게 한다.

설계 원칙:

- **광장(plaza) 격리** — 모든 매물은 `plaza_id` 가 박혀 있고, 다른 광장 사용자에겐 보이지도, 채팅도, 찜도 안 된다.
- **공인중개사(agent) 우대** — 일반 사용자는 월 2건 한도. agent 계정은 무제한.
- **클라이언트 위변조 차단** — `seller_type`, `plaza_id`, `user_id`, `status` 등 메타 컬럼은 모두 서버에서 결정.
- **검색은 안전 우선** — 컬럼 누락(스키마 drift) 사고를 막기 위해 `select('*')` 후 메모리 변환.

핵심 사용자 시나리오:

- 일반 시민 A: 우리 동네 매물을 둘러보고 마음에 드는 집 찜 → 중개사·집주인에게 채팅 → 직거래.
- 중개사 B: 자기가 다루는 매물 N건을 등록 → 오늘의 매물(`is_featured`) 노출 → 채팅 응대.
- 모더레이터: 허위/부적절 매물을 신고받아 hide.

## 2. 데이터 모델

### `properties`

핵심 컬럼:

| 컬럼 | 의도 |
|---|---|
| `id` (uuid) | PK |
| `plaza_id` | 광장 격리 키 (필수) |
| `user_id` | 등록자 (auth.users) |
| `seller_type` | `agent` / `individual` — **서버 결정**. profile.account_type 으로 매핑. |
| `status` | `active` / `hidden` / `sold` |
| `transaction_type` | `매매` / `전세` / `월세` |
| `property_type` | `아파트` / `빌라` / `오피스텔` / `원룸` / `상가` 등 |
| `price` | 매매가 / 전세보증금 / 월세 보증금 |
| `monthly_rent` | 월세 (월세에서만 의미) |
| `maintenance_fee` | 관리비 |
| `area_sqm`, `floor_info`, `total_floors`, `rooms`, `bathrooms` | 스펙 |
| `address`, `address_detail`, `lat`, `lng` | 위치 |
| `images`, `panorama_images` | 사진/파노라마 (R2 URL 배열) |
| `instagram_post_url`, `youtube_post_url` | 외부 콘텐츠 임베드 |
| `is_featured` | 오늘의 매물 (super-admin 또는 boost 결제로 켬) |
| `bumped_at` | "글 올리기" 누른 시각. 정렬 키 `effective_at = COALESCE(bumped_at, created_at)` |
| `effective_at` | 정렬용 generated/계산 컬럼 |
| `created_at`, `updated_at` |

### `favorites` (찜)

| 컬럼 | 의도 |
|---|---|
| `user_id` | 누가 |
| `property_id` | 어떤 매물 |
| `plaza_id` | 광장 격리 — 같은 매물도 광장이 다르면 다른 row 로 처리 (사실상 매물은 한 광장에 종속이라 의미는 PII 격리에 가까움) |

### 관련 테이블

- `profiles` — 등록자 닉네임/연락처/아바타 (별도 fetch, JOIN 안 함).
- `property_requests` — 매물 요청(찾고 있어요) 게시글.
- `chat_rooms` — 매물 문의용 1:1 채팅방 (`post_type='property'`, `property_id` 매물 ID).
- `reports` — 신고.

## 3. API 라우트

### `GET /api/properties`

**책임**: 현재 광장의 활성 매물 목록 + 각 매물의 찜 카운트 + 본인의 찜 여부.

흐름:

1. `getCurrentPlaza()` 로 현재 광장 결정 (도메인/서브도메인 기반, `lib/plaza/server.ts`).
2. `properties` where `status='active'` and `plaza_id=:plaza` order by `effective_at` desc limit 200.
3. user_ids 모아서 `profiles` 한 번에 IN 쿼리.
4. property_ids 모아서 RPC `get_property_favorite_counts(plaza_id, ids[])` 한 번 호출 — SQL GROUP BY 로 집계 (예전엔 풀 스캔 후 JS 그룹핑이라 비효율).
5. 로그인 사용자라면 `favorites` where user 본인 + plaza 일치, 매물 ID 배열 반환.
6. `dbToProperty()` 로 DB row → UI 타입 변환.

**캐시**: `Cache-Control: private, max-age=10, stale-while-revalidate=60`. 사용자별 favorites 가 섞여 있어 edge 공유 캐시는 불가.

### `POST /api/properties`

**책임**: 매물 등록. 검증·rate-limit·월 한도까지 모두 서버에서.

검증 순서:

1. 로그인 (없으면 401).
2. 광장 도메인 (없으면 400 — 허브에선 등록 차단).
3. `enforceRateLimit(req, 'post', user.id)` — 분당 도배 차단.
4. profile 조회 → `account_type==='agent'` 또는 role admin/superadmin 면 면제, 아니면 이번 달(같은 plaza) 매물 수 ≥ `MONTHLY_LIMIT_NON_AGENT`(=2) 인지 검사. 초과 시 403 `monthly_limit_exceeded`.
5. `seller_type` 은 서버에서 강제 (`agent` 면 'agent', 아니면 'individual' — body 무시).
6. 화이트리스트 키 (`title`, `property_type`, `transaction_type`, `price`, `monthly_rent`, `maintenance_fee`, `area_sqm`, `floor_info`, ..., `images`, `panorama_images`) 만 INSERT. **`status`, `plaza_id`, `user_id`, `seller_type`, `is_featured`, `bumped_at` 같은 메타는 client 가 보내도 무시**.
7. 필수 검증 (`title`/`property_type`/`transaction_type` 누락 시 400).
8. 실패 시 Postgres 에러 코드는 클라에 노출하지 않음 (서버 로그만).

### `GET /api/properties/[id]`

상세 — 매물 + 등록자 프로필 + 찜 카운트. RLS 가 광장 외 매물 읽기 차단.

### `PUT /api/properties/[id]`

본인(또는 admin) 만 수정 가능. `images`, `description`, `price` 등 화이트리스트 필드만.

### `DELETE /api/properties/[id]`

본인 또는 admin. soft delete 권장 (`status='hidden'`) 또는 hard delete.

### `GET /api/properties/[id]/similar`

같은 광장 + 같은 transaction_type + 가격 근접 매물 추천.

### `GET /api/favorites` / `POST /api/favorites`

찜 토글. `plaza_id` 함께 INSERT — 광장 격리.

## 4. 시퀀스 플로우

### 등록 → 노출

```
사용자 → POST /api/properties
   ↓
   (rate limit 체크 → 월 2건 한도 → seller_type 강제 → 화이트리스트 INSERT)
   ↓
properties INSERT (plaza_id 박힘, status='active', effective_at = created_at)
   ↓
GET /api/properties (다른 사용자) → 목록에 노출 (effective_at desc)
```

### 글 올리기 (bump)

```
POST /api/bump?type=property&id=xxx
   ↓
properties.bumped_at = now()  (effective_at 자동 갱신 → 목록 상단으로)
   ↓
하루 N회 제한 (구독/포인트 정책 - lib/services/billing/boost.ts)
```

### 찜 → 채팅 → 신고

```
사용자 A: POST /api/favorites { property_id, plaza_id }
   ↓
favorites INSERT (UNIQUE key: user_id, property_id, plaza_id)

사용자 A: POST /api/chat/rooms { propertyId, sellerId }
   ↓
서버: properties.plaza_id 와 user_id 검증 (sellerId body trust 차단)
   ↓
chat_rooms 생성 또는 기존 반환 (post_type='property')

사용자 A: POST /api/reports { post_type:'property', target_id }
   ↓
reports INSERT → admin 패널에서 처리
```

### 거래 타입별 가격 표기

- 매매: `price` 만 표시 (예: 5억).
- 전세: `price` 가 보증금.
- 월세: `price`(보증금) + `monthly_rent` (예: 1000/50).
- `maintenance_fee` 는 모든 타입에서 보조 표시.

UI 변환은 `types/app.ts` 의 `dbToProperty()` 함수가 담당. 거래 타입에 따라 가격 라벨/단위가 달라진다.

## 5. 권한 / RLS

- **읽기**: `properties` RLS — `status='active'` AND (`plaza_id` 가 사용자 현재 광장) 일 때만 select. anon 도 읽기 가능 (공개 매물).
- **쓰기**: 본인 row 만 update/delete. INSERT 는 API 라우트 경유 (직접 INSERT 차단).
- **favorites**: `user_id = auth.uid()` 만 select/insert/delete.
- **agent 검증**: profile.account_type='agent' 자체는 단순 self-update 가 안 되도록 별도 흐름(account-upgrade) 으로 관리. 일반 사용자가 agent 라고 자칭해도 매물 등록 시 서버가 다시 조회.

## 6. 외부 연동

- **카카오/네이버 지도** — 좌표(`lat`, `lng`) 표시용. `app/api/geocode/` 가 주소→좌표 변환.
- **Cloudflare R2** — 사진/파노라마 저장. `app/api/upload/` 가 업로드 URL 발급.
- **Sentry** — 등록 실패 시 에러 추적.

## 7. 확장 시 주의점

- **컬럼 추가** — `select('*')` 패턴이라 자동 반영되지만, `dbToProperty()` 는 명시적 매핑이라 거기에도 추가해야 UI 에 노출됨. allowedKeys 화이트리스트도 같이 늘려야 INSERT 가능.
- **거래 타입 추가** — 단기임대 등 추가하려면 (a) DB enum/check 제약 (b) `dbToProperty` 가격 표기 (c) UI 필터 (d) 검색 인덱스 모두 손봐야 함.
- **plaza_id 누락 사고** — 매물 INSERT 라우트는 `getCurrentPlaza()` 로 강제 주입. 마이그레이션·백필 시에도 `plaza_id IS NULL` row 가 생기지 않도록 NOT NULL + default 검토.
- **월 2건 한도 우회 시도** — 같은 사용자가 다른 광장에서 등록할 수는 있다(광장별 한도). 의도된 동작. 만약 전체 합산 한도가 필요하면 plaza 필터를 빼야 함.
- **bumped_at 어뷰징** — 인당 일일 N회 제한 + boost 결제 (`/api/bump`) 로 통제.
- **agent 자칭 차단** — account_type='agent' 로 self-update 가능한 경로가 없는지 정기 audit. 사업자 등록증 인증 흐름 (`app/api/account-upgrade/`) 통해서만 승격되어야 함.
- **panorama_images** — 클라이언트 렌더링이 무거움. 이미지 수 상한(예: 12장) 가드.
- **property_requests (찾아요)** — 별도 테이블. 본 문서 범위 외. 비슷한 구조 + 매칭 알림(notify) 흐름.
