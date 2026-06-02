import { NextResponse } from 'next/server'
import { SUPER_ADMIN_COOKIE } from '@/lib/services/super-admin'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SUPER_ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
