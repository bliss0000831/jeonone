import { DomainListScreen } from "@/components/DomainListScreen"

export default function GroupBuyingListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "공동구매",
        heroIcon: "people-outline",
        heroColor: "#f59e0b",
        heroSub: "이웃과 함께 공동구매로 더 저렴하게",
        table: "group_buying_posts",
        statusFilter: { col: "status", val: "recruiting" },
        basePath: "/group-buying",
        domainKind: "group-buying",
        showPrice: true,
        priceCol: "group_price",
        showCategory: true,
        searchPlaceholder: "공구 상품 검색",
        registerPath: "/group-buying/register",
        categories: ["식품/식자재", "과일/채소", "정육/수산", "생활용품", "가전/디지털", "뷰티/화장품", "건강/영양제", "의류/잡화", "유아/아동", "반려동물", "기타"],
        // 광장 전체 통합 도메인 — 지역 분리 X
        disableRegionFilter: true,
        // 전체광장(national) 글은 모든 광장에서 노출
        crossPlazaVisibility: true,
      }}
    />
  )
}
