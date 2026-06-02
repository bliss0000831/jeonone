/**
 * Property 도메인 React hooks.
 *
 * 빈 stub. 점진 이전 시 useEffect + fetch 패턴을 여기 통합.
 *
 * 미래 옵션:
 *   - TanStack Query 도입 (캐싱 / refetch / optimistic 자동)
 *   - 또는 단순 useEffect + AbortController 패턴 유지
 */

'use client'

import { useEffect, useState } from 'react'
import type { Property, PropertyFilter } from './types'

/**
 * 매물 단건 fetch hook.
 * 빈 stub — 점진 이전.
 */
export function useProperty(_id: string | null): {
  data: Property | null
  loading: boolean
  error: string | null
} {
  const [data] = useState<Property | null>(null)
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  // TODO: 점진 이전. 현재는 페이지가 직접 fetch
  return { data, loading, error }
}

/**
 * 매물 목록 fetch hook.
 * 빈 stub — 점진 이전.
 */
export function useProperties(_filter: PropertyFilter): {
  data: Property[]
  loading: boolean
  error: string | null
  refetch: () => void
} {
  const [data] = useState<Property[]>([])
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  return {
    data,
    loading,
    error,
    refetch: () => {
      // TODO
    },
  }
}

/**
 * 찜 토글 hook.
 */
export function usePropertyFavorite(_propertyId: string, _initialLiked = false) {
  const [liked, setLiked] = useState(_initialLiked)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      // TODO: api/favorites POST/DELETE
      setLiked(!liked)
    } finally {
      setLoading(false)
    }
  }

  return { liked, loading, toggle }
}

// 의도적으로 사용하지 않는 import 경고 회피
void useEffect
