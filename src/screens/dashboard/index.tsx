import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { SectionHeading } from '../../components/section-heading';
import { SegmentedButtons } from '../../components/segmented-buttons';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import { chartRange, periodRange } from '../../features/dashboard/period';
import type { Period } from '../../features/dashboard/period';
import {
  refetchStaleDashboard,
  useDashboardCardsQuery,
  useSalesByDayQuery,
  useStockAlertsQuery,
  useTopSellingQuery,
} from '../../features/dashboard/queries';
import type { TopBy } from '../../features/dashboard/queries';
import { itemLabel } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { fontScaled, useColumns } from '../../lib/columns';
import { displayDate, todayIn } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { SalesChart } from './sales-chart';

// ponytail: tune on a real tablet. A number card's narrowest width; the column count falls out of it — two
// across a phone.
const NUMBER_CARD = 150;
// The period switch's narrowest width: three segments' own padding (16 each side), plus their labels —
// "Last 7 Days" the longest — which grow with the font scale (fontScaled). 328 at the default size: a phone's width.
const PERIOD_SWITCH_PADDING = 96;
const PERIOD_SWITCH_LABELS = 232;
// ponytail: the Dashboard lists this many alerts; Stock Balance has every bin. A paged list here if a shop
// ever runs that low on that much.
const ALERTS_SHOWN = 50;

const OFFLINE = "You're offline. The Dashboard will load when you reconnect.";
const FAILURE = "Couldn't load the Dashboard. Try again.";

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
];
const PERIOD_WORDS = { today: 'today', week: 'in the last 7 days', month: 'this month' };

const TOP_BY: { value: TopBy; label: string }[] = [
  { value: 'qty', label: 'Quantity' },
  { value: 'amount', label: 'Amount' },
];
type Grouping = 'item' | 'group';
const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'item', label: 'Item' },
  { value: 'group', label: 'Item Group' },
];

type Range = { from: string; to: string };

/**
 * The Dashboard (POS-System-Added-Features.md Step 22; docs.frappe.io/erpnext/erpnext-dashboards,
 * /sales-analytics, /stock-level-report): a period switch, four number cards, sales per day, the best sellers
 * and the stock that needs restocking. A destination of its own — Home stays as it is. Each block shows only
 * to someone who may read what it adds up, and the database answers with that person's own rows either way.
 *
 * The period is counted in the system's time zone, the day a sale is dated by, so the page waits for System
 * Settings. Narrow anatomy at every width until the tablet pass.
 */
export function Dashboard({ merchant, isOwner }: { merchant: Merchant; isOwner: boolean }) {
  const settings = useSystemSettingsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id });
  const queryClient = useQueryClient();

  // The shell's drawer keeps this screen mounted, so coming back to it is no mount: ask again for what went
  // stale meanwhile — another register's sales, which nothing on this device invalidates.
  useFocusEffect(
    useCallback(() => {
      void refetchStaleDashboard(queryClient);
    }, [queryClient])
  );

  // The owner may read everything and needs no my_permissions; a member's blocks wait for theirs.
  const waiting = !settings.data ? settings : !isOwner && permissions.data === undefined ? permissions : undefined;

  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchant.name} title="Dashboard" meta="Sales, registers and stock at a glance" />
      {settings.data && !waiting ? (
        <Blocks
          merchant={merchant}
          today={todayIn(settings.data.time_zone)}
          reads={(doctype) => isOwner || can(permissions.data, doctype, 'read')}
        />
      ) : (
        <View style={styles.state}>{waiting ? <QueryState query={waiting} offline={OFFLINE} failure={FAILURE} /> : null}</View>
      )}
    </View>
  );
}

function Blocks({ merchant, today, reads }: { merchant: Merchant; today: string; reads: (doctype: string) => boolean }) {
  const [period, setPeriod] = useState<Period>('today');
  const range = periodRange(period, today);
  const sells = reads('POS Invoice');
  const stocks = reads('Bin');
  const registers = reads('POS Opening Entry');

  if (!sells && !stocks && !registers) {
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">Your roles give you nothing to see here. Ask the owner if you need more.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* Pane switch, narrow: full width on a row of its own (.claude/instruction_mds/frontend.md §5). Its
          segments do not measure their labels, so the row holds the width three of them need and scrolls
          sideways when a large font makes that more than the screen — never a cut-off label. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grow}>
        <SegmentedButtons value={period} onValueChange={setPeriod} buttons={PERIODS} style={[styles.grow, { minWidth: PERIOD_SWITCH_PADDING + fontScaled(PERIOD_SWITCH_LABELS) }]} />
      </ScrollView>
      <NumberCards
        merchant={merchant}
        range={range}
        period={period}
        // Gross Profit is answered only to whoever may also read the Stock Ledger, where the cost lives.
        shows={{ sales: sells, profit: sells && reads('Stock Ledger Entry'), registers, stock: stocks }}
      />
      {sells ? <SalesPerDay merchant={merchant} range={chartRange(period, today)} /> : null}
      {sells ? <TopSelling merchant={merchant} range={range} /> : null}
      {stocks ? <StockAlerts merchant={merchant} /> : null}
    </ScrollView>
  );
}

type Shows = { sales: boolean; profit: boolean; registers: boolean; stock: boolean };

/** The four number cards (22.1). Sales and Gross Profit are the period's; the other two are as things stand now. */
function NumberCards({ merchant, range, period, shows }: { merchant: Merchant; range: Range; period: Period; shows: Shows }) {
  const cards = useDashboardCardsQuery({ merchantId: merchant.id, ...range });
  const money = useMoney(merchant);
  // The cards' width grows with the font scale, so a figure keeps its line (fontScaled).
  const { columns, onLayout } = useColumns(fontScaled(NUMBER_CARD));
  const data = cards.data;

  if (!data) {
    return (
      <View style={styles.state}>
        <QueryState query={cards} offline={OFFLINE} failure={FAILURE} />
      </View>
    );
  }

  const list = [
    shows.sales
      ? { label: 'Sales', figure: money(data.sales), sub: `${data.invoices} ${data.invoices === 1 ? 'invoice' : 'invoices'} ${PERIOD_WORDS[period]}` }
      : null,
    shows.profit ? { label: 'Gross Profit', figure: money(data.gross_profit), sub: 'Sales less the cost of what was sold' } : null,
    shows.registers
      ? {
          label: 'Open Registers',
          figure: String(data.open_registers),
          sub: data.open_registers > 0 ? `${money(data.expected_cash)} expected in cash` : 'No session is open',
        }
      : null,
    shows.stock
      ? { label: 'Low Stock', figure: String(data.low_stock), sub: data.low_stock > 0 ? 'Out of stock, or at the re-order level' : 'Nothing to restock' }
      : null,
  ].filter((card) => card !== null);
  // Rows of `columns` cards, the last one padded with empty cells so every card keeps the same width.
  const rows = Array.from({ length: Math.ceil(list.length / columns) }, (_, row) => list.slice(row * columns, row * columns + columns));

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {rows.map((row) => (
        <View key={row[0].label} style={styles.gridRow}>
          {row.map((card) => (
            <NumberCard key={card.label} label={card.label} figure={card.figure} sub={card.sub} />
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={index} style={styles.fill} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A number card: a 1px box, its label, the figure, and a line under it (.claude/instruction_mds/frontend.md §5). */
function NumberCard({ label, figure, sub }: { label: string; figure: string; sub: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <Text variant="labelMedium" style={{ color: colors.secondary }}>
        {label}
      </Text>
      <Text variant="amount">{figure}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {sub}
      </Text>
    </View>
  );
}

/** Sales per day (22.2): the period's days, or the last seven when the period is today. */
function SalesPerDay({ merchant, range }: { merchant: Merchant; range: Range }) {
  const days = useSalesByDayQuery({ merchantId: merchant.id, ...range });
  const money = useMoney(merchant);

  return (
    <View style={styles.block}>
      <SectionHeading title="Sales per Day" hint={`${displayDate(range.from)} to ${displayDate(range.to)}`} />
      {days.data ? <SalesChart days={days.data} money={money} /> : <QueryState query={days} offline={OFFLINE} failure={FAILURE} />}
    </View>
  );
}

/** Top-Selling Items (22.2): by quantity or amount, by Item or Item Group. */
function TopSelling({ merchant, range }: { merchant: Merchant; range: Range }) {
  const [by, setBy] = useState<TopBy>('qty');
  const [grouping, setGrouping] = useState<Grouping>('item');
  const top = useTopSellingQuery({ merchantId: merchant.id, ...range, by, group: grouping === 'group' });
  const money = useMoney(merchant);

  return (
    <View style={styles.block}>
      <SectionHeading title="Top-Selling Items" hint="What sold most in this period, returns taken off" />
      <SegmentedButtons value={by} onValueChange={setBy} buttons={TOP_BY} />
      <SegmentedButtons value={grouping} onValueChange={setGrouping} buttons={GROUPINGS} />
      {top.data ? (
        <Rows empty="No sales in this period.">
          {top.data.map((row, index) => (
            <Row
              key={row.id}
              first={index === 0}
              // A group has a name alone; an item its code with it.
              title={grouping === 'group' ? row.name : itemLabel({ item_code: row.code, item_name: row.name })}
              sub={by === 'qty' ? money(row.amount) : `${row.qty} sold`}
              figure={by === 'qty' ? String(row.qty) : money(row.amount)}
            />
          ))}
        </Rows>
      ) : (
        <QueryState query={top} offline={OFFLINE} failure={FAILURE} />
      )}
    </View>
  );
}

/** Stock Alerts (22.3): what is out of stock, or at or below its Re-order Level, per warehouse. */
function StockAlerts({ merchant }: { merchant: Merchant }) {
  const alerts = useStockAlertsQuery({ merchantId: merchant.id, limit: ALERTS_SHOWN });
  const { colors } = useAppTheme();

  return (
    <View style={styles.block}>
      <SectionHeading title="Stock Alerts" hint="Out of stock, or at or below the re-order level" />
      {alerts.data ? (
        <Rows empty="Nothing is out of stock or low.">
          {alerts.data.map((alert, index) => (
            <Row
              key={`${alert.item_id}:${alert.warehouse_id}`}
              first={index === 0}
              title={itemLabel(alert)}
              sub={alert.warehouse_name}
              alert={alert.actual_qty <= 0 ? 'Out of stock' : `${alert.actual_qty} left · re-order at ${alert.reorder_level}`}
            />
          ))}
        </Rows>
      ) : (
        <QueryState query={alerts} offline={OFFLINE} failure={FAILURE} />
      )}
      {alerts.data?.length === ALERTS_SHOWN ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          Showing the first {ALERTS_SHOWN}. Stock Balance has the rest.
        </Text>
      ) : null}
    </View>
  );
}

/** A 1px box of rows, or the line an empty one shows. */
function Rows({ empty, children }: { empty: string; children: ReactNode[] }) {
  const { colors } = useAppTheme();

  if (children.length === 0) return <Text variant="bodyMedium">{empty}</Text>;
  return <View style={[styles.box, { borderColor: colors.outlineVariant }]}>{children}</View>;
}

/**
 * One row: a name over a muted line, then either a figure at the end (a best seller's) or a status under them
 * (an alert's, in `error` — .claude/instruction_mds/frontend.md §2.4). A 1px surfaceVariant hairline above every
 * row but the first.
 */
function Row({ first, title, sub, figure, alert }: { first: boolean; title: string; sub: string; figure?: string; alert?: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
      <View style={styles.rowText}>
        <Text variant="titleMedium">{title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {sub}
        </Text>
        {alert ? (
          <Text variant="labelMedium" style={{ color: colors.error }}>
            {alert}
          </Text>
        ) : null}
      </View>
      {figure ? <Text variant="titleMedium">{figure}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  state: { padding: spacing.md, gap: spacing.sm, alignItems: 'flex-start' },
  body: { padding: spacing.md, gap: spacing.md },
  grid: { gap: spacing.ms },
  gridRow: { flexDirection: 'row', gap: spacing.ms },
  card: { flex: 1, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.xs },
  block: { gap: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
