"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { useTheme } from "next-themes"
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Bell,
  Lock,
  LogOut,
  Trash2,
  FileText,
  Shield,
  HelpCircle,
  Megaphone,
  Mail,
  User,
  Eye,
  MessageCircle,
  Search,
  AlertTriangle,
  Ban,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"

// ─── 타입 ──────────────────────────────────────────────────────
type ToggleItem = {
  type: "toggle"
  icon: any
  label: string
  helper?: string
  iconColor: string // tailwind text color
  iconBg: string // tailwind bg color (배경 원)
  value: boolean
  onChange: () => void
}
type LinkItem = {
  type: "link"
  icon: any
  label: string
  helper?: string
  iconColor: string
  iconBg: string
  href: string
}
type Item = ToggleItem | LinkItem
type Section = {
  title: string
  /** 활성 토글 개수 등 옆에 보여줄 한 줄 메타 */
  meta?: string
  items: Item[]
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const { name: plazaName } = useSiteBranding()
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<{
    nickname: string | null
    avatar_url: string | null
    account_type: string | null
    role: string | null
  } | null>(null)
  const [notifications, setNotifications] = useState({
    chat: true,
    property: true,
    marketing: false,
  })
  const [postsPublic, setPostsPublic] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    setMounted(true)
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login"
        return
      }
      setUser(user)
      const { data: row } = await supabase
        .from("profiles")
        .select(
          "nickname, avatar_url, account_type, role, posts_public, notif_chat, notif_property, notif_marketing",
        )
        .eq("id", user.id)
        .single()
      if (row) {
        if (typeof row.posts_public === "boolean") setPostsPublic(row.posts_public)
        setNotifications({
          chat: row.notif_chat ?? true,
          property: row.notif_property ?? true,
          marketing: row.notif_marketing ?? false,
        })
        setProfile({
          nickname: row.nickname,
          avatar_url: row.avatar_url,
          account_type: row.account_type,
          role: row.role,
        })
      }
    }
    checkUser()
  }, [])

  const persistNotif = async (key: "chat" | "property" | "marketing", next: boolean) => {
    if (!user) return
    const prev = notifications
    setNotifications((s) => ({ ...s, [key]: next }))
    const column = key === "chat" ? "notif_chat" : key === "property" ? "notif_property" : "notif_marketing"
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: next })
      .eq("id", user.id)
    if (error) {
      setNotifications(prev)
      toast.error("알림 설정 저장에 실패했습니다")
      return
    }
    if (key === "chat") {
      try {
        localStorage.setItem("chat_notifications_off_all", next ? "0" : "1")
        window.dispatchEvent(
          new CustomEvent("chat-prefs-change", {
            detail: { key: "chat_notifications_off_all" },
          }),
        )
      } catch {}
    }
  }

  const handleTogglePostsPublic = async () => {
    if (!user) return
    const next = !postsPublic
    setPostsPublic(next)
    const { error } = await supabase
      .from("profiles")
      .update({ posts_public: next })
      .eq("id", user.id)
    if (error) {
      setPostsPublic(!next)
      toast.error("공개 설정 저장에 실패했습니다")
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  const handleDeleteAccount = async () => {
    if (deleting) return // 중복 클릭 방지 — 진행 중 재요청 차단
    if (
      !(await confirm({
        title: "회원 탈퇴",
        description: "정말로 회원 탈퇴하시겠습니까?\n\n탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.",
        confirmText: "탈퇴 진행",
        destructive: true,
      }))
    ) {
      return
    }
    if (
      !(await confirm({
        title: "마지막 확인",
        description: "마지막 확인입니다. 정말로 탈퇴하시겠습니까?",
        confirmText: "탈퇴",
        destructive: true,
      }))
    ) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch("/api/account/delete", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || "탈퇴 처리 중 오류가 발생했습니다.")
        return
      }
      await supabase.auth.signOut()
      toast.success("회원 탈퇴가 완료되었습니다.")
      window.location.href = "/"
    } catch {
      toast.error("탈퇴 처리 중 오류가 발생했습니다.")
    } finally {
      setDeleting(false)
    }
  }

  const sections = useMemo<Section[]>(() => {
    const notifActive = [
      notifications.chat,
      notifications.property,
      notifications.marketing,
    ].filter(Boolean).length

    return [
      {
        title: "계정",
        items: [
          {
            type: "link",
            icon: User,
            iconColor: "text-blue-600",
            iconBg: "bg-blue-500/10",
            label: "프로필 정보 편집",
            helper: "닉네임, 프로필 사진, 자기소개",
            href: "/mypage/edit",
          },
          {
            type: "link",
            icon: Lock,
            iconColor: "text-rose-600",
            iconBg: "bg-rose-500/10",
            label: "비밀번호 변경",
            helper: "보안을 위해 정기적으로 변경하세요",
            href: "/auth/change-password",
          },
        ],
      },
      {
        title: "공개 설정",
        items: [
          {
            type: "toggle",
            icon: Eye,
            iconColor: "text-indigo-600",
            iconBg: "bg-indigo-500/10",
            label: "내 게시물 공개",
            helper: "다른 사용자가 내 프로필에서 게시글을 볼 수 있어요",
            value: postsPublic,
            onChange: handleTogglePostsPublic,
          },
          {
            type: "link",
            icon: Ban,
            iconColor: "text-red-600",
            iconBg: "bg-red-500/10",
            label: "차단 사용자 관리",
            helper: "차단한 사용자의 글·채팅을 가립니다",
            href: "/mypage/blocked",
          },
        ],
      },
      {
        title: "알림 설정",
        meta: `${notifActive}개 활성`,
        items: [
          {
            type: "toggle",
            icon: MessageCircle,
            iconColor: "text-blue-600",
            iconBg: "bg-blue-500/10",
            label: "채팅 알림",
            helper: "새 메시지가 오면 알려드려요",
            value: notifications.chat,
            onChange: () => persistNotif("chat", !notifications.chat),
          },
          {
            type: "toggle",
            icon: Bell,
            iconColor: "text-rose-600",
            iconBg: "bg-rose-500/10",
            label: "관심 글 알림",
            helper: "찜한 글의 가격 변경·상태 변화를 알려드려요",
            value: notifications.property,
            onChange: () => persistNotif("property", !notifications.property),
          },
          {
            type: "toggle",
            icon: Megaphone,
            iconColor: "text-violet-600",
            iconBg: "bg-violet-500/10",
            label: "마케팅 정보 수신",
            helper: "이벤트·프로모션 소식 수신에 동의합니다",
            value: notifications.marketing,
            onChange: () => persistNotif("marketing", !notifications.marketing),
          },
        ],
      },
      {
        title: "고객지원",
        items: [
          {
            type: "link",
            icon: Megaphone,
            iconColor: "text-amber-600",
            iconBg: "bg-amber-500/10",
            label: "공지사항",
            href: "/notice",
          },
          {
            type: "link",
            icon: HelpCircle,
            iconColor: "text-cyan-600",
            iconBg: "bg-cyan-500/10",
            label: "자주 묻는 질문",
            href: "/faq",
          },
          {
            type: "link",
            icon: Mail,
            iconColor: "text-emerald-600",
            iconBg: "bg-emerald-500/10",
            label: "고객센터",
            href: "/support",
          },
        ],
      },
      {
        title: "약관 및 정책",
        items: [
          {
            type: "link",
            icon: FileText,
            iconColor: "text-slate-600",
            iconBg: "bg-slate-500/10",
            label: "이용약관",
            href: "/terms",
          },
          {
            type: "link",
            icon: Shield,
            iconColor: "text-slate-600",
            iconBg: "bg-slate-500/10",
            label: "개인정보처리방침",
            href: "/privacy",
          },
        ],
      },
    ]
  }, [postsPublic, notifications, theme])

  // ─── 검색 필터 ─────────────────────────────────────────────────
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            (i.helper?.toLowerCase().includes(q) ?? false) ||
            sec.title.toLowerCase().includes(q),
        ),
      }))
      .filter((sec) => sec.items.length > 0)
  }, [sections, query])

  if (!mounted) return null

  const accountTypeLabel: Record<string, string> = {
    user: "일반",
    agent: "공인중개사",
    interior: "인테리어",
    moving: "이사 업체",
    cleaning: "청소 업체",
    repair: "수리 업체",
    producer: "로컬푸드 생산자",
    business: "사업자",
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 hover:bg-secondary rounded-full"
            aria-label="뒤로가기"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">설정</h1>
          <div className="w-9" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-24 space-y-4 pt-4">
        {/* Profile card */}
        <Link
          href="/mypage"
          className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/15 hover:from-primary/15 hover:to-primary/10 transition-colors"
        >
          <div className="w-14 h-14 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0 ring-2 ring-card">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.nickname || ""}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-7 h-7 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate">
                {profile?.nickname || "닉네임 없음"}
              </span>
              {profile?.account_type && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {accountTypeLabel[profile.account_type] || profile.account_type}
                </span>
              )}
              {(profile?.role === "admin" || profile?.role === "superadmin") && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  관리자
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {user?.email || ""}
            </p>
            <p className="text-xs text-primary mt-1 font-medium">프로필 보기 →</p>
          </div>
        </Link>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="설정 검색"
            className="w-full h-11 pl-9 pr-3 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* 화면 모드 — 큰 카드 두 개 */}
        {!query && (
          <section>
            <h2 className="px-1 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              화면
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <ThemeCard
                active={theme !== "dark"}
                onClick={() => setTheme("light")}
                icon={Sun}
                title="라이트"
                accent="from-amber-200 to-amber-50"
                iconColor="text-amber-500"
              />
              <ThemeCard
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                icon={Moon}
                title="다크"
                accent="from-indigo-900 to-indigo-700"
                iconColor="text-indigo-200"
                dark
              />
            </div>
          </section>
        )}

        {/* 일반 섹션들 */}
        {filteredSections.map((section) => (
          <section key={section.title}>
            <div className="px-1 mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </h2>
              {section.meta && (
                <span className="text-[11px] text-primary font-semibold">{section.meta}</span>
              )}
            </div>
            <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
              {section.items.map((item, idx) => (
                <Row key={idx} item={item} divider={idx < section.items.length - 1} />
              ))}
            </div>
          </section>
        ))}

        {filteredSections.length === 0 && query && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            "{query}" 에 맞는 설정이 없어요
          </div>
        )}

        {/* 로그아웃 */}
        <Button
          variant="outline"
          className="w-full justify-center gap-2 h-12 rounded-xl"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>

        {/* Danger zone */}
        <section>
          <div className="px-1 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            <h2 className="text-xs font-bold text-destructive uppercase tracking-wider">
              위험 구역
            </h2>
          </div>
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-foreground mb-1">회원 탈퇴</p>
            <p className="text-xs text-muted-foreground mb-3">
              계정을 삭제하면 모든 게시물·채팅·포인트가 사라지며 복구할 수 없습니다.
            </p>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "탈퇴 처리 중…" : "회원 탈퇴"}
            </button>
          </div>
        </section>

        {/* App Version */}
        <div className="pt-4 text-center text-xs text-muted-foreground">
          <p>{plazaName} v1.0.0</p>
          <p className="mt-1">이웃과 함께하는 농촌 생활</p>
        </div>
      </div>
    </div>
  )
}

// ─── 행 컴포넌트 ───────────────────────────────────────────────
function Row({ item, divider }: { item: Item; divider: boolean }) {
  const Icon = item.icon
  const inner = (
    <>
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          item.iconBg,
        )}
      >
        <Icon className={cn("w-5 h-5", item.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
        {item.helper && (
          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{item.helper}</p>
        )}
      </div>
    </>
  )

  if (item.type === "toggle") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          divider && "border-b border-border/60",
        )}
      >
        {inner}
        <Switch checked={item.value} onCheckedChange={item.onChange} />
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors",
        divider && "border-b border-border/60",
      )}
    >
      {inner}
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}

// ─── 테마 카드 ─────────────────────────────────────────────────
function ThemeCard({
  active,
  onClick,
  icon: Icon,
  title,
  accent,
  iconColor,
  dark,
}: {
  active: boolean
  onClick: () => void
  icon: any
  title: string
  accent: string
  iconColor: string
  dark?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-2xl p-4 border-2 transition-all overflow-hidden text-left",
        active
          ? "border-primary shadow-md"
          : "border-border hover:border-primary/40",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-50",
          accent,
        )}
        aria-hidden
      />
      <div className="relative">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center mb-3",
            dark ? "bg-indigo-900/60" : "bg-white",
          )}
        >
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <p className={cn("font-semibold text-sm", dark && "text-white")}>{title}</p>
        <p className={cn("text-[11px] mt-0.5", dark ? "text-indigo-100/80" : "text-muted-foreground")}>
          {active ? "사용 중" : "선택"}
        </p>
      </div>
    </button>
  )
}
