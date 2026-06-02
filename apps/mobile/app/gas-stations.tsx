/**
 * 주유소 가격 — 광장 web /gas-stations 1:1 RN 미러.
 *
 * 동작:
 *   - expo-location 으로 현재 위치
 *   - GET /api/gas-stations?mode=nearby&lat=&lng=&radius=&product= (gwangjangFetch)
 *   - 브랜드별 색상 칩 + 가격 + 거리
 *   - 마커/카드 탭 → 바텀시트 (정보 + 카카오/네이버 길찾기 선택)
 */

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { gwangjangFetch } from "@/lib/supabase"
import { PointsMapView, type MapPoint } from "@/components/PointsMapView"

type Product = "gasoline" | "diesel" | "premium" | "lpg"

const PRODUCT_LABEL: Record<Product, string> = {
  gasoline: "휘발유",
  diesel: "경유",
  premium: "고급휘발유",
  lpg: "LPG",
}

interface Station {
  uniId: string
  osNm: string
  poll: string
  brand: string
  price: number
  distance?: number
  lat: number
  lng: number
  newAddr?: string
}

const BRAND_STYLE: Record<string, { bg: string; label: string }> = {
  SKE: { bg: "#e60012", label: "SK" },
  GSC: { bg: "#00805e", label: "GS" },
  HDO: { bg: "#00a4d8", label: "현대" },
  SOL: { bg: "#ffb300", label: "S-OIL" },
  RTE: { bg: "#1e3a8a", label: "알뜰" },
  RTX: { bg: "#1e3a8a", label: "고속알뜰" },
  NHO: { bg: "#1e3a8a", label: "NH알뜰" },
  E1G: { bg: "#7b1fa2", label: "E1" },
  SKG: { bg: "#e60012", label: "SK가스" },
  ETC: { bg: "#374151", label: "기타" },
}

function brandStyle(poll: string) {
  return BRAND_STYLE[poll] || BRAND_STYLE.ETC
}

// 가격 마커 HTML — 브랜드 배지 + 흰색 가격칩 가로 결합 + 아래 꼭지(꼬리)
// isMin 강조는 테두리 대신 가격 텍스트 색(빨강) 으로만 — 테두리는 모서리에 깨끗하지 못해 제거.
function priceMarkerHtml(poll: string, price: number, isMin: boolean) {
  const { bg, label } = brandStyle(poll)
  const won = price.toLocaleString()
  const priceColor = isMin ? "#dc2626" : "#111827"
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;">` +
      `<div style="display:flex;align-items:stretch;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.25);">` +
        `<div style="background:${bg};color:white;padding:3px 6px;font-size:10px;font-weight:800;display:flex;align-items:center;white-space:nowrap;">${label}</div>` +
        `<div style="background:#ffffff;color:${priceColor};padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;">${won}원</div>` +
      `</div>` +
      // 꼭지 — 길게 (border-top 11px) 좌표 정확히 가리키도록
      `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid #ffffff;margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.25));"></div>` +
    `</div>`
  )
}

// Native(Naver Map) 마커 — 브랜드 칩 + 흰 가격 칩 + 긴 꼭지.
// isMin 은 가격 색만 빨강으로 변경 (테두리 제거).
function StationMarkerNode({
  bg,
  label,
  price,
  isMin,
}: {
  bg: string
  label: string
  price: number
  isMin: boolean
}) {
  return (
    <View style={markerStyles.column}>
      <View style={markerStyles.wrap}>
        <View style={[markerStyles.brandCell, { backgroundColor: bg }]}>
          <Text style={markerStyles.brandLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={markerStyles.priceCell}>
          <Text
            style={[
              markerStyles.priceLabel,
              isMin && { color: "#dc2626" },
            ]}
            numberOfLines={1}
          >
            {price.toLocaleString()}원
          </Text>
        </View>
      </View>
      {/* 꼭지 — 길게 11px (이전 7px → 11px) */}
      <View style={markerStyles.tail} />
    </View>
  )
}

const markerStyles = StyleSheet.create({
  column: {
    alignItems: "center",
  },
  wrap: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 3,
  },
  brandCell: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  brandLabel: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  priceCell: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 7,
    paddingVertical: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  priceLabel: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "700",
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ffffff",
    marginTop: -1,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 2,
  },
})

// 한글 1자 ≈ 13px / 영문·숫자 ≈ 7px 가정. NaverMapMarkerOverlay 의 width 정확치
// 부족 시 텍스트가 잘리므로 넉넉히 잡는다 (특히 "NH알뜰" 4글자가 짤리던 이슈).
function isHangul(ch: string) {
  const code = ch.charCodeAt(0)
  return code >= 0x3131 && code <= 0xd79d
}
function textPx(s: string, pxHangul = 13, pxAscii = 7) {
  let w = 0
  for (const c of s) w += isHangul(c) ? pxHangul : pxAscii
  return w
}
function estimateMarkerWidth(label: string, price: number) {
  // 브랜드 셀 (10px font, weight 800) — padding 14
  const brandW = textPx(label) + 14
  // 가격 셀 (11px font) — padding 14, "원" 글자 추가
  const priceW = textPx(String(price.toLocaleString()) + "원", 11, 7) + 14
  // 약간의 안전 여유 (border 등)
  return Math.max(60, brandW + priceW + 4)
}

export default function GasStationsScreen() {
  const router = useRouter()
  const [permission, setPermission] = useState<
    "idle" | "prompting" | "granted" | "denied"
  >("idle")
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [product, setProduct] = useState<Product>("gasoline")
  const [searchRadius, setSearchRadius] = useState<number>(3000)
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [mocked, setMocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Station | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null)

  const requestLocation = useCallback(async () => {
    setPermission("prompting")
    setError(null)

    const { getFastUserLocation } = await import("@/lib/location")
    const coords = await getFastUserLocation()
    if (coords) {
      setMyLoc(coords)
      // 내 위치 기준 센터링
      setFocus({ ...coords, zoom: 14, nonce: Date.now() })
      setPermission("granted")
    } else {
      setError("위치 정보를 가져올 수 없습니다")
      setPermission("denied")
    }
  }, [])

  // 카드/마커 탭 → 지도 이동 + 바텀시트
  function selectStation(s: Station) {
    setFocus({ lat: s.lat, lng: s.lng, zoom: 15, nonce: Date.now() })
    setSelected(s)
  }

  useEffect(() => {
    if (!myLoc) return
    let cancelled = false
    setLoading(true)
    setNotice(null)
    setMocked(false)
    ;(async () => {
      try {
        const url = `/api/gas-stations?mode=nearby&lat=${myLoc.lat}&lng=${myLoc.lng}&radius=${searchRadius}&product=${product}`
        const res = await gwangjangFetch(url, { cache: "no-store" } as any)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setStations((data?.stations ?? []) as Station[])
        if (data?.mocked) {
          setMocked(true)
          setNotice(data?.notice ?? null)
        }
      } catch {
        setError("주유소 정보를 불러오지 못했습니다")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [myLoc, product, searchRadius])

  // 카카오맵 길찾기
  function openKakao(s: Station) {
    const fromPart = myLoc ? `/from/내위치,${myLoc.lat},${myLoc.lng}` : ""
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(
      s.osNm,
    )},${s.lat},${s.lng}${fromPart}`
    Linking.openURL(url).catch(() => {})
  }

  // 네이버 지도 길찾기 — 앱 deep link 우선 (목적지 자동 입력),
  // 미설치 시 웹 fallback (앱 설치 페이지로 유도됨).
  // 참고: https://navermaps.github.io/maps.js.ncp/docs/tutorial-1-applink.html
  function openNaver(s: Station) {
    const dname = encodeURIComponent(s.osNm)
    const appUrl = `nmap://route/car?dlat=${s.lat}&dlng=${s.lng}&dname=${dname}&appname=com.gwangjang.mobile`
    const webUrl = `https://map.naver.com/p/directions/-/${s.lng},${s.lat},${dname},,PLACE_POI/-/car`
    Linking.openURL(appUrl).catch(() => {
      Linking.openURL(webUrl).catch(() => {})
    })
  }

  const cheapest = stations[0]
  const minPrice = cheapest?.price

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>주유소 가격</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="car" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>주유소 가격 비교</Text>
            <Text style={styles.infoSub}>한국석유공사 오피넷 데이터 · 5분마다 갱신</Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>유종</Text>
          <View style={styles.productTabs}>
            {(Object.keys(PRODUCT_LABEL) as Product[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setProduct(p)}
                style={[
                  styles.productTab,
                  product === p && styles.productTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.productTabText,
                    product === p && { color: "#ffffff", fontWeight: "700" },
                  ]}
                >
                  {PRODUCT_LABEL[p]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.filterLabel, { marginTop: 12 }]}>반경</Text>
          <View style={styles.productTabs}>
            {[1000, 3000, 5000].map((r) => (
              <Pressable
                key={r}
                onPress={() => setSearchRadius(r)}
                style={[
                  styles.productTab,
                  searchRadius === r && styles.productTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.productTabText,
                    searchRadius === r && { color: "#ffffff", fontWeight: "700" },
                  ]}
                >
                  {r / 1000}km
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {permission === "idle" && (
          <View style={styles.locBanner}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="location" size={18} color="#dc2626" />
              <View style={{ flex: 1 }}>
                <Text style={styles.locBannerTitle}>내 위치로 검색해요</Text>
                <Text style={styles.locBannerSub}>
                  위치 권한을 허용하면 결과가 표시됩니다
                </Text>
              </View>
            </View>
            <Pressable style={styles.locBannerBtn} onPress={requestLocation}>
              <Text style={styles.locBannerBtnText}>위치 허용</Text>
            </Pressable>
          </View>
        )}

        <View style={{ marginBottom: 12 }}>
          <PointsMapView
            center={
              myLoc
                ? { ...myLoc, zoom: 13 }
                : { lat: 37.881, lng: 127.730, zoom: 13 }
            }
            myLocation={myLoc}
            focus={focus}
            points={stations.map<MapPoint>((s) => {
              const bs = brandStyle(s.poll)
              const isMin = s.price === minPrice
              return {
                id: s.uniId,
                lat: s.lat,
                lng: s.lng,
                title: s.osNm,
                color: bs.bg,
                iconHtml: priceMarkerHtml(s.poll, s.price, isMin),
                iconNode: (
                  <StationMarkerNode
                    bg={bs.bg}
                    label={bs.label}
                    price={s.price}
                    isMin={isMin}
                  />
                ),
                iconWidth: estimateMarkerWidth(bs.label, s.price),
                iconHeight: 38, // pill ~24 + tail 11 + 약간 여유
              }
            })}
            onMarkerPress={(id) => {
              const s = stations.find((x) => x.uniId === id)
              if (s) selectStation(s)
            }}
            height={300}
          />
        </View>

        {permission === "idle" && (
          <View style={styles.cheapestEmpty}>
            <View style={styles.cheapestEmptyHead}>
              <View style={styles.trophy}>
                <Ionicons name="trophy" size={14} color="#ffffff" />
              </View>
              <Text style={styles.cheapestEmptyLabel}>저렴한 순위</Text>
              <Text style={styles.cheapestEmptyCount}>0곳</Text>
            </View>
            <View style={styles.cheapestEmptyBody}>
              <Text style={styles.cheapestEmptyText}>반경 내 주유소가 없어요</Text>
            </View>
          </View>
        )}

        {permission === "prompting" && (
          <View style={styles.center}>
            <ActivityIndicator color="#dc2626" />
            <Text style={styles.muted}>위치 확인 중...</Text>
          </View>
        )}

        {permission === "denied" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>위치를 확인할 수 없습니다</Text>
              <Text style={styles.errorSub}>{error ?? ""}</Text>
              <Pressable style={styles.retryBtn} onPress={requestLocation}>
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </Pressable>
              {/* OS 가 권한 재요청을 더 띄우지 않는 경우(거부 후) 설정에서 직접 허용하도록 안내 */}
              <Pressable style={[styles.retryBtn, { marginTop: 8 }]} onPress={() => { Linking.openSettings().catch(() => {}) }}>
                <Text style={styles.retryBtnText}>설정에서 위치 권한 허용</Text>
              </Pressable>
            </View>
          </View>
        )}

        {permission === "granted" && (
          <>
            {!!notice && (
              <View style={styles.noticeCard}>
                <Ionicons
                  name="information-circle"
                  size={14}
                  color={lightColors.ink500}
                />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#dc2626" />
                <Text style={styles.muted}>주유소 검색 중...</Text>
              </View>
            ) : stations.length === 0 ? (
              <View style={styles.cheapestEmpty}>
                <View style={styles.cheapestEmptyHead}>
                  <View style={styles.trophy}>
                    <Ionicons name="trophy" size={14} color="#ffffff" />
                  </View>
                  <Text style={styles.cheapestEmptyLabel}>저렴한 순위</Text>
                  <Text style={styles.cheapestEmptyCount}>0곳</Text>
                </View>
                <View style={styles.cheapestEmptyBody}>
                  <Text style={styles.cheapestEmptyText}>반경 내 주유소가 없어요</Text>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {cheapest && (
                  <View style={styles.cheapestCard}>
                    <View style={styles.trophy}>
                      <Ionicons name="trophy" size={16} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cheapestLabel}>최저가</Text>
                      <Text style={styles.cheapestPrice}>
                        {cheapest.price?.toLocaleString()}
                        <Text style={styles.cheapestUnit}> 원/L</Text>
                      </Text>
                    </View>
                  </View>
                )}

                {stations.map((s, i) => {
                  const bs = brandStyle(s.poll)
                  return (
                    <Pressable
                      key={`${s.uniId}-${i}`}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => selectStation(s)}
                    >
                      <View style={[styles.brandBadge, { backgroundColor: bs.bg }]}>
                        <Text style={styles.brandText}>{bs.label}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stationName} numberOfLines={1}>
                          {s.osNm}
                        </Text>
                        {!!s.newAddr && (
                          <Text style={styles.stationAddr} numberOfLines={1}>
                            {s.newAddr}
                          </Text>
                        )}
                        {typeof s.distance === "number" && (
                          <View style={styles.cardMeta}>
                            <Ionicons
                              name="navigate-outline"
                              size={11}
                              color={lightColors.ink500}
                            />
                            <Text style={styles.cardDistance}>
                              {(s.distance / 1000).toFixed(2)}km
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.price}>
                          {s.price?.toLocaleString()}
                        </Text>
                        <Text style={styles.priceUnit}>원/L</Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </>
        )}

        <Text style={styles.sourceText}>
          가격 정보 출처: 한국석유공사 유가정보서비스 (오피넷)
        </Text>
      </ScrollView>

      <StationBottomSheet
        station={selected}
        product={product}
        isMin={!!selected && selected.price === minPrice}
        onClose={() => setSelected(null)}
        onKakao={openKakao}
        onNaver={openNaver}
      />
    </SafeAreaView>
  )
}

// ====== 바텀시트 ======

function StationBottomSheet({
  station,
  product,
  isMin,
  onClose,
  onKakao,
  onNaver,
}: {
  station: Station | null
  product: Product
  isMin: boolean
  onClose: () => void
  onKakao: (s: Station) => void
  onNaver: (s: Station) => void
}) {
  const open = !!station
  const bs = station ? brandStyle(station.poll) : null

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <View style={sheetStyles.grabberWrap}>
            <View style={sheetStyles.grabber} />
          </View>

          {station && bs && (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header — 브랜드 배지 + 이름 + 주소 + 닫기 */}
              <View style={sheetStyles.header}>
                <View style={sheetStyles.titleWrap}>
                  <View
                    style={[
                      sheetStyles.brandBadgeLg,
                      { backgroundColor: bs.bg },
                    ]}
                  >
                    <Text style={sheetStyles.brandBadgeText}>{bs.label}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <Text style={sheetStyles.title}>{station.osNm}</Text>
                      {isMin && (
                        <View style={sheetStyles.minBadge}>
                          <Ionicons name="trophy" size={10} color="#ffffff" />
                          <Text style={sheetStyles.minBadgeText}>최저가</Text>
                        </View>
                      )}
                    </View>
                    {!!station.newAddr && (
                      <Text style={sheetStyles.address}>{station.newAddr}</Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={sheetStyles.closeBtn}>
                  <Ionicons name="close" size={18} color={lightColors.ink900} />
                </Pressable>
              </View>

              {/* 가격 카드 — 큰 글씨 */}
              <View
                style={[
                  sheetStyles.priceCard,
                  isMin && {
                    backgroundColor: "#fef3c7",
                    borderColor: "rgba(245,158,11,0.4)",
                  },
                ]}
              >
                <Text
                  style={[
                    sheetStyles.priceLabelSm,
                    isMin && { color: "#92400e" },
                  ]}
                >
                  {PRODUCT_LABEL[product]}
                </Text>
                <Text
                  style={[
                    sheetStyles.priceBig,
                    isMin && { color: "#92400e" },
                  ]}
                >
                  {station.price.toLocaleString()}
                  <Text style={sheetStyles.priceUnitBig}> 원/L</Text>
                </Text>
              </View>

              {/* 정보 그리드 — 거리 / 브랜드 */}
              <View style={sheetStyles.grid}>
                <InfoTile
                  icon={
                    <Ionicons name="navigate-outline" size={16} color="#dc2626" />
                  }
                  label="거리"
                  value={
                    typeof station.distance === "number"
                      ? `${(station.distance / 1000).toFixed(2)}km`
                      : "—"
                  }
                />
                <InfoTile
                  icon={<Ionicons name="business-outline" size={16} color="#dc2626" />}
                  label="브랜드"
                  value={bs.label}
                />
              </View>

              {/* 길찾기 버튼 */}
              <View style={sheetStyles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    sheetStyles.btnKakao,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => onKakao(station)}
                >
                  <Ionicons name="navigate" size={16} color="#ffffff" />
                  <Text style={sheetStyles.btnText}>카카오맵 길찾기</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    sheetStyles.btnNaver,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => onNaver(station)}
                >
                  <Ionicons name="navigate" size={16} color="#ffffff" />
                  <Text style={sheetStyles.btnText}>네이버 지도</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <View style={sheetStyles.tile}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon}
        <Text style={sheetStyles.tileLabel}>{label}</Text>
      </View>
      <Text style={sheetStyles.tileValue}>{value}</Text>
    </View>
  )
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 12,
  },
  grabberWrap: { alignItems: "center", paddingVertical: 6 },
  grabber: {
    width: 40, height: 5, borderRadius: 999,
    backgroundColor: lightColors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  brandBadgeLg: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  title: { fontSize: 16, fontWeight: "700", color: lightColors.ink900 },
  minBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f59e0b",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  minBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  address: { fontSize: 11, color: lightColors.ink500, marginTop: 4 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  priceCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.2)",
    marginTop: 4,
  },
  priceLabelSm: {
    fontSize: 11,
    fontWeight: "700",
    color: "#991b1b",
  },
  priceBig: {
    fontSize: 26,
    fontWeight: "800",
    color: "#dc2626",
    marginTop: 4,
  },
  priceUnitBig: {
    fontSize: 13,
    fontWeight: "500",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: 6,
  },
  tileLabel: {
    fontSize: 11,
    color: lightColors.ink500,
    fontWeight: "600",
  },
  tileValue: {
    fontSize: 14,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  btnKakao: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  btnNaver: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#10b981",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: lightColors.ink900, textAlign: "center" },

  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12,
    backgroundColor: "#fef2f2", marginBottom: 16,
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: "#fee2e2",
    alignItems: "center", justifyContent: "center",
  },
  infoTitle: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  infoSub: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },

  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1, borderColor: lightColors.border,
    padding: 12,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 6,
  },
  productTabs: {
    flexDirection: "row",
    backgroundColor: "#eef0f3",
    borderRadius: 999, padding: 3,
  },
  productTab: {
    flex: 1, alignItems: "center",
    paddingVertical: 8, borderRadius: 999,
  },
  productTabActive: { backgroundColor: "#dc2626" },
  productTabText: { fontSize: 12, fontWeight: "500", color: lightColors.ink900 },

  locBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1, borderColor: lightColors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  locBannerTitle: { fontSize: 13, fontWeight: "700", color: lightColors.ink900 },
  locBannerSub: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
  locBannerBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#dc2626",
  },
  locBannerBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },

  cheapestEmpty: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1, borderColor: lightColors.border,
    overflow: "hidden",
  },
  cheapestEmptyHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  cheapestEmptyLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: lightColors.ink900 },
  cheapestEmptyCount: { fontSize: 12, color: lightColors.ink500 },
  cheapestEmptyBody: { paddingVertical: 40, alignItems: "center" },
  cheapestEmptyText: { fontSize: 13, color: lightColors.ink500 },

  sourceText: {
    fontSize: 11,
    color: lightColors.ink500,
    textAlign: "center",
    marginTop: 16,
  },

  center: { alignItems: "center", paddingVertical: 40, gap: 8 },
  muted: { fontSize: 12, color: lightColors.ink500 },

  errorCard: {
    flexDirection: "row", gap: 12,
    padding: 16, borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1, borderColor: "rgba(220,38,38,0.2)",
  },
  errorTitle: { fontSize: 14, fontWeight: "700", color: "#991b1b" },
  errorSub: { fontSize: 12, color: "#7f1d1d", marginTop: 4 },
  retryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#dc2626",
  },
  retryBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },

  noticeCard: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, borderRadius: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.3)",
    marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 11, color: "#92400e" },

  cheapestCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.4)",
  },
  trophy: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: "#f59e0b",
    alignItems: "center", justifyContent: "center",
  },
  cheapestLabel: { fontSize: 11, color: "#92400e", fontWeight: "700" },
  cheapestPrice: {
    fontSize: 22, fontWeight: "800", color: "#92400e",
    marginTop: 2,
  },
  cheapestUnit: { fontSize: 13, fontWeight: "500" },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1, borderColor: lightColors.border,
  },
  brandBadge: {
    minWidth: 44,
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  brandText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  stationName: { fontSize: 14, fontWeight: "700", color: lightColors.ink900 },
  stationAddr: { fontSize: 11, color: lightColors.ink500, marginTop: 2 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  cardDistance: { fontSize: 11, fontWeight: "600", color: lightColors.ink500 },
  price: { fontSize: 17, fontWeight: "800", color: "#dc2626" },
  priceUnit: { fontSize: 10, color: lightColors.ink500, marginTop: 2 },
})
