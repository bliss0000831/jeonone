"use client"

/**
 * 360° 가상 투어 사진 업로더 — 매물 등록/수정 폼에서 사용.
 *
 * 입력 형식:
 *   - Equirectangular (정사영) 360° 사진 권장 (2:1 비율, 6000x3000 이상)
 *   - 일반 사진 업로드해도 동작은 하지만 360° 효과 X
 *
 * 사용자에게 안내:
 *   - 360 카메라 (Insta360, Ricoh Theta) 또는
 *   - 스마트폰 + Google Street View 앱 으로 촬영
 */
import { useRef, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Camera, X, Loader2, Info, ImagePlus, ChevronUp, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import type { PanoramaImage } from "@/components/property-panorama-viewer"

const MAX_PANORAMAS = 10

interface Props {
  value: PanoramaImage[]
  onChange: (next: PanoramaImage[]) => void
  disabled?: boolean
}

export function PropertyPanoramaUploader({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (value.length + files.length > MAX_PANORAMAS) {
      toast.error(`360° 사진은 최대 ${MAX_PANORAMAS}장까지 등록 가능합니다.`)
      return
    }

    setUploading(true)
    const newItems: PanoramaImage[] = []

    for (const file of Array.from(files)) {
      try {
        // 비율 가이드: 2:1 권장 (경고만, 차단 X)
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "업로드 실패")
        newItems.push({
          url: data.url,
          title: defaultRoomTitle(value.length + newItems.length),
        })
      } catch (e: any) {
        console.error("[panorama upload]", e)
        toast.error(e?.message ?? "업로드 실패")
      }
    }

    if (newItems.length > 0) {
      onChange([...value, ...newItems])
      toast.success(`${newItems.length}장 추가되었습니다.`)
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  function updateTitle(idx: number, title: string) {
    onChange(value.map((v, i) => (i === idx ? { ...v, title } : v)))
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...value]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {/* 안내 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-900 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="text-sky-900 dark:text-sky-200 space-y-1">
            <p className="font-bold">360° 가상 투어 — 집 내부를 입체적으로 보여주세요</p>
            <p className="leading-relaxed">
              <strong>2:1 비율 정사영(equirectangular) 사진</strong> 을 업로드하시면 매수/임차 희망자가
              마우스 드래그로 360° 둘러볼 수 있어요. 360° 카메라(Insta360, Ricoh Theta) 또는
              스마트폰의 <strong>Google Street View 앱</strong>으로 무료 촬영 가능합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 업로드 버튼 */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading || value.length >= MAX_PANORAMAS}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
          360° 사진 추가
        </Button>
        <span className="text-xs text-muted-foreground">
          {value.length} / {MAX_PANORAMAS}장
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
      </div>

      {/* 업로드된 목록 */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((img, idx) => (
            <div
              key={`${img.url}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
            >
              <div className="relative w-20 h-14 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                <Image src={img.url} alt={img.title ?? ""} width={80} height={56} className="w-full h-full object-cover" unoptimized />
                <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                  360°
                </div>
              </div>
              <Input
                value={img.title ?? ""}
                onChange={(e) => updateTitle(idx, e.target.value)}
                placeholder={`방 ${idx + 1} 이름 (예: 거실, 안방, 부엌)`}
                disabled={disabled}
                className="flex-1 h-9 text-sm"
              />
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={disabled || idx === 0}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title="위로"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={disabled || idx === value.length - 1}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title="아래로"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={disabled}
                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 rounded"
                title="삭제"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 text-center">
          <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">아직 360° 사진이 없습니다</p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            가상 투어를 추가하면 매물 노출 효과가 크게 올라갑니다
          </p>
        </div>
      )}
    </div>
  )
}

function defaultRoomTitle(idx: number): string {
  const presets = ["거실", "안방", "작은방", "부엌", "욕실", "베란다", "현관", "다용도실"]
  return presets[idx] ?? `방 ${idx + 1}`
}
