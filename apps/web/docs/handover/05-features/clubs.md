# 모임 (Clubs)

## 개요

지역 기반 취미 / 스포츠 모임. 모임 만들기 → 참여 → 정원 마감 시 채팅방 자동 오픈 → 활동.

## 핵심 파일

```
app/(plaza)/clubs/                            # UI
  page.tsx                                    # 모임 목록 + 필터 (sport_type, skill_level, status)
  new/page.tsx                                # 모임 만들기
  [id]/page.tsx                               # 상세 + 참여/취소 버튼

app/(plaza)/chat/club/[clubId]/page.tsx       # 채팅방

app/api/clubs/                                # 라우트
  route.ts                                    # GET (목록) / POST (생성)
  [id]/route.ts                               # GET / PATCH / DELETE
  [id]/join/route.ts                          # POST 참여 / DELETE 나가기
  [id]/close/route.ts                         # POST 강제 마감
  [id]/reopen/route.ts                        # POST 재모집
  [id]/chat/route.ts                          # GET 메시지 / POST 보내기
  [id]/chat/read/route.ts                     # POST 읽음 처리
```

## 데이터 모델

### `clubs`
| 컬럼 | 의도 |
|---|---|
| id, user_id (모임장), plaza_id | |
| title, description, images | |
| sport_type | 러닝/축구/배드민턴/테니스/등산/요가/... |
| skill_level | 누구나/초급/중급/고급 |
| category | 추가 분류 (지역 / 시간대 등) |
| max_members, current_members | 정원 |
| status | recruiting / full / closed |
| meeting_date | 정모 일시 |
| location | 장소 |
| created_at, updated_at | |

### `club_members`
PK `(club_id, user_id)`. `joined_at`, `last_read_at` (채팅 읽음).

### `club_likes`
좋아요 (찜 비슷).

## 시퀀스 — 만들기 → 참여 → 마감

```
1. 모임장: /clubs/new → POST /api/clubs
   - title, sport_type, max_members, meeting_date, location
   - status='recruiting', current_members=1 (모임장 자동 포함)
   ↓
2. 사용자 B: 모임 페이지 → 참여 신청 → POST /api/clubs/[id]/join
   ↓
3. RPC club_join_atomic(club_id, user_id)
   - pg_advisory_xact_lock
   - SELECT FOR UPDATE
   - 검증: 본인 X / status 가능 / 중복 X / 정원 X
   - INSERT club_members
   - UPDATE clubs.current_members + status (full 도달 시)
   ↓
4. 정원 마감 (current >= max) → status='full'
   - 채팅방 자동 오픈 (chatOpened: true)
   - 모임장에게 'club_full' 알림
   ↓
5. 모든 멤버 채팅방 입장 가능 → /chat/club/[id]
   ↓
6. 모임 종료 → 모임장 강제 마감 → status='closed'
   - 또는 자동 (meeting_date 지나면 — 별도 cron)
```

## 핵심 RPC: `club_join_atomic`

`supabase/migrations/20260611000000_atomic_join_rpc.sql`.

```sql
PERFORM pg_advisory_xact_lock(hashtext('club_join_' || club_id));

SELECT max_members, current_members, status, user_id
  FROM clubs WHERE id = club_id FOR UPDATE;

-- 검증 ...

INSERT INTO club_members (club_id, user_id, joined_at) VALUES (...) 
  ON CONFLICT (club_id, user_id) DO NOTHING;

UPDATE clubs
  SET current_members = current_members + 1,
      status = CASE WHEN current_members + 1 >= max_members THEN 'full' ELSE 'recruiting' END
WHERE id = club_id;
```

## 모임장 권한

- 강제 마감 (`POST /api/clubs/[id]/close`) → status='closed'
- 재모집 (`POST /api/clubs/[id]/reopen`) — closed → recruiting (제한 있음)
- 모임 삭제 (DELETE) — cascade 로 club_members / messages 정리
- 멤버 제외 (별도 라우트 — 추후)

## 나가기 정책 (Phase 1 변경)

### 이전
- 모집 중 (`recruiting`) — 나갈 수 있음
- 마감 (`full` / `closed`) — 나갈 수 없음

### 현재 (Phase 1 검증 중 변경)
- 모집 중 — 나갈 수 있음, current_members 감소
- **마감 후에도 나갈 수 있음** — 인원만 감소, **status 는 유지** (재모집 방지)
- 모임장은 나갈 수 없음 (모임 삭제로 처리)
- 채팅방에서도 ⋮ 메뉴 → "채팅방 나가기" UI 추가

## API 라우트 패턴

### POST /api/clubs/[id]/join
```ts
1. auth + rate limit
2. RPC club_join_atomic
3. RPC 결과 분기
4. 성공 시: 모임장에게 알림 + (full 시) 채팅방 오픈 알림
```

### DELETE /api/clubs/[id]/join
```ts
1. auth + rate limit
2. 모임장 차단
3. 본인 멤버십 확인
4. club_members DELETE
5. clubs.current_members - 1 (마감 상태 유지)
6. 모임장에게 'club_leave' 알림
```

## 채팅방 (`/chat/club/[clubId]`)

`status='full'` 또는 `'closed'` 일 때만 입장 가능.

- 헤더: 모임명 / 참여자 수 / 메뉴 (모임 상세 / 채팅방 나가기)
- 메시지 스트림 (Supabase Realtime channel)
- 본인 + 다른 멤버 메시지 표시
- ChatComposer (텍스트 + 이미지)

자세한 건 `05-features/chat.md` 참조.

## UI 컴포넌트

### `components/club-card.tsx`
모임 목록 카드. sport 이모지 + skill 색상 + 인원 비율 바.

### `app/(plaza)/clubs/[id]/page.tsx` 액션 분기
```ts
if ((closed || full) && isMember) → "채팅방 입장" + "나가기" 두 버튼
else if (recruiting && !isMember) → "참여 신청"
else if (recruiting && isMember && !isOwner) → "참여 취소"
else if (recruiting && isOwner) → "강제 마감"
```

## 주의점

### 1. 모임장 자동 멤버 처리
- 모임 생성 시 `current_members=1` 시작, `club_members` 에는 자동 INSERT 안 됨 (관습)
- 또는 INSERT (구현에 따라 다름) — 코드 확인 필요
- "주최자 quantity 제외" 같은 공구의 패턴과 비슷한 분기 있음

### 2. status 'closed' vs 'full' 의미
- `full`: 정원 마감 (인원 도달)
- `closed`: 모임장 강제 마감 (인원 무관)
- 둘 다 채팅방 오픈 / 추가 모집 X / 나가기 가능 (Phase 1 이후)

### 3. 채팅방에서 나가기
- 마감 후 나가면 `club_members` 에서 row 삭제 → 채팅방 접근권 없어짐
- 다시 들어올 수 없음 (재참여 차단 — `recruiting` 상태가 아니라서)

### 4. 모임 삭제 시 cascade
- club_members / messages CASCADE
- 좋아요 / 알림 도 정리 (별도 cleanup 필요)

### 5. R2 미디어 cleanup
- 모임 이미지 R2 에 저장
- 삭제 시 `deleteR2Urls(images)` 호출 필요 — `lib/integrations/r2-cleanup.ts`

## 확장 시

### 정기 모임 (반복)
- 현재 1회 모임 (meeting_date 단일)
- 정기 (주간 / 월간) 지원 시 새 컬럼 (`recurrence_pattern`) + scheduled job

### 멤버 권한 layer
- 일반 멤버 vs 부모임장 vs 모임장
- `club_members.role` 컬럼 추가

### 모임 카테고리
- sport_type 외 별도 분류 (스터디 / 봉사 / 동아리)
- `category` 컬럼 활용 또는 새 enum

## 다음 읽을 문서

- 채팅 → `05-features/chat.md`
- 모임 알림 / 파일 업로드 → `07-integrations.md`
