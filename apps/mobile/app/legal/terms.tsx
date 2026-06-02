/**
 * 이용약관 — 광장 web /terms 와 동일 콘텐츠 (shared TERMS_DOC).
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { TERMS_DOC, applyBusinessInfo } from "@gwangjang/features/legal"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { LegalRenderer } from "@/components/legal/LegalRenderer"
import { usePlazaBusinessInfo } from "@/lib/plaza-business-info"

export default function TermsScreen() {
  const router = useRouter()
  const business = usePlazaBusinessInfo()
  const doc = applyBusinessInfo(TERMS_DOC, business)
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>이용약관</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LegalRenderer doc={doc} />
      </ScrollView>
    </SafeAreaView>
  )
}

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
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
})
