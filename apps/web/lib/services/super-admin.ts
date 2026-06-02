/**
 * 시크릿 슈퍼 관리자 인증 — gwangjang.app/admin 전용.
 *
 * 일반 광장 admin (plaza_admins) 과 별개로, 운영자 한 명이 모든 광장을
 * 통합 관리하기 위한 hub-only 콘솔. 로그인 정보는 환경변수 또는 하드코딩
 * 폴백 — Web Crypto HMAC 으로 세션 쿠키 서명. Edge runtime 호환.
 *
 * ⚠️ 보안: 이 콘솔의 password 는 절대 클라이언트 번들에 노출돼선 안 됨.
 *           서버 컴포넌트 / route handler / middleware 에서만 사용.
 */

// production 에선 환경변수 필수. 미설정이면 의도적으로 인증 자체가 통하지 않게
// 더미 값을 박아 둔다 (랜덤 → 비밀번호와 매칭될 일 없음, 시크릿도 매 시작마다 달라
// 기존 세션 모두 무효화). 개발 환경에서만 편의용 폴백 허용.
const isProd = process.env.NODE_ENV === 'production'

function randomFallback(label: string): string {
  if (isProd) {
    // 환경변수 누락 = 비활성화. 어떤 입력도 매칭되지 않게 매번 다른 랜덤값.
    console.error(
      `[super-admin] ${label} 환경변수가 production 에 설정되지 않음. ` +
        `슈퍼 어드민 콘솔이 비활성화 됩니다.`,
    )
    return crypto.randomUUID() + ':' + crypto.randomUUID()
  }
  return `dev-only-${label}`
}

const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || randomFallback('SUPER_ADMIN_ID')
const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || randomFallback('SUPER_ADMIN_PASSWORD')
const SUPER_ADMIN_SECRET =
  process.env.SUPER_ADMIN_SECRET || randomFallback('SUPER_ADMIN_SECRET')

export const SUPER_ADMIN_COOKIE = 'gwangjang_super'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7일

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return bytesToHex(new Uint8Array(sig))
}

/** 두 문자열을 길이/내용 모두 timing-safe 하게 비교 (XOR loop). */
function constantTimeEqual(a: string, b: string): boolean {
  // 길이 정보 자체도 누설 안 되도록 — 짧은 쪽도 같은 길이까지 순회.
  // 다만 결과는 길이 다르면 무조건 false.
  const len = Math.max(a.length, b.length)
  let mismatch = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return mismatch === 0
}

/**
 * 비밀번호 해시 검증 — `SUPER_ADMIN_PASSWORD_HASH` 가 있으면 PBKDF2 해시 비교, 없으면 평문 fallback.
 * 해시 포맷: `pbkdf2$<iterations>$<saltHex>$<hashHex>` (모두 hex)
 *   생성 예: pnpm tsx scripts/hash-super-admin-password.ts
 */
async function pbkdf2Hex(password: string, saltHex: string, iterations: number, byteLength = 32): Promise<string> {
  const enc = new TextEncoder()
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    byteLength * 8,
  )
  return bytesToHex(new Uint8Array(bits))
}

async function verifyPasswordAgainstHashOrPlain(input: string): Promise<boolean> {
  const hashEnv = process.env.SUPER_ADMIN_PASSWORD_HASH
  if (hashEnv) {
    // 해시 모드 — 권장
    const parts = hashEnv.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iters = parseInt(parts[1], 10)
    if (!Number.isFinite(iters) || iters < 10000) return false
    const saltHex = parts[2]
    const expectedHex = parts[3]
    const computed = await pbkdf2Hex(input, saltHex, iters, expectedHex.length / 2)
    return constantTimeEqual(computed, expectedHex)
  }
  // 프로덕션에선 평문 비교 절대 금지 — fail-closed.
  // hash 미등록 시 로그인 자체 차단 (env 누락 시 의도치 않은 노출 방지)
  if (isProd) {
    console.error(
      '[super-admin] PRODUCTION 에서 SUPER_ADMIN_PASSWORD_HASH 미설정. 슈퍼 로그인 차단. ' +
        'scripts/hash-super-admin-password.mjs 로 해시 생성 후 환경변수 등록 필요.',
    )
    return false
  }
  // 개발 환경에서만 평문 fallback 허용
  return constantTimeEqual(input, SUPER_ADMIN_PASSWORD)
}

/**
 * RFC 6238 TOTP 검증 — `SUPER_ADMIN_TOTP_SECRET` 이 설정된 경우에만 활성화.
 * Base32 시크릿 (Google Authenticator 호환). 30초 윈도우, ±1 step 허용.
 */
function base32ToBytes(s: string): Uint8Array {
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = s.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of cleaned) {
    const v = ALPH.indexOf(ch)
    if (v < 0) continue
    buffer = (buffer << 5) | v
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

async function totpAt(secretBase32: string, time: number): Promise<string> {
  const counter = Math.floor(time / 30)
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(counter / 0x100000000))
  view.setUint32(4, counter & 0xffffffff)
  const keyBytes = base32ToBytes(secretBase32)
  const key = await (crypto.subtle.importKey as any)(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf))
  const offset = sig[sig.length - 1] & 0xf
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export async function isTotpRequired(): Promise<boolean> {
  return !!process.env.SUPER_ADMIN_TOTP_SECRET
}

export async function verifyTotpCode(code: string): Promise<boolean> {
  const secret = process.env.SUPER_ADMIN_TOTP_SECRET
  if (!secret) return false
  if (!/^\d{6}$/.test(code)) return false
  const now = Math.floor(Date.now() / 1000)
  // ±1 step (30초) 허용
  for (const offset of [-30, 0, 30]) {
    const expected = await totpAt(secret, now + offset)
    if (constantTimeEqual(code, expected)) return true
  }
  return false
}

/** ID/비밀번호 + (옵션) TOTP 검증. timing-safe. */
export async function checkSuperAdminCredentials(id: string, pw: string, totp?: string): Promise<boolean> {
  if (!id || !pw) return false
  // 항상 두 비교를 모두 실행 — short-circuit 시간 차이로 ID 매칭 여부 누설 방지
  const idMatch = constantTimeEqual(id, SUPER_ADMIN_ID)
  const pwMatch = await verifyPasswordAgainstHashOrPlain(pw)
  if (!(idMatch && pwMatch)) return false
  // TOTP 가 환경변수로 활성화돼 있으면 검증 필수
  if (process.env.SUPER_ADMIN_TOTP_SECRET) {
    if (!totp) return false
    return await verifyTotpCode(totp)
  }
  return true
}

/**
 * 토큰 revocation version — 환경변수로 강제 폐기 가능.
 * 변경 시 기존 모든 토큰 무효화 (예: 비밀번호 유출 의심 시 SUPER_ADMIN_REVOCATION_VERSION 을 새 값으로 변경).
 */
function getRevocationVersion(): string {
  return process.env.SUPER_ADMIN_REVOCATION_VERSION || 'v1'
}

/** 새 세션 토큰 발급. payload = "exp.version" — version 변경 시 모두 무효. */
export async function issueSuperAdminToken(): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const ver = getRevocationVersion()
  const payload = `${exp}.${ver}`
  const sig = await hmacSha256(SUPER_ADMIN_SECRET, payload)
  return `${payload}.${sig}`
}

/** 쿠키 value 로 받은 토큰 검증. 위변조·만료·version mismatch 면 false. */
export async function verifySuperAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  // 새 형식: exp.version.sig (3-part), 구버전: exp.sig (2-part) — 호환 처리
  const parts = token.split('.')
  let payload: string
  let sig: string
  let exp: number
  let ver: string | null
  if (parts.length === 3) {
    // 새 형식
    payload = `${parts[0]}.${parts[1]}`
    sig = parts[2]
    exp = parseInt(parts[0], 10)
    ver = parts[1]
  } else if (parts.length === 2) {
    // 구버전 — version 추적 없음 → 강제 만료 (사용자 재로그인 1회 필요)
    return false
  } else {
    return false
  }

  const expected = await hmacSha256(SUPER_ADMIN_SECRET, payload)
  if (expected.length !== sig.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (mismatch !== 0) return false
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  // version 검증 — 환경변수 변경 시 강제 폐기
  if (ver !== getRevocationVersion()) return false
  return true
}

/** Set-Cookie 옵션 — HttpOnly + Secure + SameSite=Lax. */
export function superAdminCookieOptions(): {
  httpOnly: true
  secure: true
  sameSite: 'lax'
  path: string
  maxAge: number
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }
}
