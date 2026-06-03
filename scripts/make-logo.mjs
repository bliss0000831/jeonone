// 농부 로고(logo-farmer.jpg)를 웹+앱 전 로고/아이콘으로 생성
import sharp from "sharp"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC = path.join(root, "apps/web/public/images/logo-farmer.jpg")
const web = (p) => path.join(root, "apps/web", p)
const mob = (p) => path.join(root, "apps/mobile", p)

async function run() {
  // 모서리 색 추출 → Android 적응형 아이콘 배경으로 사용
  const { data } = await sharp(SRC).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  const bg = { r: data[0], g: data[1], b: data[2] }
  console.log("corner bg:", bg)

  const square1024 = await sharp(SRC).resize(1024, 1024, { fit: "cover" }).png().toBuffer()

  // 1) 웹 로고 (favicon/헤더/로그인 단일 소스)
  await sharp(square1024).toFile(web("public/logo.png"))
  console.log("✓ web/public/logo.png")

  // 2) RN iOS/공통 런처 아이콘
  await sharp(square1024).toFile(mob("assets/images/icon.png"))
  console.log("✓ mobile/icon.png")

  // 3) RN 스플래시 아이콘 (중앙 로고)
  await sharp(square1024).toFile(mob("assets/images/splash-icon.png"))
  console.log("✓ mobile/splash-icon.png")

  // 4) RN 웹 favicon
  await sharp(SRC).resize(196, 196, { fit: "cover" }).png().toFile(mob("assets/images/favicon.png"))
  console.log("✓ mobile/favicon.png")

  // 5) RN Android 적응형 아이콘 — 안전영역 위해 로고를 ~68% 크기로 중앙, 모서리색 배경
  const fg = await sharp(SRC).resize(700, 700, { fit: "cover" }).png().toBuffer()
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([{ input: fg, gravity: "center" }])
    .png()
    .toFile(mob("assets/images/adaptive-icon.png"))
  console.log("✓ mobile/adaptive-icon.png (배경", `rgb(${bg.r},${bg.g},${bg.b})`, ")")
}
run().catch((e) => { console.error(e); process.exit(1) })
