import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifySuperAdminToken, SUPER_ADMIN_COOKIE } from "@/lib/services/super-admin"
import { uploadImageToR2, deleteFromR2, urlToR2Key } from "@/lib/integrations/r2"
import { validateUploadedFile, verifyFileContent } from "@gwangjang/api-client/file-validation"

export const dynamic = "force-dynamic"

async function ensureSuperAdmin() {
  const c = await cookies()
  const token = c.get(SUPER_ADMIN_COOKIE)?.value
  return verifySuperAdminToken(token)
}

/**
 * POST — 라벨 이미지 업로드.
 *   multipart/form-data: { key: string, file: File }
 */
export async function POST(request: NextRequest) {
  if (!(await ensureSuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const form = await request.formData()
  const key = String(form.get("key") || "")
  const file = form.get("file") as File | null
  if (!key || !file) {
    return NextResponse.json({ error: "key 와 file 이 필요합니다" }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "파일이 너무 큽니다 (최대 5MB)" }, { status: 400 })
  }

  // MIME 화이트리스트 + 매직바이트 (이미지 only — 비디오 거부)
  const validation = validateUploadedFile(file)
  if ('error' in validation) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }
  if (validation.kind !== 'image') {
    return NextResponse.json({ error: "이미지만 업로드 가능합니다" }, { status: 400 })
  }

  const admin = createAdminClient()
  // 기존 이미지 URL 가져와서 R2 에서 삭제
  const { data: prev } = await admin
    .from("site_labels")
    .select("image_url")
    .eq("key", key)
    .single()
  if (prev?.image_url) {
    const oldKey = urlToR2Key(prev.image_url)
    if (oldKey) {
      try { await deleteFromR2(oldKey) } catch {}
    }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (!verifyFileContent(buf, 'image')) {
    return NextResponse.json(
      { error: "파일 형식이 올바르지 않습니다 (확장자 위조 의심)" },
      { status: 400 },
    )
  }
  const { url } = await uploadImageToR2({
    folder: "site-labels",
    userId: "super-admin",
    file: buf,
    originalName: file.name,
    maxWidth: 256, // 라벨 아이콘은 작아도 충분
    quality: 88,
  })

  const { error } = await admin
    .from("site_labels")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("key", key)
  if (error) {
    console.error("[site-labels image POST]", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  console.log(
    "[site-labels:audit]",
    JSON.stringify({ ts: new Date().toISOString(), actor: "super-admin", action: "upload-image", key }),
  )
  return NextResponse.json({ success: true, url })
}

/**
 * DELETE { key } — 이미지 제거 (텍스트 라벨은 유지).
 */
export async function DELETE(request: NextRequest) {
  if (!(await ensureSuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const key = body?.key
  if (!key) return NextResponse.json({ error: "key 가 필요합니다" }, { status: 400 })

  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("site_labels")
    .select("image_url")
    .eq("key", key)
    .single()
  if (prev?.image_url) {
    const oldKey = urlToR2Key(prev.image_url)
    if (oldKey) {
      try { await deleteFromR2(oldKey) } catch {}
    }
  }
  await admin
    .from("site_labels")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("key", key)
  console.log(
    "[site-labels:audit]",
    JSON.stringify({ ts: new Date().toISOString(), actor: "super-admin", action: "delete-image", key }),
  )
  return NextResponse.json({ success: true })
}
