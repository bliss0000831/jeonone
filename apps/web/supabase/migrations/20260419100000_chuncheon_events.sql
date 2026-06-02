CREATE TABLE IF NOT EXISTS chuncheon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  location text,
  event_date date NOT NULL,
  end_date date,
  category text NOT NULL DEFAULT 'general',
  color text DEFAULT '#10b981',
  is_active boolean NOT NULL DEFAULT true,
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chuncheon_events_date ON chuncheon_events(event_date);
CREATE INDEX IF NOT EXISTS idx_chuncheon_events_active ON chuncheon_events(is_active);

ALTER TABLE chuncheon_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read chuncheon_events" ON chuncheon_events FOR SELECT USING (is_active = true);
CREATE POLICY "Admin manage chuncheon_events" ON chuncheon_events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
);

-- 기본 샘플 이벤트
INSERT INTO chuncheon_events (title, description, location, event_date, end_date, category, color) VALUES
  ('춘천 마임축제', '국제마임축제 - 국내외 마임 아티스트 공연', '공지천 유원지 일대', '2026-05-22', '2026-05-27', 'festival', '#6366f1'),
  ('춘천 닭갈비막국수축제', '춘천 대표 음식 축제', '낭만시장·중앙로 일대', '2026-06-05', '2026-06-08', 'festival', '#f59e0b'),
  ('소양강 스카이워크 야간 개장', '소양강 스카이워크 특별 야간 운영', '소양강 스카이워크', '2026-05-01', '2026-05-31', 'event', '#3b82f6'),
  ('춘천 호수 마라톤', '의암호 일주 마라톤 대회', '의암호 일원', '2026-05-10', NULL, 'sports', '#ef4444'),
  ('춘천 어린이날 행사', '어린이날 특별 체험 프로그램', '애니메이션박물관', '2026-05-05', NULL, 'event', '#10b981'),
  ('강원 독서대전', '강원도 독서문화 축제', '춘천 시립도서관', '2026-09-12', '2026-09-14', 'culture', '#8b5cf6'),
  ('춘천 레고 전시회', '국내 최대 레고 테마 전시', '춘천 어린이회관', '2026-07-01', '2026-08-31', 'exhibition', '#06b6d4'),
  ('의암제', '의암 류인석 항일의병 기념 행사', '의암공원', '2026-08-15', NULL, 'culture', '#84cc16')
ON CONFLICT DO NOTHING;
