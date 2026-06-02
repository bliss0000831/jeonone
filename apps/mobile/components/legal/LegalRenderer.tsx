/**
 * LegalRenderer — packages/features/legal 의 LegalDoc 을 RN UI 로 렌더.
 * 웹의 /(legal)/terms, /privacy 와 시각 일치 (섹션 / ol / ul / callout / kv).
 */

import { Linking, Pressable, StyleSheet, Text, View } from "react-native"
import type { LegalBlock, LegalDoc } from "@gwangjang/features/legal"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  doc: LegalDoc
}

export function LegalRenderer({ doc }: Props) {
  return (
    <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[5] }}>
      {doc.intro?.map((b, i) => (
        <View key={`intro-${i}`} style={{ marginBottom: spacing[3] }}>
          <Block block={b} />
        </View>
      ))}

      {doc.sections.map((sec, i) => (
        <View key={`sec-${i}`} style={styles.section}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {sec.blocks.map((b, j) => (
            <View key={`b-${j}`} style={{ marginTop: j === 0 ? 0 : spacing[2] }}>
              <Block block={b} />
            </View>
          ))}
        </View>
      ))}

      {doc.footer && (
        <View style={styles.footer}>
          {doc.footer.lines.map((l, i) => (
            <Text key={i} style={styles.footerLine}>
              · {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <Text style={styles.body}>{block.text}</Text>

    case "ul":
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{it}</Text>
            </View>
          ))}
        </View>
      )

    case "ol":
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((it, i) => {
            const num = i + 1
            if (typeof it === "string") {
              return (
                <View key={i} style={styles.listRow}>
                  <Text style={styles.numBullet}>{num}.</Text>
                  <Text style={styles.listText}>{it}</Text>
                </View>
              )
            }
            return (
              <View key={i} style={{ gap: 4 }}>
                <View style={styles.listRow}>
                  <Text style={styles.numBullet}>{num}.</Text>
                  <Text style={styles.listText}>{it.text}</Text>
                </View>
                <View style={{ paddingLeft: 24, gap: 4 }}>
                  {it.sub.map((s, j) => (
                    <View key={j} style={styles.listRow}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.listText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
        </View>
      )

    case "callout": {
      const tone =
        block.tone === "amber"
          ? styles.calloutAmber
          : block.tone === "primary"
          ? styles.calloutPrimary
          : styles.calloutNeutral
      const text =
        block.tone === "amber"
          ? styles.calloutAmberText
          : block.tone === "primary"
          ? styles.calloutPrimaryText
          : styles.calloutNeutralText
      return (
        <View style={[styles.callout, tone]}>
          <Text style={[styles.body, text]}>{block.text}</Text>
        </View>
      )
    }

    case "kv":
      return (
        <View style={styles.kvCard}>
          {block.rows.map((r, i) => (
            <View key={i} style={styles.kvRow}>
              <Text style={styles.kvKey}>· {r.k}</Text>
              <Text style={styles.kvValue}>{r.v}</Text>
            </View>
          ))}
        </View>
      )
  }
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing[5] },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: lightColors.ink700,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  bullet: {
    fontSize: 13,
    color: lightColors.ink500,
    lineHeight: 20,
    width: 12,
    textAlign: "center",
  },
  numBullet: {
    fontSize: 13,
    color: lightColors.ink500,
    lineHeight: 20,
    width: 18,
  },
  listText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: lightColors.ink700,
  },
  callout: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  calloutAmber: {
    borderColor: "rgba(245,158,11,0.4)",
    backgroundColor: "rgba(245,158,11,0.05)",
  },
  calloutAmberText: { color: "#b45309" },
  calloutPrimary: {
    borderColor: "rgba(59,130,246,0.3)",
    backgroundColor: "rgba(59,130,246,0.05)",
  },
  calloutPrimaryText: { color: lightColors.ink900, fontWeight: "600" },
  calloutNeutral: {
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  calloutNeutralText: { color: lightColors.ink700, fontSize: 12 },
  kvCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    padding: spacing[3],
    gap: 4,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  kvKey: {
    fontSize: 13,
    color: lightColors.ink900,
    flexShrink: 0,
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    color: lightColors.ink500,
  },
  footer: {
    marginTop: spacing[6],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
    gap: 4,
  },
  footerLine: {
    fontSize: 11,
    color: lightColors.ink500,
  },
})
