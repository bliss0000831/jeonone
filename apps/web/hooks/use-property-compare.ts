"use client"

import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "property-compare-ids"
const MAX_COMPARE = 3
const EVENT_NAME = "property-compare-change"

// ---- tiny external store (shared across all hook consumers) ----

function getSnapshot(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function getServerSnapshot(): string[] {
  return []
}

let cached: string[] = getSnapshot()

function subscribe(cb: () => void): () => void {
  const handler = () => {
    cached = getSnapshot()
    cb()
  }
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener("storage", handler)
  }
}

function persist(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  cached = ids
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

// ---- hook ----

export function usePropertyCompare() {
  const compareIds = useSyncExternalStore(subscribe, () => cached, getServerSnapshot)

  const addToCompare = useCallback((id: string) => {
    const cur = getSnapshot()
    if (cur.includes(id) || cur.length >= MAX_COMPARE) return
    persist([...cur, id])
  }, [])

  const removeFromCompare = useCallback((id: string) => {
    const cur = getSnapshot()
    persist(cur.filter((v) => v !== id))
  }, [])

  const toggleCompare = useCallback((id: string) => {
    const cur = getSnapshot()
    if (cur.includes(id)) {
      persist(cur.filter((v) => v !== id))
    } else {
      if (cur.length >= MAX_COMPARE) return false
      persist([...cur, id])
    }
    return true
  }, [])

  const isInCompare = useCallback(
    (id: string) => compareIds.includes(id),
    [compareIds],
  )

  const clearCompare = useCallback(() => {
    persist([])
  }, [])

  return { compareIds, addToCompare, removeFromCompare, toggleCompare, isInCompare, clearCompare }
}
