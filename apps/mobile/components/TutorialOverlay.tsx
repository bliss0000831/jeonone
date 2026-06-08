/**
 * TutorialOverlay — 첫 진입 튜토리얼 (3컷 안내).
 *
 * 어르신 친화: 큰 글씨 · 큰 그림(이모지) · 큰 버튼.
 *   ① 사진 찍어 올려서 팔아요 (등록)
 *   ② 궁금하면 채팅이나 전화로 물어봐요 (문의)
 *   ③ 우리 동네 농기구·로컬푸드·일손을 한곳에서 (둘러보기)
 *
 * 노출 정책:
 *   - 최초 1회만. AsyncStorage 플래그(TUTORIAL_DONE_KEY) 로 본 적 있으면 스킵.
 *   - 허브(hub.tsx) 첫 진입 시 전체화면 오버레이로 표시 → 지역 선택보다 먼저.
 *   - 라우팅에는 개입하지 않음 (순수 오버레이 컴포넌트).
 *
 * 기존 흐름 영향 없음:
 *   - 이 컴포넌트는 신규 추가이며, 플래그가 이미 true 이면 즉시 null 반환(아무것도 안 그림).
 */

import { useCallback, useEffect, useState } from "react"
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import AsyncStorage from "@react-native-async-storage/async-storage"

const GREEN = "#225a39"
const GREEN_DARK = "#1b4a2f"
const CREAM = "#f7f6f0"

export const TUTORIAL_DONE_KEY = "onboarding.tutorial.done"

const LOGO = require("../assets/images/logo-farmer.png")

interface Slide {
  emoji: string
  title: string
  desc: string
}

const SLIDES: Slide[] = [
  {
    emoji: "📷",
    title: "사진 찍어 올려서 팔아요",
    desc: "농기구·농산물을 사진 찍어\n바로 올릴 수 있어요.",
  },
  {
    emoji: "💬",
    title: "궁금하면 채팅·전화로 물어봐요",
    desc: "마음에 들면 채팅이나 전화로\n편하게 여쭤보세요.",
  },
  {
    emoji: "🌾",
    title: "우리 동네 한곳에서",
    desc: "농기구·로컬푸드·일손을\n우리 동네에서 한번에 봐요.",
  },
]

/**
 * 튜토리얼을 다시 보지 않도록 플래그 저장. (실패해도 무시)
 */
async function markTutorialDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_DONE_KEY, "1")
  } catch {}
}

/**
 * 첫 진입 튜토리얼 오버레이.
 * 마운트 시 AsyncStorage 플래그를 읽어 본 적 없을 때만 표시한다.
 */
export function TutorialOverlay() {
  // null = 아직 판단 전, false = 안 보임, true = 보임
  const [visible, setVisible] = useState<boolean | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const done = await AsyncStorage.getItem(TUTORIAL_DONE_KEY)
        if (mounted) setVisible(!done)
      } catch {
        // 읽기 실패 시 — 한 번 보여주고 done 처리하면 다음부턴 안 뜸
        if (mounted) setVisible(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    void markTutorialDone()
  }, [])

  const onNext = useCallback(() => {
    setIndex((i) => {
      if (i >= SLIDES.length - 1) {
        close()
        return i
      }
      return i + 1
    })
  }, [close])

  if (visible !== true) return null

  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={close}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* 건너뛰기 */}
        <View style={styles.topBar}>
          <Pressable
            style={styles.skipBtn}
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="건너뛰기"
          >
            <Text style={styles.skipText}>건너뛰기</Text>
          </Pressable>
        </View>

        {/* 본문 — 큰 그림 + 큰 글씨 */}
        <View style={styles.center}>
          <View style={styles.illustWrap}>
            <Text style={styles.emoji} accessibilityElementsHidden>
              {slide.emoji}
            </Text>
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.desc}>{slide.desc}</Text>
        </View>

        {/* 진행 점 */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index ? styles.dotActive : null]}
            />
          ))}
        </View>

        {/* 하단 큰 버튼 */}
        <View style={styles.bottom}>
          <Pressable
            style={styles.nextBtn}
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "시작하기" : "다음"}
          >
            <Text style={styles.nextText}>{isLast ? "시작하기" : "다음"}</Text>
          </Pressable>
          <View style={styles.brandRow}>
            <Image source={LOGO} style={styles.brandLogo} contentFit="cover" />
            <Text style={styles.brandText}>전원일기</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const { width } = Dimensions.get("window")
const CIRCLE = Math.min(width * 0.55, 240)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingTop: 8 },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  skipText: { fontSize: 18, fontWeight: "700", color: "#78716c" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  illustWrap: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: "rgba(34,90,57,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
    borderWidth: 3,
    borderColor: "rgba(34,90,57,0.18)",
  },
  emoji: { fontSize: CIRCLE * 0.46, textAlign: "center" },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: GREEN,
    textAlign: "center",
    lineHeight: 40,
    includeFontPadding: false,
  },
  desc: {
    fontSize: 20,
    fontWeight: "600",
    color: "#57534e",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 30,
  },

  dots: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 20 },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "rgba(34,90,57,0.22)" },
  dotActive: { backgroundColor: GREEN, width: 28 },

  bottom: { paddingHorizontal: 24, paddingBottom: 12 },
  nextBtn: {
    backgroundColor: GREEN,
    borderRadius: 20,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nextText: { color: "#fff", fontSize: 24, fontWeight: "900" },

  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18 },
  brandLogo: { width: 28, height: 28, borderRadius: 14 },
  brandText: { fontSize: 16, fontWeight: "800", color: GREEN_DARK },
})
