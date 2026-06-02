/**
 * ScrollFadeHint — 가로 스크롤 캐러셀의 끝에 표시하는 fade + chevron 힌트.
 *
 * 사용:
 *   <View style={{ position: 'relative' }}>
 *     <ScrollView horizontal onScroll={...} onContentSizeChange={...} ...>...</ScrollView>
 *     <ScrollFadeHint atEnd={atEnd} side="right" onPress={() => ...scrollBy} />
 *   </View>
 *
 * 동작:
 *   - atEnd=true 면 자동으로 페이드 아웃 + 터치 비활성화
 *   - 그라디언트 자체는 pointerEvents none 이라 카드 클릭 막지 않음
 *   - 화살표 원만 Pressable — 누르면 onPress 호출 (다음 페이지로 스크롤)
 */

import { useEffect, useRef } from "react"
import { Animated, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"

interface Props {
  atEnd: boolean
  side?: "right" | "left"
  /** 페이드 너비 (default 40) */
  width?: number
  /** 부모의 padding 보정 (예: 8 — 그라디언트가 카드 너머로 살짝 안 보이게) */
  inset?: number
  /** 표시할 색 base (default 흰색 #fff). 카드 영역이 다른 배경이면 매칭. */
  bg?: string
  /** 화살표 원 탭 시 호출 — 보통 ref.scrollTo 로 다음 페이지로 이동 */
  onPress?: () => void
}

export function ScrollFadeHint({
  atEnd,
  side = "right",
  width = 40,
  inset = 0,
  bg = "#ffffff",
  onPress,
}: Props) {
  const opacity = useRef(new Animated.Value(atEnd ? 0 : 1)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: atEnd ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [atEnd, opacity])

  const colors =
    side === "right"
      ? ["rgba(255,255,255,0)", bg]
      : [bg, "rgba(255,255,255,0)"]
  const start = { x: 0, y: 0.5 }
  const end = { x: 1, y: 0.5 }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        side === "right" ? { right: inset } : { left: inset },
        { width, opacity },
      ]}
    >
      {/* 그라디언트는 시각용 — 카드 터치 막지 않게 pointerEvents none */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={colors as any}
          start={start as any}
          end={end as any}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {/* 화살표 원 — 탭 가능. 버튼은 작아도 hitSlop 으로 위아래 크게 확보. */}
      <Pressable
        onPress={onPress}
        disabled={atEnd || !onPress}
        hitSlop={{ top: 36, bottom: 36, left: 12, right: 12 }}
        style={({ pressed }) => [
          styles.iconWrap,
          side === "right" ? { right: 4 } : { left: 4 },
          pressed && { transform: [{ scale: 0.9 }] },
        ]}
      >
        <Ionicons
          name={side === "right" ? "chevron-forward" : "chevron-back"}
          size={22}
          color="#ffffff"
        />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 5,
  },
  iconWrap: {
    position: "absolute",
    top: "50%",
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
})
