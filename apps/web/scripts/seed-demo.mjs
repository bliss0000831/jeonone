// 전원일기 데모 데이터 시드 — 데모 판매자 + 농기구(판매/경매/대여) + 로컬푸드
// 실행: cd apps/web && node scripts/seed-demo.mjs
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"

// .env.local 로드
const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const PLAZA = "gangwon"
const DEMO_EMAIL = "gangwon-farmer@jeonwon.demo"

const now = Date.now()
const days = (n) => new Date(now + n * 86400000).toISOString()

async function getOrCreateUser() {
  // 기존 데모 유저 찾기
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  const found = list?.users?.find((u) => u.email === DEMO_EMAIL)
  if (found) { console.log("기존 데모 유저 재사용:", found.id); return found.id }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL, password: "Demo!" + Math.floor(now / 1000), email_confirm: true,
    user_metadata: { nickname: "강원농부" },
  })
  if (error) throw error
  console.log("데모 유저 생성:", data.user.id)
  return data.user.id
}

async function run() {
  const uid = await getOrCreateUser()

  // 프로필
  await sb.from("profiles").upsert({ id: uid, nickname: "강원농부", full_name: "강원농부" }, { onConflict: "id" })

  // 이미 시드됐으면 중단
  const { count } = await sb.from("secondhand_posts").select("id", { count: "exact", head: true }).eq("user_id", uid)
  if (count && count > 0) { console.log(`이미 ${count}건 존재 → 시드 건너뜀`); return }

  const base = { user_id: uid, plaza_id: PLAZA, images: [], location: "홍천군", is_price_negotiable: false, status: "active" }

  // ── 농기구 글 ──
  const posts = [
    { ...base, title: "대동 트랙터 50마력 (2019년식)", description: "논밭 겸용, 상태 좋습니다. 직거래 환영합니다.", category: "트랙터", price: 15000000, listing_type: "sale", brand: "대동", model_name: "DK500", model_year: 2019, usage_hours: 1200, horsepower: 50 },
    { ...base, title: "관리기 7마력 거의 새것", description: "작년에 구매해서 몇 번 안 썼습니다.", category: "관리기", price: 850000, listing_type: "sale", brand: "아세아", model_year: 2023, horsepower: 7 },
    { ...base, title: "[경매] 국제 콤바인 4조", description: "수확기 마무리로 처분합니다. 경매로 진행합니다.", category: "수확기", price: 0, listing_type: "auction", brand: "국제", model_year: 2016 },
    { ...base, title: "[경매] 중고 경운기", description: "오래됐지만 잘 돌아갑니다. 즉시구매 가능.", category: "경운기", price: 0, listing_type: "auction", brand: "대동", model_year: 2010 },
    { ...base, title: "[대여] 이앙기 6조 일대여", description: "모내기철 단기 대여합니다. 보증금 있습니다.", category: "이앙기", price: 0, listing_type: "rental", brand: "구보다" },
    { ...base, title: "[대여] 스피드 스프레이어(방제기)", description: "과수원 방제용. 일/주 단위 대여 가능.", category: "방제기", price: 0, listing_type: "rental", brand: "한성" },
  ]
  const { data: inserted, error: pErr } = await sb.from("secondhand_posts").insert(posts).select("id, title, listing_type")
  if (pErr) throw pErr
  console.log(`농기구 ${inserted.length}건 생성`)

  const byType = (t) => inserted.filter((p) => p.listing_type === t)

  // ── 경매 등록 ──
  const auctions = byType("auction")
  await sb.from("auction_listings").insert([
    { post_id: auctions[0].id, seller_id: uid, plaza_id: PLAZA, start_price: 3000000, current_price: 3000000, bid_increment: 100000, buy_now_price: 8000000, end_at: days(3), status: "active" },
    { post_id: auctions[1].id, seller_id: uid, plaza_id: PLAZA, start_price: 200000, current_price: 200000, bid_increment: 20000, buy_now_price: 600000, end_at: days(2), status: "active" },
  ])
  console.log("경매 2건 등록")

  // ── 대여 등록 ──
  const rentals = byType("rental")
  await sb.from("rental_listings").insert([
    { post_id: rentals[0].id, owner_id: uid, plaza_id: PLAZA, daily_price: 80000, deposit: 200000 },
    { post_id: rentals[1].id, owner_id: uid, plaza_id: PLAZA, daily_price: 50000, deposit: 100000 },
  ])
  console.log("대여 2건 등록")

  // ── 로컬푸드 ──
  await sb.from("local_food").insert([
    { user_id: uid, plaza_id: PLAZA, title: "홍천 햇사과 5kg", description: "당도 높은 부사. 산지 직송.", price: 25000, unit: "5kg", category: "과일", images: [], location: "홍천군", status: "active" },
    { user_id: uid, plaza_id: PLAZA, title: "강원 감자 10kg", description: "포슬포슬한 수미감자.", price: 18000, unit: "10kg", category: "채소", images: [], location: "홍천군", status: "active" },
    { user_id: uid, plaza_id: PLAZA, title: "유기농 대추방울토마토 2kg", description: "무농약 재배.", price: 22000, unit: "2kg", category: "채소", images: [], location: "홍천군", status: "active" },
  ])
  console.log("로컬푸드 3건 등록")

  console.log("\n✓ 시드 완료! 데모 판매자: 강원농부 (" + DEMO_EMAIL + ")")
}
run().catch((e) => { console.error("✗ 실패:", e.message || e); process.exit(1) })
