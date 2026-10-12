import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/text';
import type { SalesDay } from '../../features/dashboard/queries';
import { displayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

// The plot's height. A size, as a thumbnail's is: it holds bars, never text
// (.claude/instruction_mds/frontend.md §4.5, rule 17).
const PLOT = 120;
// A day without a sale still draws this much, so the days stay countable.
const FOOT = 2;
// Up to this many bars each carry their day; past it only the first, the middle and the last do — a month's
// bars are narrower than a two-digit label.
const EVERY_DAY = 7;

/**
 * The sales-per-day chart (POS-System-Added-Features.md 22.2): one bar a day, its height the day's share of
 * the best day's sales. Drawn with Views — no chart library for one bar chart. Each bar says its day and
 * amount to a screen reader; a day whose returns outweigh its sales draws as a day without one.
 */
export function SalesChart({ days, money }: { days: SalesDay[]; money: (value: number) => string }) {
  const { colors } = useAppTheme();
  const peak = Math.max(0, ...days.map((day) => day.sales));
  const best = days.find((day) => peak > 0 && day.sales === peak);
  const marks = days.length <= EVERY_DAY ? days : [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]];

  return (
    <View style={styles.chart}>
      <View style={styles.plot}>
        {days.map((day) => (
          <View key={day.day} accessible accessibilityLabel={`${displayDate(day.day)}: ${money(day.sales)}`} style={styles.column}>
            <View
              style={{
                height: day.sales > 0 ? Math.max(FOOT, (day.sales / peak) * PLOT) : FOOT,
                backgroundColor: day.sales > 0 ? colors.primary : colors.outlineVariant,
              }}
            />
          </View>
        ))}
      </View>
      <View style={[styles.labels, days.length <= EVERY_DAY ? null : styles.spread]}>
        {marks.map((day) => (
          <Text key={day.day} variant="bodySmall" style={[days.length <= EVERY_DAY ? styles.column : null, { color: colors.onSurfaceMuted }]}>
            {Number(day.day.slice(8))}
          </Text>
        ))}
      </View>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {best ? `Best day: ${displayDate(best.day)} · ${money(best.sales)}` : 'No sales on these days.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: spacing.xs },
  plot: { height: PLOT, flexDirection: 'row', alignItems: 'flex-end', gap: FOOT },
  column: { flex: 1 },
  labels: { flexDirection: 'row', gap: FOOT },
  spread: { justifyContent: 'space-between' },
});
