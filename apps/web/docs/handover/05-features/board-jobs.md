# 게시판 / 구인구직

## 개요

- **게시판** (`board_posts`): 일반 글타래. 카테고리 / 댓글 / 좋아요 / 신고
- **구인구직** (`jobs_posts`): 구인 (offer) / 구직 (seeking) — 시급 / 근무일 / 연락처

두 도메인이 비슷한 패턴이라 함께 정리.

## 게시판 (Board)

### 핵심 파일
```
app/(plaza)/board/                            # UI
  page.tsx                                    # 카테고리별 목록
  [category]/page.tsx                         # 카테고리 글 목록
  [category]/[id]/page.tsx                    # 글 상세 + 댓글
  new/page.tsx                                # 글 작성

app/api/board/                                # 라우트
  posts/route.ts                              # GET 목록 / POST 작성
  posts/[id]/route.ts                         # GET / PATCH / DELETE
  posts/[id]/comments/route.ts                # 댓글 GET / POST
  posts/[id]/comments/[cid]/route.ts          # 댓글 PATCH / DELETE
  posts/[id]/like/route.ts                    # 좋아요 토글
  stats/route.ts                              # 카테고리 통계 (RPC)
```

### 데이터 모델

#### `board_posts`
| 컬럼 | 의도 |
|---|---|
| id, user_id, plaza_id | |
| title, content, images (TEXT[]) | |
| category | 자유 / 정보 / 동네소식 / ... |
| region | 광장 내 동/지역 (선택) |
| reportable | BOOLEAN — 신고 가능 옵션 (어드민 설정) |
| view_count, like_count, comment_count | 캐시된 카운트 |
| status | active / hidden / deleted |

#### `board_comments`
| 컬럼 | 의도 |
|---|---|
| id, post_id, user_id | |
| parent_id | 대댓글 |
| content | |
| status | active / hidden / deleted |

#### `board_likes`
PK `(user_id, post_id)`.

### RLS 정책

여러 마이그 (4월 다수 + 6월 보강) 거치며 정착:
- SELECT: 누구나 (active 만)
- INSERT: 본인 = user_id, 광장 일치
- UPDATE: 본인 (제한 시간 내)
- DELETE: 본인 또는 어드민

### 시퀀스 — 글 작성 → 댓글
```
1. /board/new → POST /api/board/posts
   - 입력 검증 (title 길이, content 길이, 이미지 수)
   - INSERT with plaza_id, category, region
2. 다른 사용자: 글 진입 → 조회수 RPC (increment_view_count)
3. 댓글: POST /api/board/posts/[id]/comments
   - content 길이, 대댓글 parent_id 검증
   - 글쓴이에게 알림 (notify)
4. 좋아요: POST /api/board/posts/[id]/like
   - RPC change_like_count (atomic)
   - INSERT board_likes
```

### 카테고리 통계 RPC

`board_stats_aggregate(plaza_id)` (마이그 `_board_stats_aggregate_rpc.sql`):
- 카테고리별 글 수 / 댓글 수 / 좋아요 수 한 번에
- 페이지 로드 N+1 회피

### 신고 (`reportable`)
- 어드민이 카테고리 생성 시 신고 가능 옵션 토글
- `reportable=true` 인 글에만 신고 버튼 표시
- 신고 → `reports` 테이블 INSERT
- 누적 신고 시 자동 hidden / 어드민 알림

## 구인구직 (Jobs)

### 핵심 파일
```
app/(plaza)/jobs/                             # UI
  page.tsx                                    # 목록 (kind 필터)
  new/page.tsx                                # 작성
  [id]/page.tsx                               # 상세

app/api/jobs/
  route.ts                                    # GET / POST
  [id]/route.ts                               # GET / PATCH / DELETE
```

### 데이터 모델

#### `jobs_posts`
| 컬럼 | 의도 |
|---|---|
| id, user_id, plaza_id | |
| kind | 'offer' (구인) / 'seeking' (구직) |
| title, description | |
| category | 음식점 / 카페 / 사무 / 배달 / 청소 / ... |
| work_type | 정규 / 알바 / 프리랜서 |
| hourly_wage | 시급 (정수, 원) |
| work_days, work_hours | 텍스트 |
| location | 근무지 |
| contact | 연락처 (전화 / 이메일 / 카톡) |
| images (TEXT[]) | |
| status | active / closed / hidden |

### 시퀀스
```
1. 사용자: /jobs/new → POST /api/jobs
   - kind, title, hourly_wage, work_days 등
2. 다른 사용자: /jobs → 목록 조회
   - 광장 일치 필터
   - kind 필터 (offer / seeking)
   - category 필터
3. 상세 페이지: 연락처 노출
   - 일부 필드는 로그인 후만 (스팸 방어)
```

### PATCH / DELETE 권한 (Phase 1 보강)

`app/api/jobs/[id]/route.ts`:
- PATCH: 본인 또는 광장 어드민
- DELETE: 본인 또는 광장 어드민 (Phase 1 에서 PATCH 와 일관성 정렬)

```ts
const auth = await checkAdminAuth(supabase, user.id)
const isAdmin =
  auth.isLegacySuper ||
  (auth.isLegacyAdmin && canAccessPlaza(auth, postPlaza)) ||
  canAccessPlaza(auth, postPlaza)
if (!isAdmin && post.user_id !== user.id) return error
```

## 양 도메인 공통 패턴

### 광장 격리
모든 라우트에 `getCurrentPlaza()` + `eq('plaza_id', plaza)` 의무.

### 조회수
- `increment_view_count` RPC (atomic +1)
- 비동기 호출 (`void supabase.rpc(...)`) — 응답 대기 X

### 좋아요
- `change_like_count` RPC (atomic delta)
- INSERT/DELETE board_likes / club_likes / favorites

### 댓글 알림
글쓴이에게 알림 발송:
```ts
await notify(admin, {
  user_id: post.user_id,
  type: 'comment',
  title: '새 댓글',
  message: `${nickname}: ${preview}`,
  link: `/board/${category}/${postId}`,
}, currentUser.id)
```

### R2 미디어 cleanup
글 삭제 시 `deleteR2Urls(post.images)` 호출.

## 주의점

### 1. board_comments status 변경 RLS
4월 마이그 다수 (`_board_comments_status_rls`, `_board_comments_rls`) 거쳐 정착. 신중하게.

### 2. 카테고리 동적
`board_categories` 테이블 또는 `site_labels` 로 관리. 하드코딩 X.

### 3. 신고 누적 정책
- N회 이상 신고 → 자동 hidden 정책 위치 확인 필요
- 어드민 검토 후 처리 흐름

### 4. jobs.contact 노출 정책
- 비로그인 사용자에게도 노출? (스팸 위험)
- 로그인 후에만? (UX 저하)
- 마스킹 (예: 010-****-1234)?

### 5. work_type 데이터 정규화
현재 자유 텍스트 또는 enum. 검색 / 통계 위해 enum 권장.

## 확장 시

### 게시판 - 채팅 연결
글 → 직접 1:1 채팅 (`/api/chat/rooms` 와 통합)

### 구인구직 - 지원 시스템
현재 연락처 노출 모델. 지원서 / 메시지 시스템으로 발전 가능.

### 게시판 - 투표 / 설문
`board_post_polls` 새 테이블

## 다음 읽을 문서

- 신고 / 모더레이션 → `05-features/services.md` (서비스도 비슷한 패턴)
- 채팅 연결 → `05-features/chat.md`
- 알림 → `07-integrations.md`
