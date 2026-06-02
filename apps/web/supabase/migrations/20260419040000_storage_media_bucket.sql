-- media 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  104857600, -- 100MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
        'video/mp4','video/quicktime','video/avi','video/webm','video/x-matroska']
)
ON CONFLICT (id) DO NOTHING;

-- 누구나 읽기 가능 (public bucket)
CREATE POLICY "media_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- 로그인한 사용자만 업로드 가능
CREATE POLICY "media_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');

-- 본인 파일만 삭제 가능
CREATE POLICY "media_owner_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[2]);
