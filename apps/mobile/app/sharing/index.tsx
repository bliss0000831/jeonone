import { DomainListScreen } from "@/components/DomainListScreen"

export default function SharingListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "무료 나눔",
        heroIcon: "gift",
        heroColor: "#225a39",
        heroSub: "이웃과 정(情)을 나눠요",
        table: "sharing_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/sharing",
        domainKind: "sharing",
        showCategory: true,
        searchPlaceholder: "나눔 검색",
        registerPath: "/sharing/register",
        categories: ["농기구/자재", "종자·모종", "농산물", "생활용품", "의류", "기타"],
      }}
    />
  )
}
