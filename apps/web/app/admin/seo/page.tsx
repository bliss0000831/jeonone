'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import SeoBasicPage from './basic/page'
import SeoMetaPage from './meta/page'
import SitemapPage from './sitemap/page'

export default function SeoOverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">SEO</h1>
        <p className="text-sm text-muted-foreground">
          기본 설정, 메타 태그, 사이트맵을 한 곳에서 관리합니다.
        </p>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">기본</TabsTrigger>
          <TabsTrigger value="meta">메타</TabsTrigger>
          <TabsTrigger value="sitemap">사이트맵</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4">
          <SeoBasicPage />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <SeoMetaPage />
        </TabsContent>
        <TabsContent value="sitemap" className="mt-4">
          <SitemapPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
