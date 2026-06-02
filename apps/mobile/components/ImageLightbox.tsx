/**
 * ImageLightbox — 풀스크린 이미지 뷰어 (탭하여 열기)
 *
 * 상세 화면 이미지 갤러리에서 이미지를 탭하면 전체화면으로 확대.
 * 좌우 스와이프로 이미지 전환, 우상단 X 또는 배경 탭으로 닫기.
 */
import { useEffect, useRef, useState } from "react"
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { SafeAreaView } from "react-native-safe-area-context"

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window")

interface ImageLightboxProps {
  visible: boolean
  images: string[]
  initialIndex?: number
  onClose: () => void
}

export function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const scrollRef = useRef<ScrollView>(null)

  // 영구 마운트된 컴포넌트이므로 열릴 때마다 initialIndex 로 위치/카운터 재동기화.
  // (contentOffset 은 최초 마운트에만 적용되어, 재오픈 시 직전 위치가 남는 문제 방지)
  useEffect(() => {
    if (!visible) return
    setIndex(initialIndex)
    // 모달 페이드인 후 레이아웃이 잡힌 다음 스크롤 위치 적용
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_W, animated: false })
    }, 0)
    return () => clearTimeout(id)
  }, [visible, initialIndex])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="닫기"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
          onMomentumScrollEnd={(e) => {
            setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
          }}
        >
          {images.map((uri, i) => (
            <Pressable key={i} style={styles.imageWrap} onPress={onClose}>
              <Image
                source={uri}
                style={styles.image}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </Pressable>
          ))}
        </ScrollView>

        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  imageWrap: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  counter: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
})
