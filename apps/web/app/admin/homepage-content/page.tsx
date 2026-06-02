'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import BannersPage from '../banners/page'
import PageHeroesPage from '../page-heroes/page'
import ThemeSliderPage from '../theme/slider/page'

export default function HomepageContentPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">홈 화면 콘텐츠</h1>
        <p className="text-sm text-muted-foreground">
          배너, 히어로 섹션, 슬라이더를 한 곳에서 관리합니다.
        </p>
      </div>

      <Tabs defaultValue="banners" className="w-full">
        <TabsList>
          <TabsTrigger value="banners">배너</TabsTrigger>
          <TabsTrigger value="heroes">히어로 섹션</TabsTrigger>
          <TabsTrigger value="slider">슬라이더</TabsTrigger>
        </TabsList>

        <TabsContent value="banners" className="mt-4">
          <BannersPage />
        </TabsContent>
        <TabsContent value="heroes" className="mt-4">
          <PageHeroesPage />
        </TabsContent>
        <TabsContent value="slider" className="mt-4">
          <ThemeSliderPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
