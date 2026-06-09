import { redirect } from "next/navigation"

/**
 * 소식통(게시판) 진입 — 초록 카테고리 화면(/board/c/[slug])으로 통일.
 *
 * 기존 '밝은 허브'(_client.tsx: 핫글/수다왕/지역칩) 디자인은 제거하고,
 * 앱과 동일하게 카테고리 탭바 화면 하나로 일원화. 기본은 '마을 사랑방'(free).
 */
export default function BoardPage() {
  redirect("/board/c/free")
}
