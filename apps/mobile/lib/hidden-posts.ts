/**
 * 숨김 게시글 — AsyncStorage 에 kind 별 ID 배열 저장.
 *
 * 사용:
 *   const { hidden, hide, isHidden } = useHiddenPosts("properties")
 *   if (isHidden(post.id)) skip
 *   hide(post.id)  // 숨기기 (즉시 반영)
 *
 * 키 포맷: hidden_posts.{kind}  (kind = PostKind URL slug)
 */
import { useCallback, useEffect, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

const KEY = (kind: string) => `hidden_posts.${kind}`

// 메모리 캐시 — 같은 kind 의 여러 hook 인스턴스가 공유
const cache: Record<string, Set<string>> = {}
const listeners: Record<string, Set<(s: Set<string>) => void>> = {}

async function loadFromStorage(kind: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY(kind))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

async function persistToStorage(kind: string, set: Set<string>) {
  try {
    await AsyncStorage.setItem(KEY(kind), JSON.stringify(Array.from(set)))
  } catch {}
}

function notify(kind: string) {
  const set = cache[kind] ?? new Set<string>()
  ;(listeners[kind] ?? new Set()).forEach((cb) => cb(set))
}

export function useHiddenPosts(kind: string) {
  const [hidden, setHidden] = useState<Set<string>>(
    () => cache[kind] ?? new Set<string>(),
  )

  useEffect(() => {
    let alive = true
    if (!cache[kind]) {
      loadFromStorage(kind).then((s) => {
        if (!alive) return
        cache[kind] = s
        setHidden(new Set(s))
        notify(kind)
      })
    } else {
      setHidden(new Set(cache[kind]))
    }
    listeners[kind] ??= new Set()
    const cb = (s: Set<string>) => setHidden(new Set(s))
    listeners[kind].add(cb)
    return () => {
      alive = false
      listeners[kind]?.delete(cb)
    }
  }, [kind])

  const hide = useCallback(
    (id: string) => {
      const set = cache[kind] ?? new Set<string>()
      set.add(id)
      cache[kind] = set
      persistToStorage(kind, set)
      notify(kind)
    },
    [kind],
  )

  const unhide = useCallback(
    (id: string) => {
      const set = cache[kind] ?? new Set<string>()
      set.delete(id)
      cache[kind] = set
      persistToStorage(kind, set)
      notify(kind)
    },
    [kind],
  )

  const isHidden = useCallback((id: string) => hidden.has(id), [hidden])

  return { hidden, hide, unhide, isHidden }
}
