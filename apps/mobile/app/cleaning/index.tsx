import { DomainListScreen } from "@/components/DomainListScreen"

export default function CleaningListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "청소",
        heroIcon: "sparkles-outline",
        heroColor: "#06b6d4",
        heroSub: "검증된 청소 업체",
        table: "cleaning_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/cleaning",
        domainKind: "cleaning",
        showCategory: true,
        searchPlaceholder: "업체 검색",
        registerPath: "/cleaning/register",
        categories: ["입주청소", "이사청소", "정기청소", "사무실청소", "에어컨청소"],
      }}
    />
  )
}
