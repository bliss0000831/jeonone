/**
 * 춘천시 행정동/읍/면 대략적 중심 좌표
 * - 외부 역지오코딩 API 없이 "내 위치 → 가장 가까운 동" 로컬 매칭용
 * - 좌표는 공개 행정구역 경계 중심점을 근사 (소수점 3자리 수준이면 충분)
 * - 동 이름은 `supabase/migrations/20260426000000_seed_chuncheon_dongs.sql` 의 regions 테이블과 1:1 매칭
 */
export interface DongCoord {
  name: string
  lat: number
  lng: number
}

export const CHUNCHEON_DONG_COORDS: DongCoord[] = [
  // 도심 (동)
  { name: "교동",       lat: 37.885, lng: 127.737 },
  { name: "조운동",     lat: 37.881, lng: 127.729 },
  { name: "약사명동",   lat: 37.877, lng: 127.727 },
  { name: "근화동",     lat: 37.885, lng: 127.717 },
  { name: "소양동",     lat: 37.884, lng: 127.732 },
  { name: "후평1동",    lat: 37.872, lng: 127.735 },
  { name: "후평2동",    lat: 37.867, lng: 127.742 },
  { name: "후평3동",    lat: 37.861, lng: 127.741 },
  { name: "석사동",     lat: 37.862, lng: 127.727 },
  { name: "퇴계동",     lat: 37.853, lng: 127.723 },
  { name: "효자1동",    lat: 37.878, lng: 127.735 },
  { name: "효자2동",    lat: 37.874, lng: 127.740 },
  { name: "효자3동",    lat: 37.870, lng: 127.738 },
  { name: "강남동",     lat: 37.867, lng: 127.718 },
  { name: "신사우동",   lat: 37.913, lng: 127.721 },
  { name: "온의동",     lat: 37.875, lng: 127.715 },

  // 읍/면
  { name: "신북읍",     lat: 37.945, lng: 127.735 },
  { name: "동면",       lat: 37.895, lng: 127.788 },
  { name: "동산면",     lat: 37.810, lng: 127.790 },
  { name: "신동면",     lat: 37.852, lng: 127.765 },
  { name: "동내면",     lat: 37.860, lng: 127.774 },
  { name: "남면",       lat: 37.780, lng: 127.610 },
  { name: "남산면",     lat: 37.742, lng: 127.552 },
  { name: "서면",       lat: 37.890, lng: 127.680 },
  { name: "사북면",     lat: 37.995, lng: 127.690 },
  { name: "북산면",     lat: 37.995, lng: 127.850 },
]

/** 두 좌표 사이 거리(km) — Haversine */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * 주어진 좌표와 가장 가까운 춘천 동/면을 반환.
 * - 춘천시 경계 밖(예: 서울) 이면 가장 가까운 동을 여전히 반환하되 distance 가 매우 크게 나옴.
 *   호출부에서 `distance > 30km` 등으로 "춘천 밖" 판단 가능.
 */
export function findNearestDong(
  lat: number,
  lng: number,
): { name: string; distance: number } {
  let best = { name: CHUNCHEON_DONG_COORDS[0].name, distance: Infinity }
  for (const d of CHUNCHEON_DONG_COORDS) {
    const dist = distanceKm(lat, lng, d.lat, d.lng)
    if (dist < best.distance) {
      best = { name: d.name, distance: dist }
    }
  }
  return best
}
