'use client'

import { useState } from 'react'
import type { Club, ClubFilter } from './types'

/** stub — 점진 이전 */
export function useClub(_id: string | null) {
  const [data] = useState<Club | null>(null)
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  return { data, loading, error }
}

export function useClubs(_filter: ClubFilter) {
  const [data] = useState<Club[]>([])
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  return { data, loading, error, refetch: () => {} }
}
