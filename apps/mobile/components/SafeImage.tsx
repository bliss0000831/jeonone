/**
 * SafeImage — expo-image 의 Image 를 감싸며, 로드 실패 시 fallback placeholder 표시.
 *
 * Usage:
 *   <SafeImage source={{ uri: url }} style={styles.thumb} fallbackIcon="image-outline" />
 */

import { useState, useCallback } from "react"
import { View, type StyleProp, type ViewStyle } from "react-native"
import { Image, type ImageProps } from "expo-image"
import { Ionicons } from "@expo/vector-icons"

interface SafeImageProps extends Omit<ImageProps, "onError" | "style"> {
  /** 실패 시 표시할 Ionicons 아이콘 이름 (기본 image-outline) */
  fallbackIcon?: keyof typeof Ionicons.glyphMap
  /** fallback 아이콘 크기 (기본 28) */
  fallbackSize?: number
  /** fallback 아이콘 색상 */
  fallbackColor?: string
  /** fallback 컨테이너 배경 */
  fallbackBg?: string
  /** 스타일 — Image 와 fallback View 모두 적용 */
  style?: StyleProp<ViewStyle>
}

export function SafeImage({
  fallbackIcon = "image-outline",
  fallbackSize = 28,
  fallbackColor = "rgba(100,116,139,0.4)",
  fallbackBg = "#f1f5f9",
  style,
  ...imageProps
}: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  const handleError = useCallback(() => {
    setFailed(true)
  }, [])

  if (failed) {
    return (
      <View
        style={[
          style,
          { alignItems: "center", justifyContent: "center", backgroundColor: fallbackBg },
        ]}
      >
        <Ionicons name={fallbackIcon} size={fallbackSize} color={fallbackColor} />
      </View>
    )
  }

  return (
    <Image
      {...imageProps}
      style={style as any}
      onError={handleError}
    />
  )
}
