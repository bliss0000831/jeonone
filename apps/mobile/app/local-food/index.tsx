import { DomainListScreen } from "@/components/DomainListScreen"

export default function LocalFoodListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "강원 로컬푸드",
        heroIcon: "nutrition",
        heroColor: "#225a39",
        heroSub: "방금 수확한 신선한 농산물",
        heroImage: require("../../assets/images/card-local-food.jpg"),
        table: "local_food",
        statusFilter: { col: "status", val: "available" },
        basePath: "/local-food",
        domainKind: "local-food",
        showPrice: true,
        showCategory: true,
        searchPlaceholder: "농산물 검색",
        registerPath: "/local-food/register",
        categories: ["채소", "과일", "쌀/잡곡", "축산물", "수산물", "가공식품", "기타"],
        // 광장 전체 통합 도메인 — 지역 분리 X
        disableRegionFilter: true,
        // 전체광장(national) 글은 모든 광장에서 노출
        crossPlazaVisibility: true,
      }}
    />
  )
}
