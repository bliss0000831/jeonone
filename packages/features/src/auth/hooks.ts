'use client'

import { useState } from 'react'
import type { AuthProfile } from './types'

export function useCurrentUser() {
  const [profile] = useState<AuthProfile | null>(null)
  const [loading] = useState(false)
  return { profile, loading }
}
