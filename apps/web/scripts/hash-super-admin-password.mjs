#!/usr/bin/env node
/**
 * SUPER_ADMIN_PASSWORD_HASH 환경변수에 넣을 PBKDF2 해시 생성.
 *
 * 사용법:
 *   node scripts/hash-super-admin-password.mjs
 *   (대화형으로 비밀번호 입력)
 *
 *   또는 비대화형:
 *   node scripts/hash-super-admin-password.mjs "원하는비밀번호"
 *
 * 출력: pbkdf2$<iterations>$<saltHex>$<hashHex>  ← 이 한 줄을 환경변수에 그대로 복사
 */
import { webcrypto } from 'node:crypto'
import readline from 'node:readline'

const ITERATIONS = 600_000

async function pbkdf2(password, salt, iterations, byteLength = 32) {
  const enc = new TextEncoder()
  const key = await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    byteLength * 8,
  )
  return new Uint8Array(bits)
}

function bytesToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function prompt(query, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      const stdin = process.stdin
      process.stdout.write(query)
      stdin.setRawMode?.(true)
      let buf = ''
      const onData = (ch) => {
        const c = String(ch)
        if (c === '') process.exit(1)
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false)
          stdin.removeListener('data', onData)
          process.stdout.write('\n')
          rl.close()
          resolve(buf)
        } else if (c === '') {
          if (buf.length) {
            buf = buf.slice(0, -1)
            process.stdout.write('\b \b')
          }
        } else {
          buf += c
          process.stdout.write('*')
        }
      }
      stdin.on('data', onData)
    } else {
      rl.question(query, (ans) => {
        rl.close()
        resolve(ans)
      })
    }
  })
}

async function main() {
  const arg = process.argv[2]
  const pw = arg || (await prompt('비밀번호 입력 (입력 숨김): ', true))
  if (!pw || pw.length < 12) {
    console.error('❌ 비밀번호는 최소 12자 이상 권장')
    process.exit(1)
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pw, salt, ITERATIONS)
  const out = `pbkdf2$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`
  console.log('\n✅ Vercel 환경변수에 추가:')
  console.log('  SUPER_ADMIN_PASSWORD_HASH=' + out)
  console.log('\n기존 SUPER_ADMIN_PASSWORD 는 제거하세요.')
}

main()
