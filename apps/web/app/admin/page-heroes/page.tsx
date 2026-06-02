"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  ChevronLeft,
  Home as HomeIcon,
  Upload,
  Loader2,
  RotateCcw,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react"
import { PAGE_HERO_DEFS } from "@gwangjang/api-client/page-heroes"
import { toast } from "sonner"

interface HeroRow {
  page_key: string
  image_url: string | null
}

export default function AdminPageHeroesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
      router.push("/")
      return
    }
    await load()
  }

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from("page_heroes")
      .select("page_key, image_url")
    if (plaza) q = q.eq("plaza_id", plaza)
    const { data, error } = await q
    if (error && error.code === "PGRST205") {
      setTableExists(false)
    } else {
      const map: Record<string, string | null> = {}
      for (const r of (data as HeroRow[] | null) ?? []) {
        map[r.page_key] = r.image_url
      }
      setRows(map)
      setTableExists(true)
    }
    setLoading(false)
  }

  const handleUpload = async (page_key: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("이미지 파일만 업로드할 수 있습니다.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("이미지는 10MB 이하여야 합니다.")
      return
    }
    setUploadingKey(page_key)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "page-heroes")
      const up = await fetch("/api/upload", { method: "POST", body: fd })
      if (!up.ok) {
        const e = await up.json().catch(() => ({}))
        throw new Error(e.error || "업로드 실패")
      }
      const { url } = await up.json()

      const save = await fetch("/api/page-heroes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_key, image_url: url }),
      })
      if (!save.ok) {
        const e = await save.json().catch(() => ({}))
        throw new Error(e.error || "저장 실패")
      }
      setRows((prev) => ({ ...prev, [page_key]: url }))
    } catch (err: any) {
      toast.error(err?.message || "업로드 실패")
    } finally {
      setUploadingKey(null)
    }
  }

  const handleReset = async (page_key: string) => {
    if (!confirm("이 게시판 배너를 기본 이미지로 되돌릴까요?")) return
    const res = await fetch(`/api/page-heroes?key=${encodeURIComponent(page_key)}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error || "초기화 실패")
      return
    }
    setRows((prev) => ({ ...prev, [page_key]: null }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">게시판 배너 관리</h1>
              <p className="text-xs text-muted-foreground">
                각 게시판 상단 히어로에 표시되는 배경 사진을 업로드합니다
              </p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <HomeIcon className="w-4 h-4" />홈
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {/* 상단 안내 — 사이즈/형식/주의사항 */}
        <Card className="border-sky-200 bg-sky-50/70 dark:bg-sky-950/20 dark:border-sky-900/40">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex-shrink-0 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-sm">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 text-sm space-y-2">
                <div>
                  <div className="font-semibold text-foreground mb-1">업로드 전 확인해주세요</div>
                  <p className="text-muted-foreground leading-relaxed">
                    각 게시판 최상단 히어로 영역의 배경 사진입니다. 텍스트가 위에 얹히므로
                    <strong className="text-foreground"> 조금 어둡거나 대비가 낮은 사진</strong>이
                    가독성에 좋아요.
                  </p>
                </div>

                <div className="grid sm:grid-cols-3 gap-2 pt-1">
                  <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-sky-100 dark:border-sky-900/40 p-2.5">
                    <div className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-0.5">
                      권장 사이즈
                    </div>
                    <div className="text-foreground font-medium">
                      1600 × 600 px
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      (1600~1920 × 500~700, 3:1 ~ 4:1 가로형)
                    </div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-sky-100 dark:border-sky-900/40 p-2.5">
                    <div className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-0.5">
                      파일 형식
                    </div>
                    <div className="text-foreground font-medium">JPG · PNG · WebP</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      WebP 권장 (용량↓·화질↑)
                    </div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900/60 border border-sky-100 dark:border-sky-900/40 p-2.5">
                    <div className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-0.5">
                      최대 용량
                    </div>
                    <div className="text-foreground font-medium">10 MB 이하</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      2~3 MB 권장
                    </div>
                  </div>
                </div>

                <ul className="text-[12px] text-muted-foreground leading-relaxed list-disc pl-4 pt-1 space-y-0.5">
                  <li>가로로 넓은 사진을 쓰세요. 세로 사진은 위·아래가 잘립니다.</li>
                  <li>모바일에서는 중앙 부분만 보이니 <strong className="text-foreground">피사체를 가운데</strong>에 배치하세요.</li>
                  <li>업로드 직후에도 방문자 브라우저 캐시 때문에 새 이미지가 늦게 반영될 수 있어요. (새로고침 1회)</li>
                  <li>마음에 안 들면 언제든 <strong className="text-foreground">“기본으로”</strong> 버튼으로 원래 배너로 돌릴 수 있어요.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {!tableExists && (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <CardHeader>
              <CardTitle className="text-amber-700 dark:text-amber-400">
                데이터베이스 설정 필요
              </CardTitle>
              <CardDescription className="text-amber-600 dark:text-amber-300">
                `page_heroes` 테이블이 없습니다. Supabase SQL Editor 에서 마이그레이션을 실행해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
{`-- supabase/migrations/20260518000000_page_heroes.sql 참고
CREATE TABLE IF NOT EXISTS page_heroes (
  page_key   TEXT PRIMARY KEY,
  image_url  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE page_heroes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read page_heroes" ON page_heroes FOR SELECT USING (true);
CREATE POLICY "Admins can manage page_heroes" ON page_heroes FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')) )
  WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','superadmin')) );`}
              </pre>
              <Button onClick={load} variant="outline" className="mt-3">
                테이블 생성 후 새로고침
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {PAGE_HERO_DEFS.map((def) => {
            const dbUrl = rows[def.key] ?? null
            const displayUrl = dbUrl || def.defaultImage
            const isCustom = !!dbUrl
            const isUploading = uploadingKey === def.key

            return (
              <Card key={def.key} className="overflow-hidden">
                <div className="relative h-36 bg-slate-200 dark:bg-slate-800">
                  <img
                    src={displayUrl}
                    alt={def.label}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = "/banners/hero-banner.jpg"
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm">
                      {def.key}
                    </span>
                    {isCustom ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500 text-white">
                        커스텀
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/80 text-white backdrop-blur-sm">
                        기본
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2 text-white">
                    <div className="text-base font-bold drop-shadow">{def.label}</div>
                  </div>
                  <Link
                    href={def.path}
                    target="_blank"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white"
                    title="페이지 열기"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span className="truncate">
                      {isCustom ? "업로드된 이미지 사용 중" : `기본: ${def.defaultImage}`}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <label
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        isUploading
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          업로드 중...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          {isCustom ? "다른 이미지 업로드" : "이미지 업로드"}
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleUpload(def.key, f)
                          e.currentTarget.value = ""
                        }}
                      />
                    </label>

                    {isCustom && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReset(def.key)}
                        className="gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        기본으로
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

      </div>
    </div>
  )
}
