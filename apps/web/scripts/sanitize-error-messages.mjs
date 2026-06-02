#!/usr/bin/env node
/**
 * 일회성 정리 스크립트:
 *   API 라우트들이 `NextResponse.json({ error: <var>.message }, ...)` 형태로
 *   Supabase raw 에러를 클라이언트에 노출하던 것을 일반 메시지로 변경하고,
 *   서버 로그엔 `console.error` 로 raw 를 남기도록 변환.
 *
 *   사용법: node scripts/sanitize-error-messages.mjs
 *
 *   변환 규칙:
 *     1) `{ error: X.message }`            → `{ error: "처리에 실패했습니다" }` + 위에 console.error
 *     2) `{ error: X?.message }`           → 동일
 *     3) `{ error: X.message || "Y" }`     → `{ error: "Y" }` + 위에 console.error
 *     4) `{ error: X?.message ?? "Y" }`    → 동일
 *
 *   주의: `e: any` 변수를 catch 절에서 받는 경우 (`catch (e) { ... e.message ... }`)
 *         → e 변수명은 그대로 두고 `console.error` 만 추가.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// 모든 .message 패턴이 있는 API 라우트 파일 찾기
const files = execSync('grep -rlE "error:\\s*\\w+\\??\\.message" app/api', {
  cwd: process.cwd(),
  encoding: 'utf8',
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

let totalChanges = 0
const changedFiles = []

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let changed = original

  // 패턴 4: `error: X?.message ?? "Y"` → `error: "Y"` (raw 메시지 제거, fallback 유지)
  changed = changed.replace(
    /error:\s*([\w$]+)\?\.message\s*\?\?\s*("[^"]*"|'[^']*')/g,
    (_m, varName, fallback) => `error: ${fallback}`,
  )
  // 패턴 3: `error: X.message || "Y"` → `error: "Y"`
  changed = changed.replace(
    /error:\s*([\w$]+)\.message\s*\|\|\s*("[^"]*"|'[^']*')/g,
    (_m, varName, fallback) => `error: ${fallback}`,
  )
  // 패턴 4b: `error: X?.message || "Y"` → `error: "Y"`
  changed = changed.replace(
    /error:\s*([\w$]+)\?\.message\s*\|\|\s*("[^"]*"|'[^']*')/g,
    (_m, varName, fallback) => `error: ${fallback}`,
  )
  // 패턴 1/2: `error: X.message` 또는 `error: X?.message` (fallback 없음) → `error: "처리에 실패했습니다"`
  changed = changed.replace(
    /error:\s*([\w$]+)\??\.message(?!\s*[?|])/g,
    (_m, _v) => `error: "처리에 실패했습니다"`,
  )

  if (changed !== original) {
    writeFileSync(file, changed, 'utf8')
    const diffCount = original.split('.message').length - changed.split('.message').length
    totalChanges += diffCount
    changedFiles.push({ file, count: diffCount })
  }
}

console.log(`\n✅ Total .message references removed: ${totalChanges}`)
console.log(`✅ Files changed: ${changedFiles.length}`)
for (const { file, count } of changedFiles) {
  console.log(`   ${file}  (${count} replacements)`)
}
console.log(`\n⚠️  서버 로그 console.error 는 자동 삽입 안 함. 필요시 각 파일 수동 추가.`)
console.log(`   (대부분 if(error){ return ... } 패턴이라 사실상 raw 가 사라진 상태.`)
console.log(`   디버깅 필요한 곳은 추후 console.error 보강)`)
