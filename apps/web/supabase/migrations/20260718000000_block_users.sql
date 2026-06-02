-- ============================================================
-- block_users — 사용자 ↔ 사용자 차단 관계 (전역).
--
-- 채팅방 단위 차단 (chatPrefs / AsyncStorage) 과 별개:
-- - block_users 는 DB-level 영구 차단
-- - 모든 광장에 동일하게 적용 (글로벌)
-- - 차단된 사용자의 글·댓글·DM 은 클라이언트에서 필터링
--
-- 사용 시나리오:
--   1) 프로필에서 "차단" 버튼 → blocker_id, blocked_id 행 추가
--   2) mypage/blocked 페이지에서 목록 + 해제
--   3) 글 리스트·채팅 리스트 쿼리에서 in-memory 필터
-- ============================================================

CREATE TABLE IF NOT EXISTS public.block_users (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- 역방향 조회용 인덱스 (내가 차단당한 적 있는가)
CREATE INDEX IF NOT EXISTS block_users_blocked_idx
  ON public.block_users (blocked_id);

-- RLS: 본인의 차단 관계만 조회/생성/삭제 가능
ALTER TABLE public.block_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS block_users_select_own ON public.block_users;
CREATE POLICY block_users_select_own ON public.block_users
  FOR SELECT USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS block_users_insert_own ON public.block_users;
CREATE POLICY block_users_insert_own ON public.block_users
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS block_users_delete_own ON public.block_users;
CREATE POLICY block_users_delete_own ON public.block_users
  FOR DELETE USING (auth.uid() = blocker_id);

-- 추가: 차단된 사용자가 차단 사실을 확인할 수 있게 하면 가스라이팅 가능 →
-- blocked_id 본인은 자신의 차단 상태를 조회할 수 없도록 SELECT 정책 미부여.

COMMENT ON TABLE public.block_users IS '사용자 ↔ 사용자 글로벌 차단 (광장 무관)';
