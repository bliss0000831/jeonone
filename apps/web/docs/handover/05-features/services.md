# 서비스 (인테리어 / 이사 / 청소 / 수리)

## 개요

4개 서비스 도메인 (`interior`, `moving`, `cleaning`, `repair`). 동일 패턴의 게시판 — 견적 요청 글 vs 업체 등록 글. account_type 매칭으로 본인 서비스 영역만 작성 가능.

## 핵심 파일

각 서비스마다 동일 구조:

```
app/(plaza)/{service}/                        # service ∈ {interior, moving, cleaning, repair}
  page.tsx                                    # 목록 (요청/업체 탭)
  new/page.tsx                                # 작성
  [id]/page.tsx                               # 상세

app/api/{service}/
  route.ts                                    # GET / POST
  [id]/route.ts                               # GET / PATCH / DELETE
```

## 데이터 모델

### `interior_posts` / `moving_posts` / `cleaning_posts` / `repair_posts`
4개 테이블 동일 스키마.

| 컬럼 | 의도 |
|---|---|
| id, user_id, plaza_id | |
| kind | 'request' (견적 요청) / 'offer' (업체 등록) |
| title, description, images | |
| category | 도메인별 (인테리어: 거실/주방/욕실, 이사: 가정/사무실, ...) |
| budget_min, budget_max | 예산 (요청 시) |
| price_range_min, price_range_max | 가격대 (업체 시) |
| location | 작업 위치 |
| contact, phone | 연락처 |
| work_period | 작업 기간 |
| status | active / closed / hidden |
| view_count, like_count | 캐시 |

마이그 `20260602000000_service_tables_indexes.sql` 가 4개 테이블 통합 처리.

## account_type 매칭

업체 등록 (`kind='offer'`) 은 해당 account_type 만 가능:

| 서비스 | account_type |
|---|---|
| interior_posts | 'interior' |
| moving_posts | 'moving' |
| cleaning_posts | 'cleaning' |
| repair_posts | 'repair' |

견적 요청 (`kind='request'`) 은 누구나 가능.

서버 검증 패턴:
```ts
if (kind === 'offer') {
  const { data: profile } = await supabase
    .from('profiles').select('account_type').eq('id', user.id).single()
  const allowed: Record<string, string> = {
    interior: 'interior', moving: 'moving', cleaning: 'cleaning', repair: 'repair',
  }
  if (profile?.account_type !== allowed[service]) {
    return error("이 서비스 유형 등록 권한 없음")
  }
}
```

## 시퀀스 — 견적 요청 → 매칭

```
1. 사용자: /interior/new → POST /api/interior
   - kind='request', budget_min/max, location, work_period
2. 업체 (account_type='interior'): 목록에서 보고 채팅 시작
   - POST /api/chat/rooms (post_type='interior')
3. 1:1 채팅에서 견적 협의
4. 거래 성사 → 채팅에서 외부 결제 / 수동 진행
5. (선택) 후기 작성 → reviews 테이블
```

## UI 패턴

### 목록 페이지 탭
- "견적 요청" (request) / "업체" (offer) 분리
- 카테고리 필터 (각 서비스별)
- 가격대 필터

### 상세 페이지
- request: 예산 표시 + "이 분께 견적 보내기" 버튼
- offer: 가격대 표시 + "상담 요청" 버튼 → 채팅 시작

### 카드 (`components/{service}-card.tsx`)
도메인별 약간씩 다른 표시 (인테리어는 before/after 사진, 이사는 거리 km 등).

## 인덱스

성능을 위해 마이그 `20260602000000_service_tables_indexes.sql` 가 일괄 추가:
- `(plaza_id, kind, status, created_at DESC)` — 목록 조회
- `(user_id, created_at DESC)` — 내 글
- (필요 시) GIN index on images — 이미지 검색

## 권한 / RLS

- SELECT: 누구나 (active 만)
- INSERT: 본인 = user_id, 광장 일치, account_type 매칭 (offer 시)
- UPDATE: 본인
- DELETE: 본인 또는 광장 어드민

## 신고 / 모더레이션

`reports` 테이블에 target_table 별로 분류 (`'interior_posts'` 등). 어드민 모더레이션 페이지에서 일괄 처리.

## 채팅 연결

채팅방 생성 시 `chat_rooms.post_type` 에 서비스 도메인 명시:
- `'interior'` / `'moving'` / `'cleaning'` / `'repair'`

채팅 페이지의 `loadPostContext` 가 post_type 에 따라 맞는 테이블 fetch.

## 주의점

### 1. 4개 도메인 동기화 부담
- 4개 테이블 / 4개 라우트 / 4개 페이지가 거의 동일
- 한 도메인 fix 시 나머지 3개도 같이 적용 의무
- DRY 위반 → 미래 generalize 검토 (`service_posts` 단일 테이블 + `service_type` 컬럼)

### 2. account_type 강제 시점
- 글 작성 시: 검증 (위 코드)
- 글 작성 후 account_type 변경되면? → 글은 남아있음
- agent → individual 강등 시 매물 처리하는 트리거 (`property_account_type_sync`) 처럼 비슷한 동기화 검토

### 3. budget vs price_range
- request: budget_min/max (구매자 예산)
- offer: price_range_min/max (업체 가격대)
- UI 에서 헷갈리지 않게 라벨 명확

### 4. 위치 — district vs location
- 광장 안 동네 (`region`) 와 자유 텍스트 위치 (`location`) 혼재 가능
- 검색 시 매칭 로직 신중

### 5. 이미지 / R2
- 업체 등록 시 포트폴리오 이미지 다수
- 글 삭제 시 `deleteR2Urls` cleanup

## 확장 시

### 도메인 추가 (예: 과외 / 베이비시팅)
1. 새 마이그: `tutoring_posts` 테이블 (interior_posts 복사)
2. 새 라우트 / UI 복사
3. account_type enum 확장
4. 인덱스 / RLS / 신고 / 채팅 통합

### 통합 리팩터 (`service_posts` 단일)
- 4개 테이블 → 1개 + `service_type` enum
- 마이그 데이터 이전
- 라우트 통합
- 위험 큼 (회귀 가능성)

### 견적서 / 계약 시스템
- 자유 채팅 → 정형 견적 양식
- 별도 테이블 + 결제 통합

## 다음 읽을 문서

- 채팅 (post_type 분기) → `05-features/chat.md`
- 게시판 (비슷한 패턴) → `05-features/board-jobs.md`
- 신고 / 모더레이션 → `06-operations/admin.md`
