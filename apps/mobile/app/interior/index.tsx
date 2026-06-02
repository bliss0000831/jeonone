import { DomainListScreen } from "@/components/DomainListScreen"

export default function InteriorListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "인테리어",
        heroIcon: "color-palette-outline",
        heroColor: "#a855f7",
        heroSub: "검증된 동네 인테리어 업체",
        table: "interior_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/interior",
        domainKind: "interior",
        showCategory: true,
        searchPlaceholder: "업체 검색",
        registerPath: "/interior/register",
        categories: ["전체리모델링", "부분시공", "주방", "욕실", "도배장판", "바닥재", "타일", "붙박이장", "조명전기", "페인팅", "샷시창호"],
      }}
    />
  )
}
