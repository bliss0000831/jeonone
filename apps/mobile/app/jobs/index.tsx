import { DomainListScreen } from "@/components/DomainListScreen"

export default function JobsListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "일손 찾기",
        heroIcon: "people",
        heroColor: "#225a39",
        heroSub: "품앗이 · 구인 · 구직",
        heroImage: require("../../assets/images/card-workers.jpg"),
        table: "jobs_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/jobs",
        domainKind: "jobs",
        showCategory: true,
        searchPlaceholder: "일손 검색",
        registerPath: "/jobs/register",
        categories: ["농사 일손", "수확/선별", "모내기/이앙", "과수/원예", "축산", "운반/기계", "품앗이", "기타"],
      }}
    />
  )
}
