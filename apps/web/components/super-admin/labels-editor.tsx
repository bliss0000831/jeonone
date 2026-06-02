"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  Save,
  RotateCcw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Upload,
  X as XIcon,
  Image as ImageIcon,
} from "lucide-react"
// SiteLabel 타입은 server lib 에 정의돼 있으나 client 번들이 server 모듈을
// 끌어가지 않도록 타입을 inline 으로 재선언
interface SiteLabel {
  key: string
  value: string
  fallback: string
  description: string | null
  group_name: string
  sort_order: number
  max_length: number | null
  image_url: string | null
  recommended_size: string | null
}
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const GROUP_LABEL: Record<string, string> = {
  nav: "햄버거 메뉴 — 텍스트",
  "nav-icons": "햄버거 메뉴 — 아이콘",
  home: "홈 화면 카드 — 텍스트",
  "home-icons": "홈 화면 카드 — 아이콘",
  "home-mininav-icons": "홈 상단 미니 네비 — 아이콘",
  "home-section-icons": "홈 섹션 헤더 — 아이콘",
  "home-hub": "홈 매물·홈케어 허브",
  "home-widgets": "홈 위젯 (소식·화장실 등)",
  "home-mininav": "홈 미니네비 — 라벨",
  misc: "기타",
}

// ── 탭 정의 ──────────────────────────────────────────────────
type TabId = "nav" | "home" | "misc" | "all"
const TABS: { id: TabId; label: string; groups: string[] }[] = [
  { id: "all",  label: "전체",        groups: [] /* 빈 배열 = 전체 */ },
  { id: "nav",  label: "햄버거 메뉴", groups: ["nav", "nav-icons"] },
  { id: "home", label: "홈 화면",     groups: ["home", "home-icons", "home-mininav-icons", "home-mininav", "home-section-icons", "home-hub", "home-widgets"] },
  { id: "misc", label: "기타",        groups: ["misc"] },
]

// 이모지·이미지 입력이 가능한 키 패턴
function isIconKey(key: string) {
  return key.endsWith(".icon")
}

export function LabelsEditor({ initial }: { initial: SiteLabel[] }) {
  const [items, setItems] = useState<SiteLabel[]>(initial)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<TabId>("nav")

  // 탭별 그룹 + 검색 필터
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tab = TABS.find((t) => t.id === activeTab)
    const allowedGroups = tab?.groups || []
    const map = new Map<string, SiteLabel[]>()
    for (const it of items) {
      const g = it.group_name || "misc"
      // 탭 필터 (검색 중이면 탭 무시하고 전체 검색)
      if (!q && activeTab !== "all" && allowedGroups.length > 0 && !allowedGroups.includes(g)) {
        continue
      }
      if (q) {
        const hay = `${it.key} ${it.value} ${it.fallback} ${it.description ?? ""}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    }
    return [...map.entries()]
  }, [items, query, activeTab])

  // 탭별 항목 수 (변경 안 함)
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of TABS) {
      if (t.id === "all") counts[t.id] = items.length
      else counts[t.id] = items.filter((it) => t.groups.includes(it.group_name || "misc")).length
    }
    return counts
  }, [items])

  const dirtyCount = Object.keys(edited).length

  const updateValue = (key: string, value: string) => {
    setEdited((prev) => {
      const original = items.find((x) => x.key === key)?.value ?? ""
      const next = { ...prev }
      if (value === original) delete next[key]
      else next[key] = value
      return next
    })
  }

  const saveAll = async () => {
    if (dirtyCount === 0) return
    setSaving(true)
    setError(null)
    const updates = Object.entries(edited).map(([key, value]) => ({ key, value }))
    try {
      const res = await fetch("/api/super-admin/site-labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "저장 실패")
        return
      }
      // 적용된 값을 items 에 반영
      setItems((prev) =>
        prev.map((it) => (it.key in edited ? { ...it, value: edited[it.key] } : it)),
      )
      setEdited({})
      setSavedAt(Date.now())
    } catch (e: any) {
      setError(e?.message || "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  const resetToFallback = async (key: string) => {
    if (!confirm("이 라벨을 기본값으로 되돌릴까요?")) return
    try {
      const res = await fetch("/api/super-admin/site-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "초기화 실패")
        return
      }
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, value: data.value } : it)))
      setEdited((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch {
      toast.error("초기화 실패")
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 h-14">
          <Link
            href="/super-admin"
            className="p-2 -ml-2 hover:bg-secondary rounded-full"
            aria-label="대시보드로"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold">사이트 라벨 관리</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* 안내 */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">전역 적용 — 모든 광장에 영향</p>
              <p className="mt-1">
                여기서 변경한 값은 <strong>모든 광장의 모든 사용자</strong> 에게 즉시(다음 페이지 로드부터)
                반영됩니다. 광장별로 다른 값을 쓰시려면 별도 기능이 필요합니다.
              </p>
              <p className="mt-1">
                <code className="bg-amber-500/10 px-1 rounded text-[11px]">{"{{plaza_city}}"}</code>{" "}
                토큰을 쓰면 광장 도시명(예: 춘천)이 자동 치환됩니다.
              </p>
              <p className="mt-1">
                각 입력 아래에 <strong>권장 글자 수</strong>가 표시되니 디자인이 깨지지 않게 참고하세요.
              </p>
            </div>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키 / 값 / 설명 검색 (검색 시 모든 탭에서 찾음)"
            className="w-full h-11 pl-9 pr-3 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* 탭 */}
        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <div className="inline-flex gap-1.5 p-1 bg-muted rounded-full whitespace-nowrap">
            {TABS.map((t) => {
              const active = activeTab === t.id && !query
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-semibold transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "min-w-[1.4rem] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center",
                      active ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground",
                    )}
                  >
                    {tabCounts[t.id]}
                  </span>
                </button>
              )
            })}
          </div>
          {query && (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
              검색 중에는 탭 필터가 무시되고 전체에서 찾습니다
            </p>
          )}
        </div>

        {/* 그룹별 카드 */}
        {grouped.map(([group, list]) => (
          <section key={group}>
            <div className="px-1 mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {GROUP_LABEL[group] || group}
              </h2>
              <span className="text-[11px] text-muted-foreground">{list.length}건</span>
            </div>
            <div className="rounded-2xl bg-card border border-border shadow-sm divide-y divide-border/60">
              {list.map((it) => (
                <LabelRow
                  key={it.key}
                  it={it}
                  edited={edited}
                  onChange={updateValue}
                  onReset={resetToFallback}
                  onImageChange={(url) =>
                    setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, image_url: url } : x)))
                  }
                />
              ))}
            </div>
          </section>
        ))}

        {grouped.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            검색 결과가 없습니다
          </div>
        )}
      </main>

      {/* 하단 저장 바 */}
      {(dirtyCount > 0 || savedAt) && (
        <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border shadow-xl z-50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              {error ? (
                <span className="text-rose-600">{error}</span>
              ) : dirtyCount > 0 ? (
                <span>
                  <span className="font-bold text-amber-600">{dirtyCount}</span> 항목 변경됨
                </span>
              ) : (
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  저장 완료
                </span>
              )}
            </div>
            <button
              onClick={saveAll}
              disabled={saving || dirtyCount === 0}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 라벨 1행 (텍스트 입력 + 이미지 업로드) ──────────────────────
function LabelRow({
  it,
  edited,
  onChange,
  onReset,
  onImageChange,
}: {
  it: SiteLabel
  edited: Record<string, string>
  onChange: (key: string, value: string) => void
  onReset: (key: string) => void
  onImageChange: (url: string | null) => void
}) {
  const cur = edited[it.key] ?? it.value
  const len = [...cur].length
  const over = it.max_length != null && len > it.max_length
  const dirty = it.key in edited
  const isIcon = isIconKey(it.key)
  const [uploading, setUploading] = useState(false)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast("이미지 파일만 업로드 가능합니다")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("key", it.key)
      fd.append("file", file)
      const res = await fetch("/api/super-admin/site-labels/image", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "업로드 실패")
        return
      }
      onImageChange(data.url)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const onRemoveImage = async () => {
    if (!confirm("이 이미지를 제거할까요? (기본 아이콘으로 돌아갑니다)")) return
    const res = await fetch("/api/super-admin/site-labels/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: it.key }),
    })
    if (!res.ok) {
      toast.error("삭제 실패")
      return
    }
    onImageChange(null)
  }

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <code className="text-[10px] font-mono text-muted-foreground break-all">{it.key}</code>
          {it.description && (
            <p className="text-[11px] text-muted-foreground mt-1">{it.description}</p>
          )}
        </div>
        <button
          onClick={() => onReset(it.key)}
          className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-destructive flex-shrink-0"
          title="기본값으로 되돌리기"
        >
          <RotateCcw className="w-3 h-3" />
          기본값
        </button>
      </div>

      <input
        value={cur}
        onChange={(e) => onChange(it.key, e.target.value)}
        placeholder={isIcon ? "이모지 (예: 🏠) — 비우면 기본 아이콘" : ""}
        className={cn(
          "w-full h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2",
          over
            ? "border-rose-500 focus:ring-rose-500/30"
            : "border-border focus:ring-primary/30",
          dirty && "border-amber-500 focus:ring-amber-500/30",
        )}
      />

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          기본값: <span className="font-mono">{it.fallback || "(없음)"}</span>
        </span>
        <span
          className={cn(
            "tabular-nums",
            over
              ? "text-rose-600 font-semibold"
              : it.max_length && len > it.max_length * 0.85
              ? "text-amber-600"
              : "text-muted-foreground",
          )}
        >
          {len}
          {it.max_length != null && ` / ${it.max_length}`}자
        </span>
      </div>

      {/* 이미지 업로드 — 아이콘 키에만 노출 */}
      {isIcon && (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-foreground">
              또는 이미지 업로드 (이미지가 우선 표시됨)
            </span>
          </div>
          {it.recommended_size && (
            <p className="text-[10px] text-muted-foreground">
              💡 권장: {it.recommended_size}
            </p>
          )}
          <div className="flex items-center gap-2">
            {it.image_url ? (
              <>
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-card border border-border flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.image_url}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
                <button
                  onClick={onRemoveImage}
                  className="inline-flex items-center gap-1 px-2 h-8 rounded-md border border-rose-500/40 text-rose-600 text-[11px] hover:bg-rose-500/5"
                >
                  <XIcon className="w-3 h-3" />
                  이미지 제거
                </button>
              </>
            ) : (
              <label
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-card text-xs font-semibold cursor-pointer hover:border-primary/40",
                  uploading && "opacity-60 pointer-events-none",
                )}
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "업로드 중..." : "이미지 업로드"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
