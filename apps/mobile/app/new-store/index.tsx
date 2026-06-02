import { DomainListScreen } from "@/components/DomainListScreen"

export default function NewStoreListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "신장개업",
        heroIcon: "storefront-outline",
        heroColor: "#ec4899",
        heroSub: "동네 새 가게 소식과 이벤트",
        table: "new_store_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/new-store",
        domainKind: "new-store",
        titleCol: "store_name",
        showCategory: true,
        searchPlaceholder: "가게 이름 검색",
        registerPath: "/new-store/register",
        categories: ["음식점", "카페", "미용", "병원", "학원", "마트", "기타"],
      }}
    />
  )
}
