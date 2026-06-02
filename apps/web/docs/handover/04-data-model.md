# 04 — 데이터 모델

## 개요

Supabase Postgres 의 모든 핵심 테이블 / RPC / 트리거 / 인덱스 / RLS 정책. 신규 개발자가 어떤 데이터가 어디 있는지 바로 찾을 수 있게 그룹별로 정리.

전체 스키마는 `supabase/migrations/` 의 누적 결과. `types/app.ts` 가 일부 테이블의 TS 타입.

## 테이블 그룹

### 1. 인증 / 사용자

#### `auth.users` (Supabase 관리)
이메일 / OAuth ID / 메타데이터. 직접 SQL 수정 X.

#### `profiles`
사용자 공개 프로필.

| 컬럼 | 타입 | 의도 |
|---|---|---|
| id | UUID PK | auth.users.id 와 동일 |
| nickname | TEXT | 광장 표시 이름 |
| full_name | TEXT | 실명 (선택) |
| phone | TEXT | 전화 (마스킹 권장) |
| avatar_url | TEXT | 프로필 이미지 |
| location | TEXT | 거주 지역 (예: "강원특별자치도 춘천시 효자동") |
| account_type | TEXT | 'individual'/'business'/'agent'/'producer'/'interior'/'moving'/'cleaning'/'repair' |
| role | TEXT | 'user'/'admin'/'superadmin' (legacy) |
| trust_score | NUMERIC | 이웃 별 평균 (0.0~5.0, NULL = 후기 없음) |
| review_count | INT | 후기 수 |
| created_at, updated_at | TIMESTAMPTZ | |
| last_seen | TIMESTAMPTZ | 최근 접속 |

> ⚠️ **`plaza_id` 컬럼 없음**. 광장 가입은 `plaza_profiles` 별도.

#### `plaza_profiles`
광장별 사용자 가입.

| 컬럼 | 타입 | 의도 |
|---|---|---|
| user_id | UUID FK | profiles |
| plaza_id | TEXT FK | plazas |
| nickname | TEXT | 광장별 별명 (다를 수 있음) |
| is_active | BOOLEAN | 가입 상태 |
| joined_at | TIMESTAMPTZ | |

PK: `(user_id, plaza_id)`.

#### `plaza_admins`
광장별 관리자.

| 컬럼 | 타입 |
|---|---|
| user_id | UUID FK |
| plaza_id | TEXT FK |
| role | 'admin' / 'moderator' / 'super' |
| granted_by | UUID |
| granted_at | TIMESTAMPTZ |

PK: `(user_id, plaza_id)`.

#### `feature_flags`
런타임 토글 (예: `monetization.points`).

### 2. 광장 / 지역

#### `plazas`
광장(테넌트) 메타.

| 컬럼 | 타입 | 의도 |
|---|---|---|
| id | TEXT PK | 'chuncheon', 'gangneung', ... |
| name | TEXT | '춘천광장' |
| parent_region | TEXT | '강원권' |
| center_lat, center_lng | DECIMAL | 지도 중심 |
| bounds | JSONB | 광장 경계 |
| theme | JSONB | { primaryColor, logoUrl, ... } |
| is_active | BOOLEAN | 사용자 진입 가능 |
| is_open_soon | BOOLEAN | "오픈예정" 표시 |
| sort_order | INT | 표시 순서 |
| coverage | TEXT[] | 광장 내 동/지역 |
| tour_area_code, tour_sigungu_code | TEXT | 한국관광공사 API |
| **portone_store_id, portone_channel_key** | TEXT | **PortOne 결제 (민감)** |
| pg_provider | TEXT | 'portone' / 'mock' |
| **business_number, business_name, business_holder, settlement_email** | TEXT | **사업자 정보 (민감)** |
| payments_enabled | BOOLEAN | 결제 on/off |

> ⚠️ 민감 컬럼은 column-level GRANT 로 anon/authenticated 차단 (`20260621000001`).

#### `regions`
광장 내부의 동/지역 카테고리. (광장과 다른 개념 — 광장 내 분류용)

### 3. 콘텐츠 — 매물

#### `properties`
| 컬럼 | 비고 |
|---|---|
| id, user_id, plaza_id | |
| title, description | |
| property_type | 아파트/오피스텔/원룸/... |
| transaction_type | 매매/전세/월세 |
| price, monthly_rent, maintenance_fee, deposit | |
| area_sqm, floor_info, total_floors | |
| rooms, bathrooms | |
| address, lat, lng | |
| images (TEXT[]), panorama_images (JSONB), instagram_post_url, youtube_post_url, ai_video_url | |
| features (TEXT[]) | |
| direction, parking, elevator, pet_allowed, move_in_date | |
| seller_type | agent/individual |
| status | active/reserved/sold/hidden |
| is_featured | 오늘의 매물 |
| views | |
| effective_at | 검색 정렬 기준 (기본 created_at, bump 시 NOW) |
| bumped_at | 마지막 bump |
| created_at, updated_at | |

인덱스: `(plaza_id, status)`, `(plaza_id, effective_at DESC)`, `(user_id, created_at)`, partial `effective_at WHERE status='active'`.

#### `favorites`
매물 찜. `(user_id, plaza_id, property_id)`. 광장별 격리.

### 4. 콘텐츠 — 공동구매

#### `group_buying_posts`
| 컬럼 | 비고 |
|---|---|
| id, user_id, plaza_id | |
| title, description, images | |
| original_price, group_price, max_participants, current_participants | quantity 합산 |
| deadline | 마감일 |
| status | recruiting/full/pending_payment/group_confirmed/cancelled/completed |
| payment_required | 결제 모드 on/off |
| delivery_mode | pickup/delivery/both |
| visibility | 'plaza'/'national' |
| category | |

#### `group_buying_participants`
| 컬럼 | 비고 |
|---|---|
| post_id, user_id, joined_at | |
| quantity | |
| receive_method | pickup/delivery |
| recipient_* | 배송 정보 |
| payment_status | reserved/paid/refunded |

PK: `(post_id, user_id)`.

#### `group_buying_orders` (별도 테이블)
결제 주문. `payment_required=true` 시.

| 컬럼 | 비고 |
|---|---|
| id, post_id, buyer_id, seller_id, plaza_id | |
| status | pending/paid/group_confirmed/shipped/confirmed/refund_requested/refunded/cancelled/settled |
| unit_price, quantity, amount, fee_amount | |
| points_used, points_tx_id | |
| receive_method, delivery_addr (JSONB), buyer_memo | |
| pg_provider, pg_payment_id, pg_merchant_uid (UNIQUE), pg_raw | |
| **idempotency_key** | **buyer + key UNIQUE 인덱스 (Phase 1)** |
| 각종 `*_at` 타임스탬프 | |

### 5. 콘텐츠 — 모임

#### `clubs`
| 컬럼 | 비고 |
|---|---|
| id, user_id, plaza_id, title, sport_type, skill_level, category | |
| max_members, current_members | |
| status | recruiting/full/closed |
| meeting_date, location | |
| images, description | |

#### `club_members`
PK: `(club_id, user_id)`. `joined_at`.

#### `club_likes`
좋아요.

### 6. 콘텐츠 — 로컬푸드

#### `local_food`
| 컬럼 | 비고 |
|---|---|
| id, user_id, plaza_id, title, description, content | |
| category, original_price, price, unit | |
| images, status (available/sold_out/hidden) | |
| location, district | |

#### `local_food_orders`
| 컬럼 | 비고 |
|---|---|
| id, buyer_id, seller_id, plaza_id | |
| status | pending/paid/shipped/delivered/confirmed/refund_requested/refunded/cancelled/settled |
| amount, fee_amount, settlement_amount (GENERATED) | |
| points_used, points_tx_id | |
| delivery_addr (JSONB), buyer_memo, seller_memo, tracking_company, tracking_number | |
| pg_*, **idempotency_key** | |

> ⚠️ **컬럼 동결 트리거** (`local_food_orders_freeze_critical`) 가 buyer_id/amount/pg_* 등 결제 핵심 컬럼 UPDATE 차단 (service_role 만 통과).

#### `local_food_order_items`
한 주문 N개 상품. 가격 스냅샷 (글 수정/삭제 영향 X).

#### `producer_settlements`
생산자 정산 계좌 (KYC). PK: `user_id`. bank_code/bank_name/bank_account/account_holder/business_number/is_verified.

#### `payment_webhooks`
PG 웹훅 멱등성. UNIQUE `(pg_provider, pg_payment_id, event_type)`.

### 7. 콘텐츠 — 게시판 / 구인구직 / 서비스

#### `board_posts`
일반 게시판. `category`, `region`, `reportable`, `images`, `status`.

#### `board_comments`
대댓글 가능. RLS 정교화 (multiple migration fix).

#### `board_likes`

#### `jobs_posts`
구인구직. `kind` ('offer'/'seeking'), `work_type`, `hourly_wage`, `work_days`, `work_hours`, `location`, `contact`.

#### `interior_posts`, `moving_posts`, `cleaning_posts`, `repair_posts`
서비스 4종. 동일 패턴.

#### `new_store_posts`, `sharing_posts`, `secondhand_posts`
신장개업 / 나눔 / 중고.

### 8. 콘텐츠 — 후기

#### `reviews`
이웃 별. PK `id`.

| 컬럼 | 비고 |
|---|---|
| reviewer_id, reviewed_user_id | |
| source_type | 'local_food_order' / 'group_buying_order' / 'property' / 'secondhand' |
| source_id | |
| response_speed, accuracy, kindness | 1~5 |
| total_score | 평균 (1~5, 자동 계산 가능) |
| content | 텍스트 |

UNIQUE partial index: `(reviewer_id, source_type, source_id)`. 한 거래당 1번.

RLS (Phase 1):
- SELECT: 누구나
- INSERT: 본인 = reviewer + 본인에게 X
- UPDATE: 본인 + 7일 이내
- DELETE: 본인

### 9. 채팅 / 알림

#### `chat_rooms`
| 컬럼 | 비고 |
|---|---|
| id, plaza_id | |
| buyer_id, seller_id | 1:1 채팅 양 당사자 |
| post_type | 'property'/'sharing'/'new_store'/'local_food'/'group_buying'/'interior'/.../'direct'/'admin_notice' |
| property_id | post 식별자 (matter post_type 에 따라 의미 다름) |
| last_message_at, last_message_preview | |

#### `messages`
| 컬럼 | 비고 |
|---|---|
| id, room_id, user_id | |
| content, image_url | |
| created_at | |

> 단체 채팅 (clubs / group-buying) 은 `chat_rooms` 안 쓰고 `club_messages`/`group_buying_messages` 같은 테이블 또는 같은 messages 테이블 + room_id 분기.

#### `notifications`
| 컬럼 | 비고 |
|---|---|
| id, user_id | |
| type | 'comment'/'like'/'club_join'/'group_buying_full'/...|
| title, message | |
| link | 클릭 시 이동 |
| thumbnail_url, actor_id | |
| read_at | NULL = 미읽음 |
| created_at | |

#### `reports`
| 컬럼 | 비고 |
|---|---|
| reporter_id, target_user_id | |
| target_table, target_id | |
| reason, description | |
| status | pending/resolved/dismissed |

#### `expert_invitations`
전문가 초대 (매물 채팅 등에 부동산/생산자 등 추가).

| 컬럼 | 비고 |
|---|---|
| chat_room_id, inviter_id, expert_id | |
| status | pending/accepted/rejected/expired |

### 10. 결제 / 포인트

#### `point_transactions`
| 컬럼 | 비고 |
|---|---|
| id, user_id, plaza_id | |
| type | 'earn'/'spend'/'revert'/'expire'/'manual_adjust'/'penalty'/'event' |
| amount | 양수 (절대값). type 으로 ± 결정 |
| source | 'post.create' / 'comment.create' / 'group_buying.purchase' / ... |
| source_id | 연결 콘텐츠 ID |
| rule_id | 적용된 적립 규칙 |
| status | pending/confirmed/reverted |
| evaluation_at | 평가 예정 |
| confirmed_at, reverted_at, reverted_reason | |
| metadata (JSONB) | |

> ⚠️ **`updated_at` 컬럼 없음**. 트리거 잘못 붙으면 silent fail (Phase 1 fix).

#### `user_points`
| 컬럼 | 비고 |
|---|---|
| user_id, plaza_id (PK) | |
| available | 사용 가능 잔액 |
| pending | pending earn 합계 |
| lifetime_earned, lifetime_spent, lifetime_reverted | |
| reputation_score | 평판 (신고 시 -10) |
| is_suspended | 적립 정지 여부 |

#### `point_rules`
적립 규칙. `code` (예: 'post.create'), `points`, `daily_limit`, `enabled`, `description`.

#### `point_redemption_settings`
카테고리별 사용 정책. `category`, `display_name`, `enabled`, `max_redemption_pct`, `daily_limit_pt`, `exchange_rate`, `min_payment_total`.

#### `subscriptions`, `transactions`, `payouts` (billing 관련)
자세한 결제 전표 / 정산. billing-monthly-payout cron.

#### `bump_tickets`
글 올리기 티켓. `user_id`, `plaza_id`, `count`, `last_used_at`.

#### `boost_settings`
boost (광고 노출) 설정.

### 11. 운영

#### `site_settings`
글로벌 설정 (`key` PK, `value` JSONB). 운영 메일, 점검 메시지, SEO 메타, hero 배너 등.

#### `site_labels`, `site_label_images`
UI 텍스트 / 이미지 동적 관리.

#### `announcements`, `popup_layers`
공지 / 팝업.

#### `hero_banners`
홈 슬라이더.

#### `plaza_payments`
광장별 결제 통계 / 정산 history.

#### `admin_actions`
어드민 override audit log. `lib/services/admin-auth.ts:logAdminAction` 으로 기록.

## RPC 함수 (요약)

자세한 건 `09-migrations.md` 참조.

| 카테고리 | RPC | 용도 |
|---|---|---|
| view | `increment_view_count` | 조회수 atomic |
| like | `change_like_count` | 좋아요 atomic |
| review | `update_neighbor_star` | 별점 평균 재계산 |
| points | `points_spend_atomic`, `points_confirm_one`, `points_revert_one`, `points_refund_spend` | 포인트 사용/확정/회수/환원 |
| join | `club_join_atomic`, `gb_join_atomic_v2` | 모임/공구 atomic 참여 |
| bump | `bump_purchase_ticket_atomic` | 글 올리기 |
| query | `get_property_favorite_counts`, `board_stats_aggregate` | 집계 |
| auto | `group_buying_auto_process` | 마감 공구 자동 처리 |

## 트리거 카탈로그

| 트리거 | 테이블 | 동작 |
|---|---|---|
| `trg_set_updated_at` | local_food_orders, producer_settlements, … | UPDATE 시 updated_at = NOW() |
| `billing_set_updated_at` | (subscriptions, transactions, …) | 동일 |
| `trg_local_food_orders_freeze_critical` | local_food_orders | 결제 핵심 컬럼 동결 (service_role 외) |
| `reviews_after_change` | reviews | 별점 평균 자동 갱신 |
| `property_account_type_sync` | profiles | account_type='agent' 강등 시 매물 처리 |

## RLS 정책 패턴

자주 쓰이는 4개:

### 본인만 SELECT/UPDATE/DELETE
```sql
USING (auth.uid() = user_id)
```

### 누구나 SELECT, 본인만 INSERT/UPDATE/DELETE
```sql
FOR SELECT USING (true);
FOR ALL USING (auth.uid() = user_id);
```

### 광장 일치 강제
```sql
USING (plaza_id = current_setting('request.jwt.claims', true)::jsonb->>'plaza_id')
```

### EXISTS 서브쿼리 (관계 검증)
```sql
USING (EXISTS (
  SELECT 1 FROM clubs c
  WHERE c.id = club_members.club_id AND c.user_id = auth.uid()
))
```

## 인덱스 카탈로그

성능 인덱스는 여러 마이그에 흩어짐:
- `20260421200000_performance_indexes.sql`
- `20260421500000_performance_indexes_pt2.sql`
- `20260520500000_performance_indexes_pt3.sql`
- `20260605000000_perf_composite_indexes.sql`
- `20260606000007_partial_effective_at_indexes.sql`

핵심 인덱스:
- `properties(plaza_id, status)` — 광장별 활성 매물
- `properties(plaza_id, effective_at DESC) WHERE status='active'` — 매물 목록 정렬
- `properties(user_id, created_at)` — 내 매물
- `clubs(plaza_id, status, created_at DESC)` — 모임 목록
- `group_buying_posts(visibility, status, created_at DESC)` — 전국 공구
- `local_food_orders(buyer_id, created_at DESC)`, `(seller_id, created_at DESC)`
- `messages(room_id, created_at)` — 채팅 lookup
- `notifications(user_id, read_at, created_at DESC)` — 미읽음 알림

## 데이터 모델 변경 시 체크

새 테이블/컬럼 추가 PR 자체 점검:

- [ ] `plaza_id TEXT NOT NULL` 추가 (콘텐츠 테이블)
- [ ] RLS ENABLE + 적절한 정책
- [ ] 인덱스 (자주 조회 컬럼)
- [ ] CHECK constraint (enum-like)
- [ ] FK + ON DELETE 정책
- [ ] `created_at/updated_at` (필요하면 트리거)
- [ ] `NOTIFY pgrst, 'reload schema'`
- [ ] `types/app.ts` 업데이트 (사용 시)
- [ ] `09-migrations.md` 한 줄 추가
- [ ] `04-data-model.md` (이 문서) 표 업데이트

## 다음 읽을 문서

- 어떤 RPC 가 어떤 흐름에 쓰이는지 → `05-features/<도메인>.md`
- 마이그 작성 패턴 → `09-migrations.md`
