/**
 * MenuList — 마이페이지 메뉴 항목 (카톡/당근 톤).
 */

import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

interface Section {
  title?: string
  items: MenuItem[]
}

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>["name"]
  label: string
  value?: string
  badge?: string | number
  onPress: () => void
  destructive?: boolean
}

export function MenuList({ sections }: { sections: Section[] }) {
  return (
    <View>
      {sections.map((section, idx) => (
        <View key={idx} style={styles.section}>
          {section.title && (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          <View style={styles.list}>
            {section.items.map((item, i) => (
              <Item key={i} item={item} isLast={i === section.items.length - 1} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function Item({ item, isLast }: { item: MenuItem; isLast: boolean }) {
  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.item,
        !isLast && styles.itemBorder,
        pressed && styles.itemPressed,
      ]}
    >
      <Ionicons
        name={item.icon}
        size={20}
        color={item.destructive ? lightColors.destructive : lightColors.ink700}
      />
      <Text
        style={[styles.label, item.destructive && styles.labelDestructive]}
      >
        {item.label}
      </Text>
      <View style={styles.right}>
        {item.value && <Text style={styles.value}>{item.value}</Text>}
        {item.badge != null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {typeof item.badge === "number" && item.badge > 99
                ? "99+"
                : item.badge}
            </Text>
          </View>
        )}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={lightColors.ink500}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: lightColors.ink500,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: {
    backgroundColor: lightColors.background,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: lightColors.background,
    gap: spacing[3],
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  itemPressed: {
    backgroundColor: lightColors.muted,
  },
  label: {
    flex: 1,
    fontSize: fontSize.md,
    color: lightColors.ink900,
    fontWeight: "500",
  },
  labelDestructive: {
    color: lightColors.destructive,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  value: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
})
