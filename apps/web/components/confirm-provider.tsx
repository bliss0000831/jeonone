"use client"

/**
 * 앱 공통 확인 다이얼로그 — native window.confirm() 대체.
 *
 * 사용법:
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: "삭제", description: "정말 삭제하시겠습니까?", destructive: true }))) return
 *   // 문자열만 넘겨도 됨: await confirm("정말 삭제하시겠습니까?")
 *
 * 파괴적 동작 전반에서 일관된 스타일/접근성(Esc·포커스 트랩·스크롤 잠금) 제공.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider>")
  }
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions>({})
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    const options = typeof o === "string" ? { description: o } : o
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setOpen(false)
    const r = resolverRef.current
    resolverRef.current = null
    r?.(result)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "확인"}</AlertDialogTitle>
            {opts.description ? (
              <AlertDialogDescription className="whitespace-pre-wrap">
                {opts.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts.cancelText ?? "취소"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                opts.destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {opts.confirmText ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
