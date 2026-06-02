/**
 * useDebouncedValue — 입력값을 N ms 동안 안정화시킨 후 반환.
 *
 * 사용:
 *   const [q, setQ] = useState('')
 *   const debouncedQ = useDebouncedValue(q, 250)
 *   useEffect(() => { fetchSearch(debouncedQ) }, [debouncedQ])
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
