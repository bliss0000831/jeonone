'use client'

import { useState } from 'react'
import type { GroupBuyingPost } from './types'

export function usePost(_id: string | null) {
  const [data] = useState<GroupBuyingPost | null>(null)
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  return { data, loading, error }
}

export function usePosts(_plaza: string | null) {
  const [data] = useState<GroupBuyingPost[]>([])
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  return { data, loading, error, refetch: () => {} }
}
