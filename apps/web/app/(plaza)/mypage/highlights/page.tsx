"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Image as ImageIcon,
  Video,
  Pencil,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface HighlightRow {
  id: string
  user_id: string
  title: string
  cover_url: string | null
  media_url: string | null
  media_type: "image" | "video" | null
  duration_ms: number | null
  link_url: string | null
  sort_order: number
}

const MAX_HIGHLIGHTS = 20

export default function HighlightsManagePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const confirm = useConfirm()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<HighlightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const [renameTarget, setRenameTarget] = useState<HighlightRow | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login?redirect=/mypage/highlights"
        return
      }
      setUserId(user.id)
      const { data } = await supabase
        .from("profile_highlights")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
      setItems((data as HighlightRow[]) || [])
      setLoading(false)
    })()
  }, [supabase])

  const uploadFile = async (file: File): Promise<{ url: string; type: "image" | "video" }> => {
    // 클라이언트 → /api/upload → Cloudflare R2 (WebP 변환 + 리사이즈)
    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) throw new Error("이미지/동영상만 업로드 가능합니다")
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error(isVideo ? "동영상은 100MB 이하만 가능합니다" : "이미지는 10MB 이하만 가능합니다")
    }
    if (!userId) throw new Error("로그인이 필요합니다")

    const fd = new FormData()
    fd.append("file", file)
    fd.append("folder", "highlights")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || "업로드 실패")
    return { url: json.url as string, type: (json.type as "image" | "video") }
  }

  const handlePick = (kind: "image" | "video") => {
    if (!title.trim()) {
      toast("제목을 먼저 입력해주세요")
      return
    }
    if (items.length >= MAX_HIGHLIGHTS) {
      toast(`하이라이트는 최대 ${MAX_HIGHLIGHTS}개까지 등록할 수 있습니다`)
      return
    }
    if (kind === "image") imageInputRef.current?.click()
    else videoInputRef.current?.click()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !userId) return
    setBusy(true)
    try {
      const { url, type } = await uploadFile(file)
      const nextOrder = (items[items.length - 1]?.sort_order ?? -1) + 1
      const duration = type === "video" ? 15000 : 5000
      const { data, error } = await supabase
        .from("profile_highlights")
        .insert({
          user_id: userId,
          title: title.trim(),
          cover_url: type === "image" ? url : null, // 영상은 썸네일 자동 생성(클라에서 video 태그 poster)
          media_url: url,
          media_type: type,
          duration_ms: duration,
          sort_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error
      setItems((arr) => [...arr, data as HighlightRow])
      setTitle("")
    } catch (e: any) {
      toast.error(e?.message || "업로드 실패")
    } finally {
      setBusy(false)
    }
  }

  const openRename = (h: HighlightRow) => {
    setRenameTarget(h)
    setRenameValue(h.title)
  }

  const closeRename = () => {
    if (renameBusy) return
    setRenameTarget(null)
    setRenameValue("")
  }

  const submitRename = async () => {
    if (!renameTarget || renameBusy) return
    const trimmed = renameValue.trim().slice(0, 12)
    if (!trimmed) {
      toast.error("제목은 비어있을 수 없습니다")
      return
    }
    if (trimmed === renameTarget.title) {
      closeRename()
      return
    }
    setRenameBusy(true)
    try {
      const { error } = await supabase
        .from("profile_highlights")
        .update({ title: trimmed })
        .eq("id", renameTarget.id)
      if (error) {
        toast.error(error.message || "수정 실패")
        return
      }
      setItems((arr) =>
        arr.map((x) => (x.id === renameTarget.id ? { ...x, title: trimmed } : x)),
      )
      setRenameTarget(null)
      setRenameValue("")
    } finally {
      setRenameBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: "이 하이라이트를 삭제할까요?", destructive: true }))) return
    const target = items.find((x) => x.id === id)
    const { error } = await supabase.from("profile_highlights").delete().eq("id", id)
    if (error) {
      toast.error(error.message)
      return
    }
    setItems((arr) => arr.filter((x) => x.id !== id))
    // R2 고아 파일 정리 (cover_url + media_url, 둘이 같으면 중복 제거됨)
    const urls = Array.from(new Set([target?.cover_url, target?.media_url].filter((u): u is string => !!u)))
    if (urls.length > 0) {
      fetch("/api/r2-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      }).catch(() => {})
    }
  }

  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const a = items[idx]
    const b = items[j]
    const newArr = [...items]
    newArr[idx] = b
    newArr[j] = a
    // sort_order 교환
    const aOrder = a.sort_order
    const bOrder = b.sort_order
    newArr[idx] = { ...b, sort_order: aOrder }
    newArr[j] = { ...a, sort_order: bOrder }
    setItems(newArr)
    await Promise.all([
      supabase.from("profile_highlights").update({ sort_order: bOrder }).eq("id", a.id),
      supabase.from("profile_highlights").update({ sort_order: aOrder }).eq("id", b.id),
    ])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="safe-top sticky top-0 z-50 bg-card/90 backdrop-blur border-b border-border">
        <div className="flex items-center px-3 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-1 rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-base ml-1">하이라이트 관리</h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* 추가 폼 */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">새 하이라이트 추가</h2>
          <Input
            placeholder="제목 (예: 신메뉴, 후기, 작업)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={12}
          />
          <div className="flex items-center gap-2">
            {busy ? (
              <Button type="button" disabled className="flex-1">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                업로드 중...
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => handlePick("image")}
                  disabled={!title.trim() || items.length >= MAX_HIGHLIGHTS}
                  className="flex-1"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  사진
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handlePick("video")}
                  disabled={!title.trim() || items.length >= MAX_HIGHLIGHTS}
                  className="flex-1"
                >
                  <Video className="w-4 h-4 mr-2" />
                  영상
                </Button>
              </>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFile}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            이미지 10MB / 영상 100MB까지 · 영상은 최대 15초까지 재생됩니다 ·
            최대 {MAX_HIGHLIGHTS}개 ({items.length}/{MAX_HIGHLIGHTS})
          </p>
        </div>

        {/* 목록 */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              등록된 하이라이트가 없습니다
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((h, i) => (
                <li key={h.id} className="p-3 flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                      aria-label="위로"
                    >
                      <GripVertical className="w-3 h-3 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                      aria-label="아래로"
                    >
                      <GripVertical className="w-3 h-3 -rotate-90" />
                    </button>
                  </div>
                  <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex-shrink-0">
                    <div className="w-full h-full rounded-full bg-background p-0.5">
                      {h.media_type === "video" && !h.cover_url ? (
                        <video
                          src={h.media_url || undefined}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={h.cover_url || h.media_url || ""}
                          alt={h.title}
                          className="w-full h-full rounded-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{h.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      {h.media_type === "video" ? (
                        <>
                          <Video className="w-3 h-3" /> 영상
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3 h-3" /> 이미지
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRename(h)}
                    className="p-2 rounded-full text-muted-foreground hover:bg-secondary"
                    aria-label="제목 수정"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id)}
                    className="p-2 rounded-full text-destructive hover:bg-destructive/10"
                    aria-label="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {renameTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeRename}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-1">하이라이트 제목 수정</h2>
            <p className="text-xs text-muted-foreground mb-3">최대 12자까지 입력할 수 있어요</p>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value.slice(0, 12))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submitRename()
                } else if (e.key === "Escape") {
                  closeRename()
                }
              }}
              maxLength={12}
              placeholder="제목 입력"
              className="mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={closeRename}
                disabled={renameBusy}
              >
                취소
              </Button>
              <Button onClick={submitRename} disabled={renameBusy}>
                {renameBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    저장 중
                  </>
                ) : (
                  "저장"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
