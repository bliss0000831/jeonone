import { DomainListScreen } from "@/components/DomainListScreen"

export default function SecondhandListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "농기구/자재",
        heroIcon: "construct",
        heroColor: "#225a39",
        heroSub: "트랙터, 경운기, 하우스 자재 등",
        table: "secondhand_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/secondhand",
        domainKind: "secondhand",
        showPrice: true,
        showCategory: true,
        searchPlaceholder: "농기구 검색",
        registerPath: "/secondhand/register",
        categories: ["트랙터", "경운기", "이양기", "수확기", "관리기", "방제기/드론", "운반기", "하우스자재", "부품/소모품", "농자재", "기타"],
      }}
    />
  )
}
