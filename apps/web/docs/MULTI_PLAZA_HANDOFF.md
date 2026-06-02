# 멀티-광장 (멀티테넌시) 적용 — 사용자 작업 가이드

이 PR 은 `gwangjang.app` 을 단일 광장(춘천)에서 **멀티 광장 허브 + 서브도메인 라우팅**으로 전환하는 토대를 깐다.

```
gwangjang.app             → 허브 (전국 지도, 광장 선택)
chuncheon.gwangjang.app   → 춘천광장
gangneung.gwangjang.app   → 강릉광장
원주/속초/.../제주 등 → DB 등록됨, 클릭 비활성, "(오픈예정)" 라벨
```

---

## 적용된 변경 사항

### DB 마이그레이션 (2개 파일)
- `supabase/migrations/20260521000000_multi_plaza_foundation.sql`
  - `plazas` 테이블 (광장 메타데이터, 17개 광장 시드 — 춘천/강릉만 active)
  - `plaza_admins` 테이블 (광장별 관리자, 기존 admin/superadmin 자동 백필)
  - `plaza_profiles` 테이블 (광장별 사용자 가입, 기존 profiles → chuncheon 백필)
  - 모든 콘텐츠 테이블에 `plaza_id` 컬럼 추가 + 'chuncheon' 백필
  - `set_current_plaza()`, `is_plaza_admin()`, `is_super_admin()` 헬퍼 함수
  - `board_categories.slug` UNIQUE 를 `(plaza_id, slug)` 복합으로 변경
- `supabase/migrations/20260521000001_gangneung_dummy_seed.sql`
  - 강릉 더미 매물 5건, 공지 2건, FAQ 2건, 게시판 카테고리 5개 시드

### 코드
- `lib/plaza/config.ts` — 서브도메인 ↔ plaza_id 매핑 (KNOWN_PLAZAS 배열)
- `lib/plaza/server.ts` — `getCurrentPlaza()`, `requirePlaza()` (서버 컴포넌트용)
- `lib/plaza/client.ts` — `getCurrentPlazaClient()`, `buildPlazaUrl()` (클라이언트용)
- `lib/supabase/middleware.ts` — host → `x-plaza` 헤더 주입
- `app/page.tsx` — host 가 허브면 `<HubLanding />`, 광장이면 기존 홈
- `components/hub-landing.tsx` — 한국 지도(SVG) + 권역별 광장 카드
- `lib/hero-banners.ts` — `getHeroBanners(supabase, plazaId)` 광장 필터 추가
- `app/admin/layout.tsx` — `plaza_admins` 권한 체크 + 헤더에 광장 표시 배지

---

## 🚨 사용자가 직접 해야 할 작업 (순서대로)

### 1. Supabase 마이그레이션 적용 (필수, 가장 먼저)

Supabase 대시보드 → SQL Editor 에서 **순서대로** 실행:

1. `supabase/migrations/20260521000000_multi_plaza_foundation.sql` 의 전체 내용 붙여넣고 RUN
2. `supabase/migrations/20260521000001_gangneung_dummy_seed.sql` 도 같은 방식

또는 `supabase db push` 로 일괄 적용.

**검증**: SQL Editor 에서 다음 실행 → 17개 광장 나와야 함
```sql
SELECT id, name, is_active, is_open_soon FROM plazas ORDER BY sort_order;
```

`plaza_admins` 본인 ID 확인:
```sql
SELECT * FROM plaza_admins WHERE user_id = (SELECT id FROM auth.users WHERE email = '본인이메일');
```

본인을 모든 광장 super admin 으로 만들고 싶으면:
```sql
INSERT INTO plaza_admins (user_id, plaza_id, role)
SELECT (SELECT id FROM auth.users WHERE email = '본인이메일'), id, 'super'
FROM plazas
ON CONFLICT (user_id, plaza_id) DO UPDATE SET role = 'super';
```

### 2. Vercel 도메인 설정

#### 2-1. Vercel Pro 플랜 확인
- 현재 Hobby 면 **Pro 로 업그레이드 필수** ($20/월)
  - 와일드카드 도메인 (`*.gwangjang.app`) 은 Pro 만 가능
- vercel.com → 프로젝트 → Settings → General → "Plan" 확인

#### 2-2. 도메인 추가
프로젝트 → Settings → Domains 에서:

```
gwangjang.app          ← 이미 등록됨
*.gwangjang.app        ← 신규 추가 (와일드카드)
```

`*.gwangjang.app` 추가 시 Vercel 이 SSL 인증서 자동 발급. 보통 5분 이내.

### 3. DNS 설정 (가비아/Cloudflare 등)

#### 3-1. 현재 DNS 보유처 확인
도메인을 산 곳 (가비아, Cloudflare Registrar 등) 의 DNS 관리 페이지로.

#### 3-2. 와일드카드 CNAME 추가
```
타입       이름      값                     TTL
─────────────────────────────────────────────────────
A          @         76.76.21.21            (Vercel 안내값, 기존 그대로)
CNAME      *         cname.vercel-dns.com   3600
```

**중요**: `*` 만 추가하면 됨. `chuncheon`, `gangneung` 일일이 추가 X.

#### 3-3. 검증 (DNS 전파 5~30분 후)
```bash
nslookup chuncheon.gwangjang.app
nslookup gangneung.gwangjang.app
```
둘 다 Vercel IP 로 응답해야 함.

### 4. 본인 계정에 광장 가입 추가 (옵션)

광장별 독립 계정 모델이라, 사용자 본인도 chuncheon/gangneung 각각 가입한 상태여야 함.

기존 본인 계정은 이미 chuncheon 에 백필돼있음. 강릉에서도 게시글 등록 등 테스트하려면:

```sql
INSERT INTO plaza_profiles (user_id, plaza_id, nickname)
VALUES (
  (SELECT id FROM auth.users WHERE email = '본인이메일'),
  'gangneung',
  '본인닉네임'
);
```

### 5. 동작 확인 체크리스트

DNS + Vercel + 마이그레이션 다 끝난 뒤:

- [ ] `gwangjang.app` 진입 → 한국 지도 + 17개 광장 마커 표시
- [ ] 지도에서 춘천/강릉 마커 클릭 시 해당 서브도메인으로 이동
- [ ] 다른 광장 (원주 등) 클릭 시 동작 안 함 + "(오픈예정)" 라벨
- [ ] `chuncheon.gwangjang.app` → 기존 춘천광장 화면 그대로 (매물·게시판 다 표시)
- [ ] `gangneung.gwangjang.app` → 강릉 더미 매물 5건 표시
- [ ] `chuncheon.gwangjang.app/admin` → 기존 admin 정상 진입, 헤더에 "춘천광장 관리 중" 배지
- [ ] `gangneung.gwangjang.app/admin` → 강릉 admin 진입, "강릉광장 관리 중" 배지
- [ ] 춘천에서 로그인 → 강릉 도메인으로 이동 시 자동 로그아웃 상태 (광장별 독립 세션 ✅)

### 6. 5월 .kr 도메인 변경 (gwangjang.kr 취득 후)

도메인 취득하면:
1. Vercel 프로젝트 → Settings → Domains → `gwangjang.kr` + `*.gwangjang.kr` 추가
2. .kr 도메인 DNS 에 위 3-2 와 동일하게 와일드카드 CNAME 등록
3. `lib/plaza/config.ts` 의 `HUB_HOSTNAMES` 에 `gwangjang.kr` 이미 포함돼있음 → 코드 수정 불필요
4. (선택) 기존 `.app` 을 `.kr` 로 redirect 하려면 Vercel Domains 에서 `gwangjang.app` 를 `gwangjang.kr` 으로 redirect 설정

---

## ⚠️ 이 PR 에서 하지 않은 것 (후속 작업 필요)

이 PR 은 **토대만 깔았다**. 모든 페이지가 아직 광장 필터를 안 거치고 있어, 강릉 도메인에서도 춘천 데이터가 보일 수 있음. 메인 페이지(`app/page.tsx`)와 hero banner 만 plaza 필터 적용됨.

### 후속 PR 에서 할 일 (예상 30~50개 파일)

각 페이지·API 의 supabase 쿼리에 `.eq('plaza_id', plaza)` 추가 필요:

1. **매물 도메인** (`app/properties/`, `app/property/`, `app/register/`, `app/my-properties/`)
   - 목록 / 상세 / 등록 / 수정 / 검색 모두 plaza 필터
   - 등록 시 `plaza_id` 자동 주입 (`getCurrentPlaza()` 결과)
2. **커뮤니티 도메인** (`app/board/`, `app/secondhand/`, `app/jobs/`, `app/sharing/`, `app/group-buying/`, `app/clubs/`, `app/local-food/`, `app/new-store/`, `app/interior/`, `app/moving/`, `app/cleaning/`, `app/repair/`)
3. **운영** (`app/notice/`, `app/faq/`, `app/support/`)
4. **검색** (`app/search/`)
5. **관리자 페이지** (`app/admin/**`) — admin 도 광장별 데이터만 보이게
6. **알림 / 채팅** — 광장 cross-cutting 일 수도 있음. 정책 결정 필요

### 권장 패턴 (코드 작성 시)

서버 컴포넌트:
```ts
import { getCurrentPlaza } from '@/lib/plaza/server'

export default async function Page() {
  const plaza = await getCurrentPlaza()
  if (!plaza) return notFound() // 또는 hub redirect

  const supabase = await createClient()
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('plaza_id', plaza)   // ← 핵심
    .eq('status', 'active')
}
```

INSERT 시:
```ts
await supabase.from('properties').insert({
  ...형식,
  plaza_id: plaza,   // ← 필수
})
```

클라이언트 컴포넌트:
```ts
'use client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'

const plaza = getCurrentPlazaClient()
const { data } = await supabase.from('...').select('*').eq('plaza_id', plaza)
```

### RLS 강화 (선택)

현재는 application 레벨 필터만 의존. 보안 강화하려면 후속 PR 에서 RLS 정책 업데이트:

```sql
-- 예시: properties 테이블에 plaza 격리 RLS
DROP POLICY IF EXISTS properties_plaza_isolation ON properties;
CREATE POLICY properties_plaza_isolation ON properties
  FOR SELECT USING (
    plaza_id = current_setting('app.current_plaza', true)
    OR is_plaza_admin(plaza_id)
  );
```

이러려면 모든 supabase 클라이언트가 요청 시작에 `set_current_plaza()` 호출해야 함 — 추가 작업.

---

## 트러블슈팅

### "이 사이트에 접속할 수 없음" (chuncheon.gwangjang.app)
- DNS 전파 안 됐거나, Vercel 와일드카드 미등록.
- `nslookup chuncheon.gwangjang.app` 으로 확인.

### 강릉 도메인에서도 춘천 매물이 보임
- 정상 (이번 PR 미적용 영역). 후속 작업으로 페이지별 plaza 필터 추가 필요.

### Admin 페이지 진입 시 "/" 로 리다이렉트
- `plaza_admins` 에 본인 ID 가 없거나, 그 광장에 권한 없음.
- 위 §1 에 있는 SQL 로 본인 super 등록.

### 한국 지도가 너무 단순함
- `components/hub-landing.tsx` 의 `KoreaMap` 함수에서 SVG path 사용. 정밀한 한국 행정구역 GeoJSON 으로 교체 권장 (예: [Korea-Map-Data](https://github.com/southkorea/southkorea-maps)).

---

## 요약 — 사용자 작업 5분 체크리스트

```
[ ] 1. Supabase SQL Editor 에서 마이그레이션 2개 실행
[ ] 2. plaza_admins 본인 super 등록 SQL 실행
[ ] 3. Vercel Pro 플랜 확인 (없으면 업그레이드)
[ ] 4. Vercel Domains 에 *.gwangjang.app 추가
[ ] 5. DNS 에 CNAME * → cname.vercel-dns.com 추가
[ ] 6. 5분 대기 후 chuncheon.gwangjang.app / gangneung.gwangjang.app 접속 확인
```

이 6단계 끝나면 멀티 광장 동작 시작. 페이지별 필터링은 후속 PR.
