'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ThemeBasicInfoPage from '../theme/basic-info/page'
import ThemeFooterPage from '../theme/footer/page'
import ThemeMenuPage from '../theme/menu/page'
import ThemeSliderPage from '../theme/slider/page'

export default function AppearancePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">외관</h1>
        <p className="text-sm text-muted-foreground">
          기본 정보, 푸터, 메뉴, 슬라이더 등 외관 관련 설정을 한 곳에서 관리합니다.
        </p>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">기본 정보</TabsTrigger>
          <TabsTrigger value="footer">푸터</TabsTrigger>
          <TabsTrigger value="menu">메뉴</TabsTrigger>
          <TabsTrigger value="slider">슬라이더</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4">
          <ThemeBasicInfoPage />
        </TabsContent>
        <TabsContent value="footer" className="mt-4">
          <ThemeFooterPage />
        </TabsContent>
        <TabsContent value="menu" className="mt-4">
          <ThemeMenuPage />
        </TabsContent>
        <TabsContent value="slider" className="mt-4">
          <ThemeSliderPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
