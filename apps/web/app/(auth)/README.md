# `(auth)` 라우트 그룹

로그인 / 회원가입 / 비밀번호 재설정 등 인증 관련 페이지.

## 광장별 독립 계정
- 사용자는 광장별로 가입해야 함 (`plaza_profiles` 테이블)
- chuncheon 에서 가입한 계정이 gangneung 에 자동 로그인되지 않음
  (Supabase 쿠키가 host-scoped 로 설정돼있음)
- 회원가입 흐름은 현재 광장에 `plaza_profiles` row 추가
