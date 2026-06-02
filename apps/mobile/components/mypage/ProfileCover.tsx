/**
 * ProfileCover — 광장 web 의 components/profile/profile-cover.tsx 1:1 미러.
 *
 * 웹: h-32 sm:h-40 md:h-48 = 128/160/192px (모바일 기준 128).
 *     이미지 없으면 role.coverGradient (좌상→우하).
 *     하단 페이드 = 상단으로 갈수록 옅어지는 검정 그라디언트.
 *     편집 가능 시 우상단 검정 반투명 카메라 버튼.
 */

import { Image, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import type { RoleConfig } from "./role-config"

interface Props {
  coverUrl: string | null | undefined
  role: RoleConfig
  editable?: boolean
  onPressEdit?: () => void
}

export function ProfileCover({ coverUrl, role, editable, onPressEdit }: Props) {
  return (
    <View style={styles.wrap}>
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.image} />
      ) : (
        <LinearGradient
          colors={role.coverColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* 하단 페이드 — h-16 (64px), from-black/15 via-black/5 to-transparent */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.15)"]}
        style={styles.fade}
      />
      {/* 카메라 버튼 — 우상단 */}
      {editable && (
        <Pressable
          onPress={onPressEdit}
          style={({ pressed }) => [styles.cameraBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Ionicons name="camera" size={16} color="#ffffff" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: 128, // h-32 (모바일)
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64, // h-16
  },
  cameraBtn: {
    position: "absolute",
    top: 12, // top-3
    right: 12, // right-3
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    // shadow-md
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
})
