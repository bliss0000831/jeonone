import { DomainListScreen } from "@/components/DomainListScreen"

export default function MovingListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "이사",
        heroIcon: "car-outline",
        heroColor: "#0891b2",
        heroSub: "검증된 이사 업체",
        table: "moving_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/moving",
        domainKind: "moving",
        showCategory: true,
        searchPlaceholder: "업체 검색",
        registerPath: "/moving/register",
        categories: ["가정이사", "원룸이사", "사무실이사", "용달이사", "포장이사"],
      }}
    />
  )
}
