/**
 * ProfileTabs — 광장 web 의 components/profile/profile-tabs.tsx 1:1 미러.
 *
 * 웹: flex-1 sm:flex-none, py-3, gap-1.5, icon w-4 h-4, border-b-2 active.
 * 모바일에서 탭이 화면 너비를 균등 분할 (flex-1).
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize } from "@gwangjang/tokens"
import type { ProfileTabDef, ProfileTabId } from "./role-config"

interface Props {
  tabs: ProfileTabDef[]
  active: ProfileTabId
  counts?: Partial<Record<ProfileTabId, number>>
  onChange: (id: ProfileTabId) => void
}

export function ProfileTabs({ tabs, active, counts, onChange }: Props) {
  // 웹: 모바일에선 flex-1 균등 분할. 탭이 4개 이하면 ScrollView 없이 flex 분할.
  const useEvenFlex = tabs.length <= 5

  const content = tabs.map((tab) => {
    const isActive = tab.id === active
    const count = counts?.[tab.id]
    const showCount = typeof count === "number" && count > 0
    return (
      <Pressable
        key={tab.id}
        onPress={() => onChange(tab.id)}
        style={[
          styles.tab,
          useEvenFlex && { flex: 1 },
          isActive && styles.tabActive,
        ]}
      >
        <Ionicons
          name={tab.icon as any}
          size={16} // w-4 h-4
          color={isActive ? lightColors.ink900 : lightColors.ink500}
        />
        <Text style={[styles.label, isActive && styles.labelActive]}>
          {tab.label}
        </Text>
        {showCount && (
          <Text style={[styles.count, isActive && styles.countActive]}>
            {count}
          </Text>
        )}
      </Pressable>
    )
  })

  return (
    <View style={styles.wrap}>
      {useEvenFlex ? (
        <View style={styles.row}>{content}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {content}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: lightColors.background,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  row: {
    flexDirection: "row",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6, // gap-1.5
    paddingHorizontal: 12, // px-3
    paddingVertical: 12, // py-3
    borderBottomWidth: 2, // border-b-2
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: lightColors.primary,
  },
  label: {
    fontSize: 14, // text-sm
    fontWeight: "500",
    color: lightColors.ink500,
  },
  labelActive: {
    color: lightColors.ink900,
  },
  count: {
    fontSize: 12, // text-xs
    color: lightColors.ink500,
    marginLeft: 0,
  },
  countActive: {
    color: lightColors.primary,
  },
})
