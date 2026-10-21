import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoxRow, RowBox } from '../../../components/row-box';
import { SectionHeading } from '../../../components/section-heading';
import { SegmentedButtons } from '../../../components/segmented-buttons';
import { Text } from '../../../components/text';
import { fontScaled } from '../../../lib/columns';
import { useAppTheme } from '../../../lib/theme';
import { SalesChart } from '../../dashboard/sales-chart';
import { radius, spacing } from '../../../themes';
import { useSandbox } from '../sandbox/context';
import { GuideTarget } from '../sandbox/guide-target';
import { expectedCash, TODAY } from '../sandbox-state';
import { T } from '../tasks';
import { Frame, peso } from './frame';

// The Dashboard in the practice store (src/screens/dashboard/): the same period switch, number cards, chart and
// alerts, added up from the mock store. Each block shows with the permission the real one asks for.

type Period = 'today' | 'week' | 'month';

/** The day `days` before TODAY, as stored ("YYYY-MM-DD"). */
function daysBefore(days: number) {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const CARD_MIN = 150;

export function Dashboard() {
  const { store, holds, did } = useSandbox();
  const { colors } = useAppTheme();
  const [period, setPeriod] = useState<Period>('today');
  const from = period === 'today' ? TODAY : period === 'week' ? daysBefore(6) : `${TODAY.slice(0, 8)}01`;
  const sales = store.sales.filter((sale) => sale.status === 'Submitted' && sale.date >= from);
  const total = sales.reduce((sum, sale) => sum + sale.net, 0);
  const cost = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.qty * (store.items.find((item) => item.code === line.code)?.cost ?? 0), 0), 0);
  const open = store.sessions.filter((session) => session.status === 'Open');
  const low = store.items.filter((item) => item.stock <= 0 || (item.reorder > 0 && item.stock <= item.reorder));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = daysBefore(6 - index);
    const onDay = store.sales.filter((sale) => sale.status === 'Submitted' && sale.date === day);
    return { day, invoices: onDay.length, sales: onDay.reduce((sum, sale) => sum + sale.net, 0) };
  });
  const sees = holds('view_sales');
  const cards = [
    ...(sees ? [{ label: 'Sales', figure: peso(total), line: `${sales.filter((sale) => !sale.returnAgainst).length} invoices` }] : []),
    ...(sees && holds('view_stock') ? [{ label: 'Gross Profit', figure: peso(total - cost), line: 'Sales less what the items cost' }] : []),
    ...(holds('view_shift_totals') || holds('close_any_register')
      ? [{ label: 'Open Registers', figure: String(open.length), line: `${peso(open.reduce((sum, session) => sum + expectedCash(store, session.id), 0))} expected in cash` }]
      : []),
    ...(holds('view_stock') ? [{ label: 'Low Stock', figure: String(low.length), line: 'At or below re-order level' }] : []),
  ];

  return (
    <Frame title="Dashboard" meta="Sample Cafe at a glance">
      <GuideTarget target={T.dashboardPeriod}>
        <SegmentedButtons
          value={period}
          onValueChange={(value) => {
            setPeriod(value);
            if (value === 'week') did(T.dashboardPeriod);
          }}
          buttons={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Last 7 Days' },
            { value: 'month', label: 'This Month' },
          ]}
        />
      </GuideTarget>
      <View style={styles.cards}>
        {cards.map((card) => (
          <View key={card.label} style={[styles.card, { borderColor: colors.outlineVariant, minWidth: fontScaled(CARD_MIN) }]}>
            <Text variant="labelMedium" style={{ color: colors.secondary }}>
              {card.label}
            </Text>
            <Text variant="amount">{card.figure}</Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {card.line}
            </Text>
          </View>
        ))}
      </View>
      {sees ? (
        <>
          <SectionHeading title="Sales per Day" hint="The last seven days" />
          <SalesChart days={days} money={peso} />
        </>
      ) : null}
      {holds('view_stock') ? (
        <>
          <SectionHeading title="Stock Alerts" hint="Out of stock or at the re-order level" />
          <RowBox empty="Nothing is running low.">
            {low.map((item, index) => (
              <BoxRow
                key={item.code}
                first={index === 0}
                title={item.name}
                sub={`Stores · ${item.code}`}
                alert={item.stock <= 0 ? 'Out of stock' : `${item.stock} left · re-order at ${item.reorder}`}
              />
            ))}
          </RowBox>
        </>
      ) : null}
    </Frame>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.ms },
  card: { flexGrow: 1, flexBasis: 0, gap: spacing.xs, padding: spacing.ms, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
});
