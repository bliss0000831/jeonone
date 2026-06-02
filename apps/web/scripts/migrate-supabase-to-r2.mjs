#!/usr/bin/env node
/**
 * Supabase Storage (`media` 버킷) → Cloudflare R2 대량 복사
 *
 * 동작:
 *   1) Supabase Storage `media` 버킷의 모든 객체를 페이지네이션으로 나열
 *   2) 각 파일을 다운로드 → R2 의 같은 key 로 PutObject
 *   3) 이미 R2 에 있으면 건너뜀 (idempotent)
 *   4) 진행률/실패 로그 출력
 *
 * 주의:
 *   - 파일은 "원본" 그대로 복사됨 (WebP 변환 X). URL 매핑을 유지하기 위해서.
 *   - 실행 후 DB URL 은 별도 SQL 마이그레이션으로 일괄 치환해야 함
 *     (supabase/migrations/20260511000000_rewrite_media_urls_to_r2.sql)
 *
 * 실행:
 *   node scripts/migrate-supabase-to-r2.mjs
 *   node scripts/migrate-supabase-to-r2.mjs --dry-run   # 목록만 확인
 *   node scripts/migrate-supabase-to-r2.mjs --prefix=board/   # 특정 폴더만
 *
 * 필요 환경변수 (.env.local 자동 로드):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.join(__dirname, '..', '.env.local') })

// ─── 인자 파싱 ──────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const prefixArg = args.find((a) => a.startsWith('--prefix='))
const PREFIX = prefixArg ? prefixArg.slice('--prefix='.length) : ''
const CONCURRENCY = 8

// ─── 환경변수 검증 ─────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ACCOUNT = process.env.R2_ACCOUNT_ID
const R2_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
const SUPA_BUCKET = 'media'

const missing = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!R2_ACCOUNT) missing.push('R2_ACCOUNT_ID')
if (!R2_KEY) missing.push('R2_ACCESS_KEY_ID')
if (!R2_SECRET) missing.push('R2_SECRET_ACCESS_KEY')
if (!R2_BUCKET) missing.push('R2_BUCKET')
if (missing.length > 0) {
  console.error(`❌ 환경변수 누락: ${missing.join(', ')}`)
  process.exit(1)
}

// ─── 클라이언트 ────────────────────────────────────────
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
})

// ─── 버킷 재귀 나열 (Storage API 는 1레벨씩만 반환) ────
async function listAll(prefix = '') {
  const out = []
  const stack = [prefix]
  while (stack.length > 0) {
    const cur = stack.pop()
    let offset = 0
    const limit = 1000
    while (true) {
      const { data, error } = await supa.storage
        .from(SUPA_BUCKET)
        .list(cur, { limit, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`list(${cur}): ${error.message}`)
      if (!data || data.length === 0) break
      for (const item of data) {
        const full = cur ? `${cur.replace(/\/$/, '')}/${item.name}` : item.name
        if (item.id === null || item.metadata === null) {
          // 폴더
          stack.push(full + '/')
        } else {
          out.push({ key: full, size: item.metadata?.size ?? 0 })
        }
      }
      if (data.length < limit) break
      offset += limit
    }
  }
  return out
}

// ─── R2 에 이미 있으면 skip ──────────────────────────
async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false
    throw e
  }
}

// ─── 1개 복사 ────────────────────────────────────────
async function copyOne(key) {
  if (await existsInR2(key)) return { key, skipped: true }

  const { data, error } = await supa.storage.from(SUPA_BUCKET).download(key)
  if (error) throw new Error(`download(${key}): ${error.message}`)

  const contentType = data.type || 'application/octet-stream'
  const arrayBuf = await data.arrayBuffer()
  const body = Buffer.from(arrayBuf)

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return { key, copied: true, size: body.length }
}

// ─── 동시 실행 풀 ────────────────────────────────────
async function runPool(items, worker, concurrency) {
  let i = 0
  let ok = 0
  let fail = 0
  let skip = 0
  const total = items.length
  const errors = []

  async function next() {
    while (i < items.length) {
      const idx = i++
      const item = items[idx]
      try {
        const r = await worker(item)
        if (r?.skipped) skip++
        else ok++
      } catch (e) {
        fail++
        errors.push({ item, err: e?.message || String(e) })
      }
      if ((ok + fail + skip) % 25 === 0 || ok + fail + skip === total) {
        process.stdout.write(
          `\r진행: ${ok + fail + skip}/${total}  복사 ${ok}  skip ${skip}  실패 ${fail}`,
        )
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
  process.stdout.write('\n')
  return { ok, fail, skip, errors }
}

// ─── main ───────────────────────────────────────────
;(async () => {
  console.log('━━━ Supabase Storage → R2 마이그레이션 ━━━')
  console.log(`  Supabase: ${SUPABASE_URL} / 버킷: ${SUPA_BUCKET}`)
  console.log(`  R2:       ${R2_BUCKET} @ ${R2_ACCOUNT}`)
  if (PREFIX) console.log(`  prefix:   ${PREFIX}`)
  if (DRY_RUN) console.log('  (DRY-RUN: 목록만)')

  console.log('\n▶ 파일 목록 수집 중...')
  const files = await listAll(PREFIX)
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0)
  console.log(
    `   ${files.length}개 / ${(totalSize / 1024 / 1024).toFixed(1)} MB`,
  )

  if (DRY_RUN) {
    console.log('\n(처음 20개 미리보기)')
    for (const f of files.slice(0, 20)) {
      console.log(`  ${f.key}  (${f.size} B)`)
    }
    return
  }

  if (files.length === 0) {
    console.log('복사할 파일이 없습니다.')
    return
  }

  console.log(`\n▶ 복사 시작 (동시 ${CONCURRENCY}개)...`)
  const t0 = Date.now()
  const { ok, fail, skip, errors } = await runPool(
    files.map((f) => f.key),
    copyOne,
    CONCURRENCY,
  )
  const sec = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\n✅ 완료 — ${sec}s`)
  console.log(`   복사: ${ok}   skip(이미 있음): ${skip}   실패: ${fail}`)

  if (errors.length > 0) {
    console.log('\n❌ 실패 목록 (최대 20개):')
    for (const e of errors.slice(0, 20)) {
      console.log(`  ${e.item} — ${e.err}`)
    }
    process.exit(1)
  }

  console.log(
    '\n다음 단계: Supabase SQL Editor 에서 아래 마이그레이션 실행\n' +
      '  supabase/migrations/20260511000000_rewrite_media_urls_to_r2.sql',
  )
})().catch((err) => {
  console.error('\n💥 치명적 에러:', err)
  process.exit(1)
})
