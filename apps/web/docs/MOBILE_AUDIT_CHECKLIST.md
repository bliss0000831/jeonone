# Mobile UX Audit Checklist

이 문서는 production 배포 후 **실제 핸드폰** 으로 직접 확인할 항목 리스트.
정적 grep 으론 못 잡는 issues 가 많아서 manual QA 가 필요합니다.

## 디바이스 매트릭스

최소한 아래 3가지에서 테스트:
- iPhone SE / mini (작은 화면, 375px)
- iPhone 15 Pro / Galaxy S24 (중간, 393px)
- iPad mini (태블릿, 768px)

## 페이지별 체크리스트

### 메인/광장 홈
- [ ] hero carousel 안 잘리고 스와이프 동작
- [ ] 카테고리 탭 가로 스크롤 부드럽게
- [ ] 매물 카드 그리드 깨짐 없음
- [ ] 광장 정보 popover 모바일에서 열림

### 헤더
- [ ] 광장명 (`siteBranding.name`) 너무 길면 줄어드는지 확인 — `whitespace-nowrap` 으로 인한 overflow
- [ ] 모바일 햄버거 메뉴 동작 + 닫기 가능
- [ ] 알림 / 초대 / 사용자 메뉴 드롭다운이 화면 밖으로 안 잘림
- [ ] 검색 박스 키보드 올라올 때 input 가려지지 않음

### 매물 등록 / 글쓰기
- [ ] 이미지 업로드 다중 선택 동작
- [ ] 주소 검색 모달 키보드 작동
- [ ] 글 길이 제한 안 걸림
- [ ] 카메라 직접 촬영 옵션 떴는지

### 채팅
- [ ] 메시지 입력 시 키보드 올라와도 마지막 메시지 보임
- [ ] 이미지 첨부 동작
- [ ] 스크롤 부드럽게 (가상 키보드 충돌 X)

### 매물 상세
- [ ] 이미지 갤러리 좌우 스와이프 + 핀치 줌
- [ ] 지도 (naver-map) 모바일에서 터치 동작
- [ ] 채팅하기 / 찜 / 공유 버튼 영역 충분히 큼 (>=44px)

### 게시판
- [ ] 카테고리 필터 모바일 dropdown
- [ ] 댓글 작성 input 키보드 작동
- [ ] 이미지 업로드 multiple

### 마이페이지
- [ ] 탭 (작성글/저장/리뷰/통계) 가로 스크롤 잘 됨
- [ ] 통계 차트 잘 보임 (작은 화면에서 텍스트 안 잘림)

### Auth
- [ ] 로그인/회원가입 input zoom 안 됨 (font-size 16px+)
- [ ] 카카오 로그인 redirect 정상

## 흔한 모바일 버그 패턴

1. **`whitespace-nowrap` overflow**:
   - 광장명 + 도시명 표시할 때 작은 화면에서 잘림
   - 해결: `truncate` 추가 또는 `max-width:100%`

2. **fixed positioning + 가상 키보드**:
   - 채팅 input 이 가상 키보드 위에 안 올라감
   - 해결: `bottom-[env(safe-area-inset-bottom)]` 등

3. **터치 영역 너무 작음**:
   - icon button `w-8 h-8` 는 32px → 44px (`w-11 h-11`) 권장

4. **input zoom**:
   - iOS 가 16px 미만 input 클릭 시 자동 zoom
   - 해결: input 기본 font-size 16px 유지

5. **horizontal scroll**:
   - 어떤 element 가 viewport 보다 넓으면 화면 전체가 가로 스크롤
   - 디버그: `body { overflow-x: hidden }` 추가하면 임시 가림

## Tailwind 응급 패치 (즉시 적용 가능)

```tsx
// 사이트명 overflow 방지
<span className="text-base sm:text-lg font-bold truncate max-w-[8rem] sm:max-w-none">

// 작은 터치 영역 키우기
<Button size="icon" className="w-11 h-11 sm:w-9 sm:h-9">

// iOS input zoom 방지
<Input className="text-base"> {/* 16px 이상 유지 */}
```

## 자동화 도구 (선택)

- **Playwright mobile emulation**: 정해진 viewport 에서 e2e 테스트
- **Chrome DevTools → Lighthouse Mobile**: 점수 기반 평가
- **BrowserStack** (유료): 실제 디바이스 farm

## 이슈 발견 시 보고 형식

```
[페이지] /property/[id]
[디바이스] iPhone SE 1세대 (375x667)
[증상] 매물 가격 텍스트가 한 줄에 안 들어가서 다음 줄로 넘어가는데 위 layout 깨짐
[재현] 매물 등록 → "5억 5,000만원" 같은 긴 가격
[제안] 가격 영역 `whitespace-normal` + 부모에 `flex-wrap`
```
