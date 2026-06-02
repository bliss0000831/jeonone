/**
 * 옛 Vercel Blob 이미지(/api/file?pathname=X)를 R2 로 이전 + DB URL 업데이트.
 *
 * 사용:
 *   node --env-file=.env.local scripts/migrate-vercel-blob-to-r2.mjs
 *
 * 동작:
 *   1) DB 의 image 배열에서 "/api/file?pathname=" 패턴 검색
 *   2) Vercel Blob 에서 fetch → R2 업로드 (같은 path 그대로 유지)
 *   3) DB 의 해당 URL 을 R2 public URL 로 치환
 *
 * 멱등: 다시 돌려도 안전 (이미 R2 업로드된 키는 덮어쓰지만 동일 내용).
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { get } from '@vercel/blob'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ACCOUNT = process.env.R2_ACCOUNT_ID
const R2_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
const R2_PUBLIC = process.env.R2_PUBLIC_URL

if (!SB_URL || !SB_KEY || !R2_ACCOUNT || !R2_KEY_ID || !R2_SECRET || !R2_BUCKET || !R2_PUBLIC) {
  console.error('환경변수 누락')
  process.exit(1)
}

const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET },
})

const TABLES = [
  'sharing_posts',
  'group_buying_posts',
  'local_food',
  'new_store_posts',
  'moving_posts',
  'cleaning_posts',
  'repair_posts',
]

const PATTERN = /^\/api\/file\?pathname=(.+)$/

function getR2KeyFromOldUrl(url) {
  const m = url.match(PATTERN)
  if (!m) return null
  return decodeURIComponent(m[1])
}

async function r2Has(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function migrateOne(oldUrl) {
  const key = getR2KeyFromOldUrl(oldUrl)
  if (!key) return { ok: false, reason: 'invalid_pattern' }
  const newUrl = `${R2_PUBLIC}/${key}`

  // 이미 R2 에 있으면 URL 만 치환
  if (await r2Has(key)) {
    return { ok: true, url: newUrl, copied: false }
  }

  // Vercel Blob 에서 fetch
  let blob
  try {
    blob = await get(key, { access: 'private' })
  } catch (e) {
    return { ok: false, reason: 'blob_fetch_failed', error: e.message }
  }
  if (!blob) return { ok: false, reason: 'blob_not_found' }

  // stream → buffer
  const chunks = []
  for await (const chunk of blob.stream) {
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)

  // R2 업로드 (같은 key)
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: blob.blob.contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return { ok: true, url: newUrl, copied: true, size: body.length }
}

async function main() {
  let totalCopied = 0
  let totalReplaced = 0
  let totalFailed = 0
  const failures = []

  for (const t of TABLES) {
    console.log(`\n=== ${t} ===`)
    // postgrest 에서 array text cast 필터 제한 → 풀 스캔 + JS 필터
    const { data: rows, error } = await sb.from(t).select('id, images').limit(5000)
    if (error) {
      console.error(`  ${t} select error:`, error.message)
      continue
    }
    const targets = (rows ?? []).filter(
      (r) =>
        Array.isArray(r.images) &&
        r.images.some((u) => typeof u === 'string' && u.includes('/api/file')),
    )

    console.log(`  ${targets.length} rows to migrate`)
    for (const row of targets) {
      const newImages = []
      let changed = false
      for (const url of row.images) {
        if (!url.includes('/api/file')) {
          newImages.push(url)
          continue
        }
        const r = await migrateOne(url)
        if (!r.ok) {
          console.error(`  ✗ row ${row.id} url ${url}: ${r.reason}${r.error ? ' (' + r.error + ')' : ''}`)
          failures.push({ table: t, id: row.id, url, reason: r.reason })
          totalFailed += 1
          // 실패한 URL 은 그대로 둠 — 부분 성공도 OK
          newImages.push(url)
          continue
        }
        if (r.copied) totalCopied += 1
        newImages.push(r.url)
        changed = true
      }
      if (changed) {
        const { error: upErr } = await sb.from(t).update({ images: newImages }).eq('id', row.id)
        if (upErr) {
          console.error(`  ✗ row ${row.id} update failed:`, upErr.message)
          totalFailed += 1
        } else {
          console.log(`  ✓ ${row.id} updated`)
          totalReplaced += 1
        }
      }
    }
  }

  console.log(`\n=== 완료 ===`)
  console.log(`R2 복사: ${totalCopied}`)
  console.log(`DB 갱신: ${totalReplaced} rows`)
  console.log(`실패: ${totalFailed}`)
  if (failures.length > 0) {
    console.log('\n실패 목록:')
    for (const f of failures) console.log(`  ${f.table} ${f.id} ${f.url} → ${f.reason}`)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
