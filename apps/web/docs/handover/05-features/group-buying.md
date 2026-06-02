# 공동구매 (Group Buying)

## 개요

여러 사용자가 모여 단가를 낮추는 구매 시스템. 글 작성 → 참여 → 정원 마감 → (선택) 결제 → 운송 → 후기. **결제 모드 (`payment_required`) 와 무료 참여 모드** 두 가지 운영 방식.

## 핵심 파일

```
app/(plaza)/group-buying/                    # UI
  page.tsx                                    # 글 목록
  new/page.tsx                                # 글 작성
  [id]/page.tsx                               # 상세 + 참여 모달
  
app/(plaza)/chat/group-buying/[postId]/      # 채팅방

app/api/group-buying/[id]/                   # 글 액션
  route.ts                                    # GET/PATCH/DELETE
  join/route.ts                               # 참여 (gb_join_atomic_v2)
  cancel/route.ts                             # 주최자 취소
  close/route.ts                              # 주최자 강제 마감
  reopen/route.ts                             # 재모집
  members/route.ts                            # 참가자 목록
  chat/route.ts                               # 채팅
  wishlist/route.ts                           # 알림 신청 (모집 시작 알림)

app/api/group-buying-orders/                 # 결제 주문 (payment_required)
  route.ts                                    # POST 주문 생성
  [id]/cancel/route.ts                        # 취소 (포인트 환원)

app/api/cron/group-buying-auto-process/      # 마감일 자동 처리
```

## 데이터 모델

### `group_buying_posts`
| 컬럼 | 의도 |
|---|---|
| user_id | 주최자 |
| plaza_id | 광장 |
| title, description, images | 콘텐츠 |
| original_price, group_price | 정가 / 공동가 |
| max_participants | 목표 수량 (quantity 합산 기준) |
| current_participants | 현재 누적 quantity |
| deadline | 모집 마감일 |
| status | recruiting / full / pending_payment / group_confirmed / cancelled / completed |
| payment_required | 결제 모드 on/off |
| delivery_mode | pickup / delivery / both |
| visibility | 'plaza' (광장) / 'national' (전국 공개) |

### `group_buying_participants`
PK `(post_id, user_id)`. quantity 합산 모델.

| 컬럼 | 의도 |
|---|---|
| post_id, user_id | |
| quantity | 이 사람이 신청한 수량 |
| receive_method | pickup / delivery |
| recipient_* | 배송 정보 |
| payment_status | reserved / paid / refunded |
| joined_at | |

### `group_buying_orders` (결제 모드 시)
별도 테이블. 글 = post 1개에 주문 = 사용자별 N개.

| 컬럼 | 비고 |
|---|---|
| post_id, buyer_id, seller_id (=주최자), plaza_id | |
| status | pending → paid → group_confirmed → shipped → confirmed → settled |
| unit_price, quantity, amount, fee_amount | |
| points_used, points_tx_id | |
| receive_method, delivery_addr (JSONB) | |
| pg_provider, pg_payment_id, pg_merchant_uid (UNIQUE) | |
| **idempotency_key** | UNIQUE (Phase 1) |

## 시퀀스 — 글 작성 → 마감

```
1. 주최자: /group-buying/new → POST /api/group-buying
   - title, group_price, max_participants, deadline, payment_required, delivery_mode 등
   - visibility 기본 'plaza'
   - status = 'recruiting'
   ↓
2. 사용자 B: 글 페이지 → 참여하기 → POST /api/group-buying/[id]/join
   - body: { quantity, receive_method, recipient_* }
   ↓
3. RPC gb_join_atomic_v2(post_id, user_id, quantity, ...)
   - pg_advisory_xact_lock — 동시 join 직렬화
   - SELECT post FOR UPDATE
   - 검증: 본인 X / 마감 X / deadline X
   - SUM(quantity) WHERE user_id <> 주최자 → v_total_qty
   - v_new_total = v_total_qty + quantity
   - v_new_total > max_participants → "잔여 수량 초과"
   - INSERT participants
   - UPDATE current_participants
   - status: v_new_total >= max → 'pending_payment' / else 'recruiting'
   ↓
4. 정원 마감 (max 도달) → status='pending_payment'
   - 채팅방 자동 오픈 (chatOpened: true)
   - 주최자에게 'group_buying_full' 알림
   ↓
5. (결제 모드) 각 참여자가 주문 생성
   - POST /api/group-buying-orders
   - server-side seller_id (post.user_id) + amount (quantity * group_price) 도출
   - idempotency_key 처리 (재시도 안전)
   - points_used 처리 (point_redemption_settings.group_buying.max_redemption_pct)
   - status='pending', pg_provider='mock' (또는 'portone')
   ↓
6. 결제 완료 (PG 콜백) → status='paid'
   ↓
7. 모든 참가자 결제 완료 → status='group_confirmed'
   - (현재 자동 전환 로직은 cron 또는 RPC)
   ↓
8. 주최자: 발송 → status='shipped' (tracking_number 기록)
   ↓
9. 구매자: 수령 확정 → status='confirmed'
   ↓
10. 정산 → status='settled'
```

## 무료 참여 모드 (`payment_required = false`)

위 시퀀스의 5-10 단계 생략. 주최자가 채팅방에서 입금 안내 → 직접 거래.

## 마감일 자동 처리 — `group_buying_auto_process` cron

매시간 또는 일 1회. RPC `group_buying_auto_process()` 호출:

- `deadline < NOW()` AND `status='recruiting'` 인 글:
  - paid 주문 수 >= min_participants → 'confirmed' (성사)
  - 미달 → 'cancelled' + 모든 paid 주문 'refunded'

세부 로직은 마이그 `_group_buying_orders.sql` + 후속.

## 핵심 RPC: `gb_join_atomic_v2`

`supabase/migrations/20260621000005_gb_join_atomic_v2.sql`.

이전 `gb_join_atomic` 은 "1명 = 1슬롯" 가정인데 실제 모델은 quantity 합산이라 별도 RPC.

특징:
- advisory lock → 동시 join 직렬화
- FOR UPDATE → row 잠금
- quantity 합산 (주최자 quantity 제외)
- 중복 참여 차단 (`group_buying_participants` 에 row 있는지)
- 정원 초과 차단 (return `remaining`)
- INSERT participant + UPDATE post.current_participants 한 트랜잭션

## 결제 모드 주의

### server-side 도출 의무
주문 INSERT 시 클라이언트가 `seller_id` 나 `amount` 보내지 않게. 라우트에서 `post.user_id` 와 `post.group_price * quantity` 로 도출.

### idempotency
`idempotency_key` 받으면:
1. 기존 주문 조회 → 있으면 그 주문 반환
2. INSERT 시도 → 23505 (UNIQUE 위반) 시 차감했던 포인트 환원 + 기존 주문 반환

### 포인트 사용
`points_spend_atomic` RPC. category='group_buying'. 주문 cancel/refund 시 `points_refund_spend` RPC 로 환원 (멱등).

### 포인트 롤백 패턴
주문 INSERT 실패 시 차감했던 포인트 자동 환원:
```ts
if (oErr) {
  if (pointsTxId) {
    await supabase.rpc("points_refund_spend", {
      p_tx_id: pointsTxId,
      p_reason: "주문 INSERT 실패 롤백",
    })
  }
  return ...
}
```

## visibility — plaza vs national

### `visibility = 'plaza'` (기본)
본인 광장에서만 보임.

### `visibility = 'national'`
모든 광장에서 검색 + 메인 위젯 노출. 전국 공구 (예: 인기 농산물 단체구매).

지원 인덱스: `idx_group_buying_posts_visibility ON (visibility, status, created_at DESC)`.

## 채팅 (`/chat/group-buying/[postId]`)

정원 마감 후 자동 오픈. 주최자 + 참여자 모두 입장 가능.

`chat_rooms.post_type = 'group_buying'` 또는 별도 테이블 (`group_buying_messages`) — 구체 구현은 채팅 문서 참조.

## 주의점

### 1. 결제 모드 / 무료 모드 라우트 분기
- 결제 모드 → `/api/group-buying-orders` (별도 테이블)
- 무료 모드 → `/api/group-buying/[id]/join` 의 participants 만
- 둘이 다른 라우트라 헷갈리기 쉬움

### 2. quantity 합산 vs 인원 수
초보자가 "10명 모집" 으로 이해하지만 실제로는 "총 10개 수량 모집". 5명이 각 2개 신청해도 마감.

### 3. 주최자 self-quantity
주최자가 본인 글에 quantity 반영하려면? 보통 주최자는 별도 주문/참여 안 함 (post.user_id 가 주최자 = participants 에서 제외).

### 4. deadline 타임존
`deadline` 은 TIMESTAMPTZ. UI 입력 시 사용자 로컬 → UTC 변환. RPC 안 비교는 `NOW()` (UTC).

### 5. 중복 참여 차단 가드
- 라우트의 `gb_join_atomic_v2` 가 차단
- 추가 참여 (수량 추가) UI 권장: 기존 row UPDATE 또는 새 row 막고 안내

### 6. 환불 시 group_confirmed 후 일방 취소 불가
- 모집 성사 후 (status='group_confirmed' 이상) 구매자 단독 취소는 막힘
- `/api/group-buying-orders/[id]/cancel` 가 status=='paid' 만 허용
- 그 외엔 별도 환불 라우트 (운영자 개입 필요)

## 확장 시

### 새 status 추가
- `group_buying_orders.status` CHECK 제약 변경 마이그
- 라우트 분기 로직 추가
- UI 라벨 / 버튼 분기

### 옵션 (사이즈 / 색상)
- 현재 모델은 단일 옵션. 옵션 N개 지원하려면:
- `group_buying_post_options` 새 테이블 + `group_buying_participants.option_id` FK

### 다중 판매자 (한 글에 여러 생산자)
- 현재는 1글 = 1주최자
- 다중 지원하려면 큰 리팩터 — 권장 X

## 다음 읽을 문서

- 결제 / mock-pay → `05-features/payments.md`
- 포인트 환원 → `05-features/points.md`
- 채팅방 동작 → `05-features/chat.md`
- cron 자동 처리 → `06-operations/cron-jobs.md`
