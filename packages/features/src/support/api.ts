/**
 * 지원 도메인 API — FAQ / 공지 / 고객센터 등 정적-ish 콘텐츠.
 * 웹과 RN 양쪽이 같은 함수 호출.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface Faq {
  id: string
  category: string
  question: string
  answer: string
  sort_order: number
}

/**
 * 어르신 친화 기본 FAQ — DB에 등록된 FAQ가 없을 때 보여줄 내장 질문/답변.
 * (관리자가 DB faqs 에 직접 등록하면 그쪽이 우선.)
 * 전원일기(농기구·로컬푸드·일손·대여·경매·소식통) 맥락 + 쉬운 말로 작성.
 */
export const FALLBACK_FAQS: Faq[] = [
  // ── 처음 오셨나요? ──
  { id: "f-start-1", category: "처음 오셨나요?", sort_order: 1,
    question: "전원일기는 무엇을 하는 곳인가요?",
    answer: "우리 지역 농업인들이 농기구·자재와 농산물을 사고팔고, 일손을 구하고, 마을 소식을 나누는 동네 장터입니다. 가까운 이웃과 직접 거래해요." },
  { id: "f-start-2", category: "처음 오셨나요?", sort_order: 2,
    question: "돈이 드나요?",
    answer: "가입과 이용은 무료입니다. 물건 값은 파는 분과 사는 분이 직접 정해서 거래해요. 전원일기는 자리만 빌려드립니다." },
  { id: "f-start-3", category: "처음 오셨나요?", sort_order: 3,
    question: "글씨가 작아서 잘 안 보여요.",
    answer: "휴대폰 [설정] → [화면] 또는 [디스플레이]에서 '글자 크기'를 키우면 전원일기 글씨도 함께 커집니다. 화면을 두 손가락으로 벌려도 커져요." },
  { id: "f-start-4", category: "처음 오셨나요?", sort_order: 4,
    question: "회원가입은 꼭 해야 하나요?",
    answer: "구경은 가입 없이도 됩니다. 다만 글 올리기·채팅·좋아요 같은 활동은 로그인이 필요해요. 카카오로 간편하게 가입할 수 있습니다." },

  // ── 물건 올리기 ──
  { id: "f-post-1", category: "물건 올리기", sort_order: 1,
    question: "농기구를 어떻게 팔아요?",
    answer: "아래 가운데 [＋ 올리기] 버튼을 누르고 → 사진을 찍고 → 제목·가격·설명을 적은 뒤 → [등록하기]를 누르면 됩니다. 사진은 잘 보이게 1장 이상 꼭 넣어주세요." },
  { id: "f-post-2", category: "물건 올리기", sort_order: 2,
    question: "사진은 어떻게 올리나요?",
    answer: "글 쓰는 화면에서 카메라 칸을 누르면 바로 사진을 찍거나, 휴대폰에 저장된 사진을 고를 수 있어요. 여러 장(최대 10장) 올려도 됩니다." },
  { id: "f-post-3", category: "물건 올리기", sort_order: 3,
    question: "가격을 얼마로 할지 모르겠어요.",
    answer: "가격에 0원을 넣고 '가격 제안 받기'를 켜면, 사는 분이 먼저 가격을 제안해 줍니다. 그냥 나눠 주실 거면 '무료 나눔'으로 올리면 돼요." },
  { id: "f-post-4", category: "물건 올리기", sort_order: 4,
    question: "잘못 올렸어요. 고치거나 지울 수 있나요?",
    answer: "내가 올린 글을 열면 위쪽 [⋮](점 세 개) 또는 [수정] 버튼이 있어요. 거기서 내용을 고치거나 글을 삭제할 수 있습니다." },
  { id: "f-post-5", category: "물건 올리기", sort_order: 5,
    question: "농산물도 팔 수 있나요?",
    answer: "네. [로컬푸드] 메뉴에서 직접 기른 농산물을 올려 이웃에게 직거래로 팔 수 있어요." },

  // ── 사고팔기·채팅 ──
  { id: "f-deal-1", category: "사고팔기·채팅", sort_order: 1,
    question: "마음에 드는 물건은 어떻게 사나요?",
    answer: "그 물건 글을 열고 [채팅하기]를 누르면 파는 분과 바로 대화할 수 있어요. 만날 시간과 장소를 정해서 직접 거래하세요." },
  { id: "f-deal-2", category: "사고팔기·채팅", sort_order: 2,
    question: "채팅 말고 전화로 연락하고 싶어요.",
    answer: "파는 분이 전화번호를 공개했다면 글에 [전화 걸기] 버튼이 보입니다. 없으면 채팅으로 연락하면 돼요." },
  { id: "f-deal-3", category: "사고팔기·채팅", sort_order: 3,
    question: "대여(빌리기)는 어떻게 하나요?",
    answer: "[대여] 메뉴에서 필요한 농기구를 고르고 신청하면, 주인이 승인합니다. 빌리는 기간과 금액·보증금을 미리 꼭 확인하세요." },
  { id: "f-deal-4", category: "사고팔기·채팅", sort_order: 4,
    question: "경매는 어떻게 참여하나요?",
    answer: "[경매장]에서 물건을 열고 입찰가(살 금액)를 적어 [입찰]을 누르면 됩니다. 마감 때 가장 높은 금액을 적은 분이 가져가요." },
  { id: "f-deal-5", category: "사고팔기·채팅", sort_order: 5,
    question: "일손을 구하거나, 일하러 가고 싶어요.",
    answer: "[일손] 메뉴에서 일손 구함·구직 글을 올리거나 찾을 수 있어요. 글을 열고 채팅으로 조건을 맞춰 보세요." },

  // ── 안전 거래 ──
  { id: "f-safe-1", category: "안전 거래", sort_order: 1,
    question: "사기를 당할까 봐 걱정돼요.",
    answer: "물건을 보기 전에 돈부터 보내지 마세요. 되도록 직접 만나 물건을 확인하고 거래하고, 낮 시간·사람 많은 곳에서 만나세요. 이상하면 [신고]해 주세요." },
  { id: "f-safe-2", category: "안전 거래", sort_order: 2,
    question: "모르는 사람이 계좌로 돈부터 보내라고 해요.",
    answer: "사기일 가능성이 높습니다. 만나서 물건을 확인하기 전에는 절대 송금하지 마세요. 즉시 [신고] 부탁드립니다." },
  { id: "f-safe-3", category: "안전 거래", sort_order: 3,
    question: "전원일기가 거래를 책임지나요?",
    answer: "전원일기는 이웃끼리 거래를 이어주는 장터이며, 거래 당사자가 아닙니다. 물건과 대금에 대한 책임은 파는 분·사는 분에게 있어요. 그래서 직접 확인이 가장 중요합니다." },

  // ── 계정·지역 ──
  { id: "f-acct-1", category: "계정·지역", sort_order: 1,
    question: "내 지역(동네)은 어떻게 바꾸나요?",
    answer: "맨 위에 있는 지역 이름(예: 홍천군)을 누르면 시·군을 바꿀 수 있어요. 첫 화면에서 '자동으로 내 지역 찾기'를 눌러도 됩니다." },
  { id: "f-acct-2", category: "계정·지역", sort_order: 2,
    question: "비밀번호를 잊어버렸어요.",
    answer: "로그인 화면의 [비밀번호 찾기]를 누르면, 가입한 방법(이메일/카카오)으로 다시 설정할 수 있어요." },
  { id: "f-acct-3", category: "계정·지역", sort_order: 3,
    question: "더 궁금한 게 있으면 어디에 물어봐요?",
    answer: "메뉴(☰)의 [고객센터]로 문의하거나, [소식통]의 '마을 사랑방'에 글을 남기면 이웃과 관리자가 도와드려요." },
]

export async function listFaqs(
  supabase: SupabaseClient,
  plazaId?: string,
): Promise<Faq[]> {
  let q = supabase
    .from("faqs")
    .select("id, category, question, answer, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) return FALLBACK_FAQS
  const rows = (data ?? []) as Faq[]
  // DB에 등록된 FAQ가 없으면 어르신 친화 기본 FAQ 표시
  return rows.length > 0 ? rows : FALLBACK_FAQS
}

export interface NoticePost {
  id: string
  title: string
  content: string
  category: string | null
  created_at: string
  is_pinned: boolean
}

export async function listNotices(
  supabase: SupabaseClient,
  plazaId?: string,
): Promise<NoticePost[]> {
  // notices 테이블에서 직접 조회 (admin /admin/board/notice 에서 작성하는 데이터)
  let q = supabase
    .from("notices")
    .select("id, title, content, created_at, is_pinned")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) return []
  return ((data ?? []) as any[]).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: null,
    created_at: n.created_at,
    is_pinned: !!n.is_pinned,
  }))
}
