import { DomainListScreen } from "@/components/DomainListScreen"

export default function RepairListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "수리",
        heroIcon: "construct-outline",
        heroColor: "#f97316",
        heroSub: "검증된 동네 수리 업체",
        table: "repair_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/repair",
        domainKind: "repair",
        showCategory: true,
        searchPlaceholder: "업체 검색",
        registerPath: "/repair/register",
        categories: ["전기수리", "배관수리", "도배장판", "가전수리", "잡수리"],
      }}
    />
  )
}
