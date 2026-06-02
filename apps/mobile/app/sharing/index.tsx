import { DomainListScreen } from "@/components/DomainListScreen"

export default function SharingListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "나눔",
        heroIcon: "heart-outline",
        heroColor: "#ef4444",
        heroSub: "이웃과 함께 나눠요",
        table: "sharing_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/sharing",
        domainKind: "sharing",
        showCategory: true,
        searchPlaceholder: "나눔 검색",
        registerPath: "/sharing/register",
        categories: ["의류", "생활", "가전", "도서", "유아", "기타"],
      }}
    />
  )
}
