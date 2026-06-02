/**
 * EventsCalendar — 관광 달력 (web city-events-calendar 1:1).
 * Extracted from apps/mobile/app/(tabs)/index.tsx.
 */
import { memo, useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import type { ChuncheonEvent } from "@gwangjang/features/home"

const CATEGORY_COLOR_MAP: Record<string, string> = {
  축제: "#f59e0b",     // amber-500
  행사: "#3b82f6",     // blue-500
  문화: "#a855f7",     // purple-500
  스포츠: "#ef4444",   // red-500
  전시: "#06b6d4",     // cyan-500
  일반: "#10b981",     // emerald-500
}

export const EventsCalendar = memo(function EventsCalendar({ events }: { events: ChuncheonEvent[] }) {
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const year = cursor.getFullYear()
  const month = cursor.getMonth() // 0-based
  const firstDay = new Date(year, month, 1)
  const startWeekday = firstDay.getDay() // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 일자별 이벤트 인덱스
  const eventsByDay = useMemo(() => {
    const map: Record<number, ChuncheonEvent[]> = {}
    events.forEach((e) => {
      const d = new Date(e.event_date)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(e)
      }
    })
    return map
  }, [events, year, month])

  // 이달의 주요 행사 (날짜순)
  const monthEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const d = new Date(e.event_date)
          return d.getFullYear() === year && d.getMonth() === month
        })
        .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()),
    [events, year, month],
  )

  // 사용된 카테고리만 범례에 표시
  const usedCategories = useMemo(() => {
    const set = new Set<string>()
    monthEvents.forEach((e) => set.add(e.category))
    return Array.from(set)
  }, [monthEvents])

  // 그리드 셀 (7 col x N row) — 빈칸은 null
  const cells: Array<number | null> = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: Array<typeof cells> = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month

  return (
    <View style={{ gap: 14 }}>
      {/* 월 네비게이션 */}
      <View style={calStyles.monthNav}>
        <Pressable
          onPress={() => setCursor(new Date(year, month - 1, 1))}
          hitSlop={10}
          style={calStyles.navBtn}
        >
          <Ionicons name="chevron-back" size={18} color={lightColors.ink900} />
        </Pressable>
        <Text style={calStyles.monthLabel}>
          {year}년 {month + 1}월
        </Text>
        <Pressable
          onPress={() => setCursor(new Date(year, month + 1, 1))}
          hitSlop={10}
          style={calStyles.navBtn}
        >
          <Ionicons name="chevron-forward" size={18} color={lightColors.ink900} />
        </Pressable>
      </View>

      {/* 달력 박스 — 외곽 테두리 */}
      <View style={calStyles.calendarBox}>
        {/* 요일 헤더 */}
        <View style={calStyles.weekHeader}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <Text
              key={d}
              style={[
                calStyles.weekHeaderText,
                i === 0 && { color: "#ef4444" },
                i === 6 && { color: "#3b82f6" },
              ]}
            >
              {d}
            </Text>
          ))}
        </View>

        {/* 날짜 그리드 */}
        <View>
        {rows.map((row, ri) => (
          <View key={ri} style={calStyles.dayRow}>
            {row.map((d, ci) => {
              if (d == null) return <View key={ci} style={calStyles.dayCell} />
              const isToday =
                isCurrentMonth && d === today.getDate()
              const dayEvents = eventsByDay[d] ?? []
              const dotColors = dayEvents.slice(0, 3).map(
                (e) => CATEGORY_COLOR_MAP[e.category] || e.color || "#94a3b8",
              )
              const isSun = ci === 0
              const isSat = ci === 6
              return (
                <View key={ci} style={calStyles.dayCell}>
                  <View
                    style={[
                      calStyles.dayInner,
                      isToday && calStyles.dayToday,
                    ]}
                  >
                    <Text
                      style={[
                        calStyles.dayText,
                        isSun && { color: "#ef4444" },
                        isSat && { color: "#3b82f6" },
                        isToday && { color: "#ffffff", fontWeight: "800" },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                  <View style={calStyles.dotRow}>
                    {dotColors.map((c, di) => (
                      <View
                        key={di}
                        style={[calStyles.dayDot, { backgroundColor: c }]}
                      />
                    ))}
                  </View>
                </View>
              )
            })}
          </View>
        ))}
        </View>
      </View>

      {/* 이달의 주요 행사 */}
      {monthEvents.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={calStyles.sectionTitle}>이달의 주요 행사</Text>
          {monthEvents.slice(0, 5).map((ev) => {
            const d = new Date(ev.event_date)
            const color = CATEGORY_COLOR_MAP[ev.category] || ev.color || "#94a3b8"
            return (
              <View key={ev.id} style={calStyles.eventRow}>
                <View style={[calStyles.eventDot, { backgroundColor: color }]} />
                <Text style={calStyles.eventDate}>
                  {String(d.getDate()).padStart(2, "0")}일
                </Text>
                <Text style={calStyles.eventTitle} numberOfLines={1}>
                  {ev.title}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {/* 카테고리 범례 */}
      {usedCategories.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={calStyles.sectionTitle}>카테고리</Text>
          <View style={calStyles.legendRow}>
            {usedCategories.map((cat) => (
              <View key={cat} style={calStyles.legendItem}>
                <View
                  style={[
                    calStyles.legendDot,
                    {
                      backgroundColor: CATEGORY_COLOR_MAP[cat] || "#94a3b8",
                    },
                  ]}
                />
                <Text style={calStyles.legendText}>{cat}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {monthEvents.length === 0 && (
        <Text style={calStyles.emptyText}>이달의 행사가 없습니다</Text>
      )}
    </View>
  )
})

export const calStyles = StyleSheet.create({
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 32, height: 32,
    alignItems: "center", justifyContent: "center",
    borderRadius: 999,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
    letterSpacing: -0.3,
  },
  calendarBox: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eef0f3",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  weekHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    marginBottom: 2,
  },
  weekHeaderText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: lightColors.ink500,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  dayRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  dayInner: {
    width: 32, height: 32,
    borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  dayToday: {
    backgroundColor: "#3b82f6",
    shadowColor: "#3b82f6",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dayText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 4,
    minHeight: 5,
  },
  dayDot: {
    width: 4, height: 4, borderRadius: 999,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  eventDot: {
    width: 8, height: 8, borderRadius: 999,
  },
  eventDate: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink500,
    width: 32,
  },
  eventTitle: {
    flex: 1,
    fontSize: 13,
    color: lightColors.ink900,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8, height: 8, borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    color: lightColors.ink700,
  },
  emptyText: {
    fontSize: 13, color: lightColors.ink500,
    textAlign: "center", paddingVertical: 24,
  },
})
