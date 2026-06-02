/**
 * chatPrefs — 채팅 사용자 환경설정 (mute / block / 전체 알림 off).
 *
 * 스토리지 어댑터 패턴:
 *   모바일 → AsyncStorage
 *   웹     → localStorage
 *
 * createChatPrefs(adapter) 로 인스턴스 생성.
 * 각 앱에서 어댑터만 주입하면 핵심 로직은 동일.
 */

// ── Storage Adapter Interface ────────────────────────────────────
export interface ChatPrefsStorage {
  getItem(key: string): Promise<string | null> | string | null
  setItem(key: string, value: string): Promise<void> | void
}

// ── ChatPrefs 인터페이스 ─────────────────────────────────────────
export interface ChatPrefs {
  /** 변경 구독 — 컴포넌트 리렌더 트리거용 */
  subscribe(fn: () => void): () => void
  /** hydrate 완료까지 대기 */
  ready(): Promise<void>
  // Muted
  getMuted(): Set<string>
  isMuted(key: string): boolean
  toggleMuted(key: string): void
  // Blocked
  getBlocked(): Set<string>
  isBlocked(key: string): boolean
  block(key: string): void
  unblock(key: string): void
  // Notif off all
  getNotifOffAll(): boolean
  setNotifOffAll(off: boolean): void
}

// ── 키 상수 ──────────────────────────────────────────────────────
const K_MUTED = "gwangjang.chat.muted"
const K_BLOCKED = "gwangjang.chat.blocked"
const K_NOTIF_OFF_ALL = "gwangjang.chat.notifOffAll"

// ── 팩토리 함수 ──────────────────────────────────────────────────
/**
 * 스토리지 어댑터를 주입받아 chatPrefs 인스턴스 생성.
 *
 * @param storage - AsyncStorage 또는 localStorage 래퍼
 * @param onChange - (선택) 변경 시 외부 알림 (웹: CustomEvent dispatch 등)
 */
export function createChatPrefs(
  storage: ChatPrefsStorage,
  onChange?: () => void,
): ChatPrefs {
  type Listener = () => void
  const listeners = new Set<Listener>()

  let memMuted = new Set<string>()
  let memBlocked = new Set<string>()
  let memNotifOffAll = false
  let hydrated = false

  function notifyAll() {
    for (const l of listeners) l()
    onChange?.()
  }

  async function hydrate() {
    if (hydrated) return
    try {
      const [muted, blocked, off] = await Promise.all([
        storage.getItem(K_MUTED),
        storage.getItem(K_BLOCKED),
        storage.getItem(K_NOTIF_OFF_ALL),
      ])
      if (muted) {
        try { memMuted = new Set<string>(JSON.parse(muted)) } catch {}
      }
      if (blocked) {
        try { memBlocked = new Set<string>(JSON.parse(blocked)) } catch {}
      }
      memNotifOffAll = off === "true" || off === "1"
    } catch {}
    hydrated = true
    notifyAll()
  }

  // 즉시 hydrate 시작
  hydrate()

  return {
    subscribe(fn: Listener): () => void {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },

    ready(): Promise<void> {
      return hydrate()
    },

    // ── Muted ─────────────────────────────────────
    getMuted(): Set<string> {
      return new Set(memMuted)
    },
    isMuted(key: string): boolean {
      return memMuted.has(key)
    },
    toggleMuted(key: string) {
      if (memMuted.has(key)) memMuted.delete(key)
      else memMuted.add(key)
      storage.setItem(K_MUTED, JSON.stringify([...memMuted]))
      notifyAll()
    },

    // ── Blocked ───────────────────────────────────
    getBlocked(): Set<string> {
      return new Set(memBlocked)
    },
    isBlocked(key: string): boolean {
      return memBlocked.has(key)
    },
    block(key: string) {
      memBlocked.add(key)
      storage.setItem(K_BLOCKED, JSON.stringify([...memBlocked]))
      notifyAll()
    },
    unblock(key: string) {
      memBlocked.delete(key)
      storage.setItem(K_BLOCKED, JSON.stringify([...memBlocked]))
      notifyAll()
    },

    // ── Notif off all ─────────────────────────────
    getNotifOffAll(): boolean {
      return memNotifOffAll
    },
    setNotifOffAll(off: boolean) {
      memNotifOffAll = off
      storage.setItem(K_NOTIF_OFF_ALL, off ? "true" : "false")
      notifyAll()
    },
  }
}
