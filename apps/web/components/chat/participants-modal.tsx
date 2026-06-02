"use client"

import { useEffect } from "react"
import { X, Crown } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export interface ModalParticipant {
  id: string
  nickname: string | null
  avatar_url: string | null
  badge?: "owner" | null
  profileHref?: string
}

interface Props {
  open: boolean
  onClose: () => void
  participants: ModalParticipant[]
  title?: string
  total?: number
  max?: number | null
}

export function ParticipantsModal({
  open,
  onClose,
  participants,
  title = "참여자",
  total,
  max,
}: Props) {
  // ESC 로 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null
  const count = total ?? participants.length

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full md:w-[420px] max-h-[75vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-semibold">
            {title}{" "}
            <span className="text-muted-foreground font-normal text-sm">
              {count}
              {max ? `/${max}` : ""}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-full"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {participants.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              참여자가 없습니다
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {participants.map((p) => {
                const body = (
                  <div className="flex items-center gap-3 px-4 py-3">
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                        {(p.nickname || "?")[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">
                        {p.nickname || "사용자"}
                      </span>
                      {p.badge === "owner" && (
                        <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                          <Crown className="w-3 h-3" />
                          주최
                        </span>
                      )}
                    </div>
                  </div>
                )
                return (
                  <li key={p.id}>
                    {p.profileHref ? (
                      <Link
                        href={p.profileHref}
                        className={cn(
                          "block hover:bg-secondary/60 transition-colors",
                        )}
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
