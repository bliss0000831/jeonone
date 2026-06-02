/**
 * AddressSearch — 도로명주소 검색 (Juso.go.kr API 기반 네이티브 UI).
 *
 * 이전 Daum WebView 임베드 → 네이티브 검색 UI 로 교체.
 * 호출 인터페이스 (`value`, `onChange(addr, data)`) 는 동일 유지하여
 * 기존 18 개 콜사이트 변경 없음.
 *
 * 실 구현은 JusoSearch 에 있음 — 여기는 호환성 위한 re-export 레이어.
 */

export { JusoSearch as AddressSearch } from "./JusoSearch"
export type { DaumPostcodeData } from "./JusoSearch"
