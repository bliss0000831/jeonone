# 09 — 마이그레이션 히스토리

## 개요

총 **120+ 개**의 SQL 마이그레이션. 시점별로 어떤 변경이 있었는지 / 왜 했는지 / 무엇에 영향이 있는지 정리. 코드와 함께 가는 시간순 일기.

신규 합류자는 처음엔 *최근 30개* 만 보고 핵심 마일스톤만 파악하면 충분. 오래된 것들은 누적된 결과로만 의미 있음.

## 마일스톤

### 2026-04 초기 / 게시판 / 채팅
| 시점 | 파일 | 의도 |
|---|---|---|
| 04-19 | `_board_schema`, `_board_comments_rls`, `_board_images` | 게시판 토대 |
| 04-19 | `_storage_media_bucket`, `_fix_rls_permissive` | 스토리지 버킷 + RLS |
| 04-19 | `_club_chat`, `chuncheon_events` | 모임 채팅, 춘천 이벤트 시드 |
| 04-20 | `_group_buying_chat`, `_expert_invitations` | 공구 채팅, 전문가 초대 |
| 04-21 | `_admin_tables_consolidated`, `_performance_indexes` | 어드민 통합 + 인덱스 1차 |
| 04-22 | `_hero_banners_extend` | hero 배너 확장 |
| 04-23~25 | `_properties_instagram_url`, `_youtube_url`, `_pension_type` | 매물 컬럼 추가 |

### 2026-05 매물 + AI 비디오
| 시점 | 파일 | 의도 |
|---|---|---|
| 05-04 | `_chat_rooms_drop_property_fk` | property FK 제거 (매물 삭제 시 채팅 유지) |
| 05-05 | `_property_requests` | 매물 요청 글 |
| 05-06~10 | `_notifications_*` | 알림 RLS 정리 (반복 fix) |
| 05-11 | `_rewrite_media_urls_to_r2` | Supabase Storage → R2 마이그 |
| 05-12~16 | `_ai_video_*` | AI 비디오 (fal.ai 통합) |
| 05-17 | `_secondhand_jobs_moderation` | 중고/구인 모더레이션 |
| 05-18 | `_page_heroes` | 페이지별 hero 배너 |
| 05-20 | `_fix_function_search_path`, `_drop_redundant_rls_policies` | 함수 안전성 + RLS 정리 |
| 05-20 | `_lock_down_storage_policies` | 스토리지 정책 잠금 |

### 2026-05 멀티-광장 토대 (큰 마일스톤)
| 시점 | 파일 | 의도 |
|---|---|---|
| 05-21 | `_multi_plaza_foundation` | **plazas / plaza_admins / plaza_profiles 테이블 + 모든 콘텐츠에 plaza_id 추가** |
| 05-21 | `_plazas_full_seed` | 17개 광장 시드 (춘천 active + 다른 권역 open_soon) |
| 05-21 | `_admin_reset_and_auto_grant` | plaza_admins 자동 부여 트리거 |
| 05-21 | `_plazas_tour_codes` | 한국관광공사 API 코드 매핑 |
| 05-22 | `_billing_foundation` | subscriptions / transactions / payouts |
| 05-23 | `_boost_and_business_detection` | boost / business detection |
| 05-24 | `_property_panoramas` | 360° 파노라마 이미지 |
| 05-25 | **`_points_foundation`** | **point_transactions / user_points / point_rules / point_redemption_settings** |

### 2026-06 포인트 정교화 + 광장 확장
| 시점 | 파일 | 의도 |
|---|---|---|
| 06-01 | `_points_audit_fixes` | 포인트 audit fix |
| 06-02 | `_service_tables_indexes` | 서비스 (인테리어 등) 인덱스 |
| 06-03 | `_favorites_count_rpc` | 매물 favorites 수 RPC |
| 06-04 | `_profile_sub_region` | 프로필 동/지역 컬럼 |
| 06-05 | `_perf_composite_indexes`, `_property_requests_auth_select` | 인덱스 / RLS |
| 06-06 | `_likes_privacy_moderation` | 좋아요 사생활 / 모더레이션 |
| 06-06 | `_open_wonju_plaza` | 원주광장 활성화 |
| 06-06 | `_points_rules_complete`, `_bump_foundation`, `_bump_tickets`, `_audit_check_constraints` | bump (글 올리기) 시스템 + audit |
| 06-06 | `_partial_effective_at_indexes` | partial index 최적화 |
| 06-06 | **`_atomic_rpcs`** | **points_spend_atomic / points_confirm_one / points_revert_one / bump_purchase_ticket_atomic** |

### 2026-06 어드민 / 사이트 라벨
| 시점 | 파일 | 의도 |
|---|---|---|
| 06-07 | `_admin_override_all_posts`, `_profiles_notification_prefs` | 어드민 override 정책 |
| 06-07 | `_plaza_admins_super_write_recursion_fix` | RLS recursion 방지 |
| 06-07 | `_site_labels` 시리즈 (10개) | UI 라벨 동적 관리 시스템 |

### 2026-06 보안 / 동시성 / 콘텐츠 확장
| 시점 | 파일 | 의도 |
|---|---|---|
| 06-08 | `_board_reportable` | 게시판 신고 가능 옵션 |
| 06-09 | `_board_posts_region` | 게시판 지역 컬럼 |
| 06-10 | **`_security_hardening_pack`** | **보안 강화 일괄 (RLS 강화 등)** |
| 06-11 | **`_atomic_join_rpc`** | **gb_join_atomic / club_join_atomic (TOCTOU 차단)** |
| 06-12 | `_chat_rooms_direct` | 다이렉트 메시지 (post_type='direct') |
| 06-13 | `_change_like_count_rpc` | 좋아요 atomic RPC |
| 06-14 | **`_local_food_orders`** | **로컬푸드 주문 + 정산 + 웹훅 멱등성 테이블** |
| 06-15 | **`_plaza_payments_and_gb_visibility`** | **PortOne 채널키 컬럼 + 공구 visibility (plaza/national)** |
| 06-16 | `_local_food_orders_points_used` | 로컬푸드 주문 + 포인트 사용 |
| 06-17 | `_group_buying_orders` | 공구 주문 별도 테이블 |
| 06-18 | **`_neighbor_star_system`** | **이웃 별 (5점 별점) 시스템 — 36.5°C 신뢰지수에서 전환** |
| 06-19 | `_property_account_type_sync` | agent revoke 시 매물 처리 트리거 |
| 06-20 | `_board_stats_aggregate_rpc` | 게시판 통계 RPC |

### 2026-06-21 Phase 1 (이번 세션 추가)
| 파일 | 의도 |
|---|---|
| `_reviews_rls` | reviews 테이블 SELECT/INSERT/UPDATE/DELETE 정책 명시 + 7일 수정 제한 |
| `_plazas_sensitive_columns` | column-level GRANT — PortOne 채널키 / 사업자번호 격리 |
| `_local_food_orders_column_guard` | BEFORE UPDATE 트리거 — 결제 핵심 컬럼 동결 |
| `_points_refund_spend_rpc` | spend tx 환원 RPC (주문 취소 시 포인트 복구) |
| `_orders_idempotency_key` | local_food/group_buying orders idempotency_key + UNIQUE 인덱스 |
| `_gb_join_atomic_v2` | 공구 quantity 합산 모델 atomic RPC |
| `_drop_invalid_point_transactions_trigger` | 잘못 붙은 updated_at 트리거 제거 (RPC silently 실패 버그 fix) |

## 마이그 작성 패턴

### 표준 구조
```sql
-- ============================================================================
-- 제목 (한 줄 요약)
--
-- 배경: 왜 필요한가
-- 동작: 어떤 변경
-- Rollback:
--   <SQL>
-- ============================================================================

BEGIN;

-- 변경 ...

NOTIFY pgrst, 'reload schema';

COMMIT;
```

### 안전한 변경 (idempotent)
- `CREATE TABLE IF NOT EXISTS`
- `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS … BEFORE CREATE`

### 위험한 변경 (별도 절차)
- `DROP COLUMN` / `DROP TABLE` — backup 후
- `ALTER COLUMN ... NOT NULL` — 기존 NULL 제거 후
- 결제 관련 컬럼 변경 — 컬럼 동결 트리거 검토

### 파일명 규칙
- `YYYYMMDDhhmmss_snake_case.sql` — timestamp 가 sequence
- 같은 PR 의 여러 마이그는 sub-second 자리 활용 (`20260621000001`, `_000002`)

## RPC 함수 카탈로그

자주 쓰이는 RPC + 어디서 호출되는지:

| RPC | 용도 | 호출 위치 |
|---|---|---|
| `increment_view_count(table, id, column)` | 조회수 atomic +1 | property/clubs/group-buying GET |
| `change_like_count(table, id, delta)` | 좋아요 카운트 atomic | favorites toggle |
| `update_neighbor_star(user_id)` | 별점 평균 재계산 | reviews trigger |
| `update_trust_score(user_id)` | alias for update_neighbor_star | legacy 호환 |
| `points_spend_atomic(user_id, plaza_id, category, amount, payment_total, source_id)` | 포인트 사용 차감 | order POST |
| `points_confirm_one(tx_id)` | pending → confirmed | evaluate-points cron |
| `points_revert_one(tx_id, reason)` | earn 회수 | 신고 시 |
| **`points_refund_spend(tx_id, reason)`** | **spend 환원** | **order cancel/refund** |
| `bump_purchase_ticket_atomic(...)` | bump 티켓 차감 + 글 bumped_at 갱신 | bump POST |
| `club_join_atomic(club_id, user_id)` | 모임 참여 (advisory lock) | clubs join POST |
| **`gb_join_atomic_v2(post_id, user_id, quantity, ...)`** | **공구 참여 (quantity 합산)** | **group-buying join POST** |
| `gb_join_atomic` (legacy 1슬롯=1자리) | 사용 X — v2 사용 권장 | (deprecated) |
| `get_property_favorite_counts(plaza_id, ids[])` | 다수 매물 favorites 수 한 번에 | properties GET |
| `group_buying_auto_process()` | 마감일 지난 공구 자동 처리 | cron |
| `board_stats_aggregate(...)` | 게시판 카테고리별 통계 | board page |

## RPC 작성 가이드

### SECURITY DEFINER 사용 시 주의
RLS 우회. 인자 검증 + search_path 고정 (`SET search_path = public, pg_temp`) 필수.

### 멱등성
재호출 시 같은 결과 (또는 no-op) 보장. cancel / refund 같은 곳 필수.

### advisory_xact_lock 활용
TOCTOU 차단:
```sql
PERFORM pg_advisory_xact_lock(hashtext('club_join_' || p_club_id::text));
```

### FOR UPDATE
같은 트랜잭션 안에서 row 변경할 때:
```sql
SELECT max_members, current_members FROM clubs WHERE id = ... FOR UPDATE;
```

### GRANT EXECUTE
함수 만든 후:
```sql
REVOKE ALL ON FUNCTION xxx FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xxx TO authenticated, service_role;
```

## 마이그 적용 / 롤백

### 로컬 dev
```bash
supabase db reset           # 모든 마이그 재실행
supabase migration up       # 미적용 마이그만
```

### Production
```bash
supabase db push            # 원격 DB 에 미적용 마이그 push
```

### 롤백
- 각 마이그 파일 하단 주석에 rollback SQL
- 또는 새 마이그로 역방향 변경 추가 (forward-only 권장)

### 위험 마이그 적용 시
1. Production 점검 모드 ON
2. DB backup
3. `supabase db push`
4. 검증 (smoke SQL)
5. 점검 모드 OFF

## 흔한 함정

### 1. NOTIFY pgrst 빠뜨림
PostgREST schema 캐시 갱신 안 됨 → "column not found" 에러. 컬럼/함수 추가 후엔 의무.

### 2. trigger 가 잘못된 컬럼 참조
`billing_set_updated_at()` 같은 공용 트리거는 `updated_at` 컬럼 있는 테이블에만 붙여야. 없으면 모든 UPDATE 가 silent 실패. (Phase 1 검증 중 발견)

### 3. RLS recursion
정책 안에서 같은 테이블 SELECT 하면 무한 재귀. `SECURITY DEFINER` 함수로 우회 또는 정책 단순화.

### 4. CHECK constraint 추가 시 기존 데이터 위반
`ALTER TABLE ... ADD CONSTRAINT ... CHECK ...` 는 기존 row 검증. 위반 row 있으면 실패. 먼저 데이터 정리.

### 5. UNIQUE 인덱스가 NULL 허용
NULL 은 UNIQUE 비교에서 다르게 취급. partial unique index (`WHERE col IS NOT NULL`) 권장.

## 다음 읽을 문서

- 데이터 모델 전체 → `04-data-model.md`
- 배포 / 롤백 → `11-deployment.md`
- 알려진 이슈 → `10-known-issues.md`
