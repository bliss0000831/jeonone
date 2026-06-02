import { DomainListScreen } from "@/components/DomainListScreen"

export default function JobsListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "구인구직",
        heroIcon: "briefcase-outline",
        heroColor: "#8b5cf6",
        heroSub: "동네 일자리 정보",
        table: "jobs_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/jobs",
        domainKind: "jobs",
        showCategory: true,
        searchPlaceholder: "구인구직 검색",
        registerPath: "/jobs/register",
        categories: ["음식점/카페/매장", "물류/배달", "사무/콜센터", "과외/교육", "행사/이벤트", "단순노무", "전문직/기술직", "IT/디자인", "홍보/마케팅", "기타"],
      }}
    />
  )
}
