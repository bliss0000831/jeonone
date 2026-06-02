import { DomainListScreen } from "@/components/DomainListScreen"

export default function ClubsListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "모임",
        heroIcon: "people-circle-outline",
        heroColor: "#0ea5e9",
        heroSub: "이웃과 함께하는 동호회 / 운동 모임",
        table: "clubs",
        statusFilter: { col: "status", val: "recruiting" },
        basePath: "/clubs",
        domainKind: "clubs",
        showCategory: true,
        searchPlaceholder: "모임 검색",
        registerPath: "/clubs/register",
        categories: ["러닝", "배드민턴", "축구", "농구", "테니스", "등산", "수영", "자전거", "요가", "기타"],
      }}
    />
  )
}
