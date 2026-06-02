# 채팅

## 개요

광장의 채팅은 두 카테고리로 나뉜다.

- **1:1 채팅** (`chat_rooms`) — 매물 / 서비스 / 게시판 글 / DM 등에서 시작. buyer_id ↔ seller_id 양 당사자.
- **단체 채팅** — 모임 (clubs) / 공동구매 정원 마감 시 자동 오픈. 멤버 기반 (`club_members` / `group_buying_participants`).

Supabase Realtime channel 로 실시간 수신.

## 1:1 채팅

### 핵심 파일
```
app/(plaza)/chat/                             # UI
  page.tsx                                    # 채팅방 목록
  [roomId]/page.tsx                           # 채팅방 상세 (가장 큰 컴포넌트)

app/api/chat/                                 # 라우트
  rooms/route.ts                              # GET 목록 / POST 채팅방 생성
  rooms/[roomId]/leave/route.ts               # POST 나가기
  rooms/[roomId]/report/route.ts              # POST 신고
  
components/chat/                              # 재사용 컴포넌트
  chat-shell.tsx                              # 레이아웃
  chat-header.tsx                             # 헤더
  chat-context-card.tsx                       # 글 정보 카드
  chat-composer.tsx                           # 입력
  message-primitives.tsx                      # 버블 / 시간 표시
  participants-modal.tsx                      # 참여자 목록
```

### 데이터 모델

#### `chat_rooms`
| 컬럼 | 의도 |
|---|---|
| id, plaza_id | |
| buyer_id, seller_id | 1:1 양 당사자 |
| post_type | 'property' / 'sharing' / 'new_store' / 'local_food' / 'group_buying' / 'interior' / 'moving' / 'cleaning' / 'repair' / 'secondhand' / 'jobs' / 'direct' / 'admin_notice' |
| property_id | post 식별자 (post_type 따라 의미 다름 — 매물 / 공구 / 글 ID) |
| last_message_at, last_message_preview | 목록 정렬 / 미리보기 |
| created_at | |

> 주의: `chat_rooms.property_id` 는 post_type='property' 일 때만 properties.id. 다른 post_type 은 해당 테이블의 ID. 이름이 legacy (초기엔 매물 채팅만 있었음).

#### `messages`
| 컬럼 | 의도 |
|---|---|
| id, room_id, user_id | |
| content, image_url | 텍스트 또는 이미지 |
| created_at | |

마이그 `_chat_rooms_drop_property_fk.sql` 가 properties FK 제거 — 매물 삭제돼도 채팅 유지.

### 시퀀스 — 채팅방 생성 → 메시지

```
1. 사용자 A: 매물 페이지 → "채팅하기" → POST /api/chat/rooms
   - body: { propertyId, sellerId, postType: 'property' }
   - 서버: 기존 (buyer=A, seller=B, property_id) 룸 있으면 반환, 없으면 INSERT
2. /chat/[roomId] 진입
3. 클라이언트: GET /api/chat/rooms/[roomId]/messages
   - or 직접 supabase.from('messages').select('*').eq('room_id', roomId).order('created_at')
4. Realtime 구독:
   - supabase.channel(`room-${roomId}`).on('postgres_changes', { event: 'INSERT', table: 'messages' }, ...)
5. 메시지 전송: POST /api/chat/messages 또는 직접 supabase.from('messages').insert(...)
   - chat_rooms.last_message_at, last_message_preview 갱신 (트리거 또는 수동)
6. 다른 사용자가 같은 channel 구독 중이면 실시간 수신
```

### post_type 분기 — `loadPostContext`

`app/(plaza)/chat/[roomId]/page.tsx:188` 의 `loadPostContext` 가 post_type 에 따라 다른 테이블에서 fetch:

| post_type | 테이블 | 표시 정보 |
|---|---|---|
| `property` | properties | title, price (만원), images, status |
| `sharing` | sharing_posts | title, price |
| `new_store` | new_store_posts | title, category |
| `local_food` | local_food | title, price, unit |
| `group_buying` | group_buying_posts | title, group_price, status |
| `interior`/`moving`/`cleaning`/`repair` | {service}_posts | title, category |
| `secondhand` | secondhand_posts | title, price |
| `jobs` | jobs_posts | title, hourly_wage / category |
| `direct` | profiles (상대 사용자) | nickname, avatar (DM) |
| `admin_notice` | (없음 — 관리자 메시지) | title, message |

각 분기에서 `setPostContext(...)` 호출. 매물 / 공구 도 `setProperty(...)` 별도.

### Missing-post UI (Phase 4 미진행)

원본 글 삭제됐을 때 contextCard 가 빈 상태. → "원본 글이 삭제되었습니다" 안내 미구현.

권장 (E4):
- 각 post_type 분기에서 fetch 결과 null 시 `setPostMissing(true)`
- contextCard 분기에 placeholder 추가

### Composer (`ChatComposer`)
- 텍스트 입력
- 이미지 업로드 (R2)
- "관리자 공지" 룸은 비활성화 (답장 불가)
- closed 모임은 placeholder "마감된 모임입니다"

### 알림
메시지 INSERT 시:
- 상대방 (buyer_id 또는 seller_id) 에게 알림
- room 이 처음이면 thumbnail 첨부

## 단체 채팅 — 모임 (`/chat/club/[clubId]`)

### 핵심 파일
```
app/(plaza)/chat/club/[clubId]/page.tsx
app/api/clubs/[id]/chat/route.ts              # GET 메시지 / POST 보내기
app/api/clubs/[id]/chat/read/route.ts         # 읽음 처리
```

### 데이터 모델
- `club_members` 가 멤버십 (PK `(club_id, user_id)`, `last_read_at`)
- 메시지는 `messages` 테이블 + `club_id` 컬럼? 또는 별도 `club_messages` 테이블?
  → 코드 확인 필요. 마이그 `_club_chat.sql` 참조.

### 헤더 (Phase 1 강화)
- 참가자 strip + 인원 수 + 카운트
- 모임장만 "재모집" 버튼 (closed → recruiting)
- ⋮ 메뉴 (DropdownMenu): 모임 상세 / **채팅방 나가기** (모임장 제외, Phase 1 추가)

### Rate limit (Phase 4 추가)
`enforceRateLimit(req, 'comment', user.id)` — 분당 10건. 채팅 도배 방어.

## 단체 채팅 — 공구 (`/chat/group-buying/[postId]`)

비슷한 패턴. `group_buying_participants` 가 멤버십.

### Rate limit (Phase 4)
역시 `comment` 리밋.

## DM (`post_type='direct'`)

마이그 `_chat_rooms_direct.sql`. 일반 글 없이 직접 사용자 ↔ 사용자 채팅.

### 시작
- 프로필 페이지 → "메시지 보내기" → POST /api/chat/rooms with { otherUserId, postType: 'direct' }

### 표시
- contextCard 에 상대 프로필 (nickname / avatar) 표시
- "DM" 뱃지

## 관리자 공지 (`post_type='admin_notice'`)

- 어드민 → POST /api/admin/notify (또는 비슷)
- 사용자에게 단방향 메시지
- 답장 차단 (`isAdminNotice` 분기 → composer disabled)

## Realtime 구독

```ts
const supabase = createClient()
const channel = supabase
  .channel(`room-${roomId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `room_id=eq.${roomId}`,
  }, (payload) => {
    setMessages(prev => [...prev, payload.new as Message])
  })
  .subscribe()

return () => { channel.unsubscribe() }
```

### 주의
- 같은 channel 다중 구독 → 메모리 누수
- 페이지 떠날 때 unsubscribe
- 같은 사용자가 다른 탭에서 보낼 수도 → 본인 메시지는 즉시 표시 (낙관적 업데이트) + Realtime 으로 중복 방지

## 미디어 업로드

- ChatComposer 의 이미지 업로드 → R2 → 메시지 INSERT with `image_url`
- 큰 이미지는 thumbnail 별도 (현재 미구현 — 원본 그대로)
- 동영상 메시지는 미지원 (또는 추후)

## 신고 / 차단

### 채팅방 신고
- POST /api/chat/rooms/[roomId]/report
- reports 테이블 INSERT (target_table='chat_rooms', target_id=roomId)

### 사용자 차단 (블록)
- 미구현 (있다면 별도 테이블 / RLS)

## 주의점

### 1. post_type 분기 매번 추가
- 새 도메인 (예: 과외) 추가 시 `loadPostContext` 에 분기 추가 의무
- 14개 분기 → 추가될 수록 복잡도 증가
- 권장: post_type → fetcher 매핑 객체로 리팩터

### 2. property_id 컬럼명 misleading
- 실제로는 모든 post 의 ID
- 이름 변경 시 마이그 + 코드 전수 변경 필요 (큰 작업)
- 현재는 주석으로 안내

### 3. 마감 후 채팅 정책
- 모임: 마감 후에도 멤버는 입장 가능 (Phase 1 정책)
- 공구: 모집 마감 후 채팅 → 결제 / 운송 협의 진행

### 4. 채팅방 정리
- 영영 안 쓰는 채팅방 cleanup cron 권장 (스토리지 절감)

### 5. 메시지 전송 실패
- 네트워크 끊김 / 서버 에러
- 낙관적 업데이트 후 실패 시 retry / 사용자 알림

### 6. Realtime channel limit
- Supabase 동시 channel 수 제한 (요금제별)
- 많은 사용자 동시 채팅 시 모니터

## 확장 시

### 음성 메시지
- 녹음 → R2 업로드 → message.audio_url

### 화상 채팅
- WebRTC 통합 (별도 서비스 — Daily.co / Twilio 등)

### 메시지 검색
- Postgres FTS 인덱스
- 또는 외부 검색 (Algolia / Meilisearch)

### 메시지 편집 / 삭제
- messages 에 edited_at / deleted_at 컬럼
- UI 에서 본인 메시지만 편집 가능

## 다음 읽을 문서

- 모임 흐름 → `05-features/clubs.md`
- 공구 흐름 → `05-features/group-buying.md`
- 알림 → `07-integrations.md`
- 신고 → `06-operations/admin.md`
