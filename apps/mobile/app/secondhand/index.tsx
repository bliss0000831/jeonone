import { DomainListScreen } from "@/components/DomainListScreen"

export default function SecondhandListScreen() {
  return (
    <DomainListScreen
      config={{
        title: "중고거래",
        heroIcon: "cart-outline",
        heroColor: "#10b981",
        heroSub: "이웃과 안전하게 중고 거래",
        table: "secondhand_posts",
        statusFilter: { col: "status", val: "active" },
        basePath: "/secondhand",
        domainKind: "secondhand",
        showPrice: true,
        showCategory: true,
        searchPlaceholder: "물품 검색",
        registerPath: "/secondhand/register",
        categories: ["디지털/가전", "가구/인테리어", "유아동", "생활/주방", "여성패션", "남성패션", "뷰티", "도서/티켓", "스포츠/레저", "취미/게임", "반려동물", "기타"],
      }}
    />
  )
}
