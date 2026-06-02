/**
 * Cloudflare R2 — S3 호환 이미지/파일 저장소
 *
 * 왜 R2?
 *   - 다운로드(egress) 비용 $0 → 트래픽 늘어도 과금 폭탄 없음
 *   - 무료 티어 10GB 저장 + 월 10M 읽기
 *   - S3 호환 API → aws-sdk 그대로 사용
 *
 * 이미지는 업로드 시 sharp 로 WebP 변환 + 리사이즈 → 저장 용량 60~70% 절감
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import crypto from 'node:crypto'

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET
const PUBLIC_URL = process.env.R2_PUBLIC_URL

function getClient(): S3Client {
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error('R2 환경변수가 설정되지 않았습니다 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  })
}

function ensureBucket(): string {
  if (!BUCKET) throw new Error('R2_BUCKET 환경변수가 없습니다')
  return BUCKET
}

function ensurePublicUrl(): string {
  if (!PUBLIC_URL) throw new Error('R2_PUBLIC_URL 환경변수가 없습니다')
  return PUBLIC_URL.replace(/\/$/, '')
}

/**
 * 키 생성: folder/userId/timestamp-rand.ext
 */
export function makeR2Key(folder: string, userId: string, ext: string): string {
  const safeExt = (ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin'
  const ts = Date.now()
  const rand = crypto.randomBytes(4).toString('hex')
  return `${folder}/${userId}/${ts}-${rand}.${safeExt}`
}

/**
 * 업로드 본체 (Buffer → R2 → 공개 URL)
 */
export async function uploadBufferToR2(params: {
  key: string
  body: Buffer
  contentType: string
  cacheControl?: string
}): Promise<string> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: ensureBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl || 'public, max-age=31536000, immutable',
    }),
  )
  return `${ensurePublicUrl()}/${params.key}`
}

/**
 * 파일 삭제 (key 는 공개 URL 뒤 경로만)
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: ensureBucket(), Key: key }))
}

/**
 * 공개 URL → 내부 key 역산
 *   https://pub-xxx.r2.dev/board/uid/123-abc.webp
 *   → board/uid/123-abc.webp
 */
export function urlToR2Key(url: string): string | null {
  const base = ensurePublicUrl()
  if (!url.startsWith(base + '/')) return null
  return url.slice(base.length + 1)
}

/**
 * 이미지 업로드: WebP 변환 + 리사이즈 + 업로드
 *   - 원본 JPEG 4MB → WebP 400KB 정도로 절감
 *   - 긴 변 기준 1920px 제한
 */
export async function uploadImageToR2(params: {
  folder: string
  userId: string
  file: Buffer
  originalName: string
  maxWidth?: number
  quality?: number
}): Promise<{ url: string; key: string; size: number }> {
  const { folder, userId, file, originalName, maxWidth = 1920, quality = 82 } = params

  // GIF/애니메이션은 WebP 애니메이션 유지
  const meta = await sharp(file, { animated: true }).metadata()
  const isAnimated = (meta.pages ?? 1) > 1

  let processed: Buffer
  let ext = 'webp'
  let contentType = 'image/webp'

  if (isAnimated) {
    // 애니메이션 GIF → 애니메이션 WebP
    processed = await sharp(file, { animated: true })
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer()
  } else {
    processed = await sharp(file, { failOn: 'none' })
      .rotate() // EXIF orientation 보정
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  }

  const key = makeR2Key(folder, userId, ext)
  const url = await uploadBufferToR2({ key, body: processed, contentType })
  return { url, key, size: processed.length }
}

/**
 * 비디오/기타 파일: 원본 그대로 업로드
 */
export async function uploadRawToR2(params: {
  folder: string
  userId: string
  file: Buffer
  originalName: string
  contentType: string
}): Promise<{ url: string; key: string; size: number }> {
  const { folder, userId, file, originalName, contentType } = params
  const ext = originalName.split('.').pop() || 'bin'
  const key = makeR2Key(folder, userId, ext)
  const url = await uploadBufferToR2({ key, body: file, contentType })
  return { url, key, size: file.length }
}
