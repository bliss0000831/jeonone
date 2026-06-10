/**
 * 도메인 공통 탭 바 — 각 도메인 리스트 페이지 헤더 아래에 표시.
 * 가로 스크롤, 현재 도메인 하이라이트, 탭 누르면 router.replace 로 즉시 전환.
 *
 * 마운트 시 활성 탭이 중앙에 오도록 자동 스크롤.
 *
 * "홈즈" 드롭다운 탭: 인테리어·이사·청소·수리를 하나의 탭으로 묶고,
 * 누르면 탭 바 바로 아래에 서브 탭이 인라인으로 펼쳐지는 구조.
 * - 홈즈 하위 선택 시 탭 라벨이 선택된 서비스명으로 바뀜 (예: "인테리어")
 * - 다른 탭으로 이동하면 다시 "홈즈" 로 표시
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors } from "@gwangjang/tokens"

// Android LayoutAnimation 활성화
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface DomainTab {
  key: string
  label: string
  path: string
}

/** 홈즈 하위 서비스 탭 */
const HOMES_CHILDREN: DomainTab[] = [
  { key: "interior", label: "인테리어", path: "/interior" },
  { key: "moving",   label: "이사",     path: "/moving" },
  { key: "cleaning", label: "청소",     path: "/cleaning" },
  { key: "repair",   label: "수리",     path: "/repair" },
]
const HOMES_KEYS = new Set(HOMES_CHILDREN.map((t) => t.key))

/** 표시 순서 — 웹 상단 내비와 동일 (마켓 → 커뮤니티). 경매장·대여 포함. */
const DOMAIN_TABS: DomainTab[] = [
  { key: "secondhand", label: "농기구/자재", path: "/secondhand" },
  { key: "rental",     label: "대여",        path: "/rental" },
  { key: "local-food", label: "로컬푸드",    path: "/local-food" },
  { key: "auction",    label: "경매장",      path: "/auction" },
  { key: "jobs",       label: "일손 찾기",   path: "/jobs" },
  { key: "board",      label: "소식통",      path: "/board" },
]

// 탭 전환 시 스크롤 위치 유지 — 리마운트돼도 이전 위치 복원
// ⚠️ 의도적으로 module scope: DomainTabBar 는 탭 전환마다 리마운트되므로,
// 스크롤 위치를 컴포넌트 바깥에 저장해야 탭 전환 후에도 복원 가능.
let _savedScrollX = 0
let _hasScrolled = false

interface DomainTabBarProps {
  /** 현재 도메인 key (e.g. "property", "interior") */
  current: string
}

export function DomainTabBar({ current }: DomainTabBarProps) {
  const router = useRouter()
  const { width: screenWidth } = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const layoutMap = useRef<Record<string, { x: number; w: number }>>({})
  const [scrollDone, setScrollDone] = useState(false)
  const [showRightHint, setShowRightHint] = useState(true)
  const contentWidth = useRef(0)

  // 마운트 시 이전 스크롤 위치 임시 복원 (깜빡임 방지)
  // scrollDone 은 설정하지 않음 — handleTabLayout 에서 활성 탭 가시성 체크 후 최종 결정
  useEffect(() => {
    if (_hasScrolled && scrollRef.current) {
      scrollRef.current.scrollTo({ x: _savedScrollX, animated: false })
    }
  }, [])

  // 홈즈 서브 탭 펼침 여부
  const [homesExpanded, setHomesExpanded] = useState(false)

  // 현재 탭이 홈즈 하위인지
  const isHomesActive = HOMES_KEYS.has(current)

  // 홈즈 탭 라벨: 하위 서비스 선택 시 → 해당 서비스명, 아니면 "홈즈"
  const homesLabel = isHomesActive
    ? HOMES_CHILDREN.find((c) => c.key === current)?.label ?? "홈즈"
    : "홈즈"

  // 다른 탭(홈즈 밖)으로 이동 시 접기
  useEffect(() => {
    if (!isHomesActive) {
      setHomesExpanded(false)
    }
  }, [isHomesActive])

  const toggleHomesExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setHomesExpanded((prev) => !prev)
  }

  // 탭별 onLayout — 활성 탭이 완전히 보이면 스크롤 유지, 잘리면 보일 만큼만 최소 스크롤
  const handleTabLayout = useCallback(
    (key: string, e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout
      layoutMap.current[key] = { x, w: width }

      const effectiveKey = HOMES_KEYS.has(current) ? "__homes__" : current
      if (key === effectiveKey && !scrollDone && scrollRef.current) {
        const PAD = 48 // 탭 양쪽 여유 패딩 (우측 그라데이션 힌트 영역 감안)
        const tabLeft = x - PAD
        const tabRight = x + width + PAD
        const viewLeft = _savedScrollX
        const viewRight = _savedScrollX + screenWidth

        if (_hasScrolled && tabLeft >= viewLeft && tabRight <= viewRight) {
          // 활성 탭이 완전히 보임 → 스크롤 유지
          scrollRef.current.scrollTo({ x: _savedScrollX, animated: false })
        } else {
          // 활성 탭이 잘리거나 안 보임 → 보일 만큼만 최소 이동
          let target = _savedScrollX
          if (tabRight > viewRight) {
            // 오른쪽으로 잘림 → 오른쪽 끝에 맞춤
            target = tabRight - screenWidth
          } else if (tabLeft < viewLeft) {
            // 왼쪽으로 잘림 → 왼쪽 끝에 맞춤
            target = tabLeft
          }
          target = Math.max(0, target)
          scrollRef.current.scrollTo({ x: target, animated: false })
          _savedScrollX = target
        }
        _hasScrolled = true
        setScrollDone(true)
      }
    },
    [current, scrollDone, screenWidth],
  )

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
      contentWidth.current = contentSize.width
      // 스크롤 위치 저장 — 탭 전환 시 복원용
      _savedScrollX = contentOffset.x
      _hasScrolled = true
      const atEnd =
        contentOffset.x + layoutMeasurement.width >= contentSize.width - 20
      setShowRightHint(!atEnd)
      // 메인 탭 스크롤 시 서브탭 닫기
      if (homesExpanded) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        setHomesExpanded(false)
      }
    },
    [homesExpanded],
  )

  return (
    <View style={styles.outerWrap}>
      {/* ── 메인 탭 바 ── */}
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {DOMAIN_TABS.map((tab) => {
            // ── 홈즈 탭 ──
            if (tab.key === "__homes__") {
              return (
                <Pressable
                  key="__homes__"
                  onLayout={(e) => handleTabLayout("__homes__", e)}
                  onPress={toggleHomesExpanded}
                  style={[styles.tab, isHomesActive && styles.tabActive]}
                >
                  <View style={styles.homesTabInner}>
                    <Text
                      style={[
                        styles.tabText,
                        isHomesActive && styles.tabTextActive,
                      ]}
                    >
                      {homesLabel}
                    </Text>
                    <Ionicons
                      name={homesExpanded ? "chevron-up" : "chevron-down"}
                      size={11}
                      color={isHomesActive ? lightColors.ink900 : "#9ca3af"}
                      style={{ marginLeft: 3, marginTop: 1 }}
                    />
                  </View>
                </Pressable>
              )
            }

            // ── 일반 탭 ──
            const active = tab.key === current
            return (
              <Pressable
                key={tab.key}
                onLayout={(e) => handleTabLayout(tab.key, e)}
                onPress={() => {
                  if (!active) {
                    router.replace((tab as DomainTab).path as any)
                  }
                }}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* 우측 스크롤 힌트 */}
        {showRightHint && (
          <View style={styles.hintWrap} pointerEvents="none">
            <LinearGradient
              colors={[
                "rgba(255,255,255,0)",
                "rgba(255,255,255,0.95)",
                "#ffffff",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.hintGradient}
            />
            <View style={styles.hintArrow}>
              <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
            </View>
          </View>
        )}
      </View>

      {/* ── 홈즈 서브 탭 (인라인 펼침) ── */}
      {homesExpanded && (
        <View style={styles.subTabBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subTabContent}
          >
            {HOMES_CHILDREN.map((child) => {
              const childActive = child.key === current
              return (
                <Pressable
                  key={child.key}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                    setHomesExpanded(false)
                    if (!childActive) {
                      router.replace(child.path as any)
                    }
                  }}
                  style={[
                    styles.subTab,
                    childActive && styles.subTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      childActive && styles.subTabTextActive,
                    ]}
                  >
                    {child.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  outerWrap: {
    backgroundColor: "#ffffff",
  },
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    position: "relative",
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: lightColors.ink900,
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: "400",
    color: "#9ca3af",
  },
  tabTextActive: {
    color: lightColors.ink900,
    fontWeight: "700",
  },

  // 홈즈 탭 내부 (텍스트 + 화살표)
  homesTabInner: {
    flexDirection: "row",
    alignItems: "center",
  },

  // ── 홈즈 서브 탭 바 ──
  subTabBar: {
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  subTabContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  subTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  subTabActive: {
    backgroundColor: lightColors.ink900,
    borderColor: lightColors.ink900,
  },
  subTabText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#6b7280",
  },
  subTabTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },

  // 우측 스크롤 힌트
  hintWrap: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  hintGradient: {
    width: 32,
    height: "100%",
  },
  hintArrow: {
    backgroundColor: "#ffffff",
    paddingRight: 6,
    paddingLeft: 2,
    height: "100%",
    justifyContent: "center",
  },
})
