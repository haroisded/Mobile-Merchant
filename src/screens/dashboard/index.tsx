import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CellRows } from '../../components/cell-rows';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { BoxRow, RowBox } from '../../components/row-box';
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
import { has, usePermissions } from '../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { fontScaled, useBottomInset, useColumns, useShellWide } from '../../lib/columns';
import { displayDate, todayIn } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { SalesChart } from './sales-chart';

// ponytail: tune on a real tablet. A number card's narrowest width; the column count falls out of it — two
// across a phone.
const NUMBER_CARD = 150;
// ponytail: tune on a real tablet. A block's narrowest width (the chart, the best sellers, the alerts): two side by
// side on a landscape tablet's pane, one under another upright and on a phone.
const BLOCK = 420;
// The period switch's narrowest width: three segments' own padding (16 each side), plus their labels —
// "Last 7 Days" the longest — which grow with the font scale (fontScaled). 328 at the default size: a phone's width.
const PERIOD_SWITCH_PADDING = 96;
const PERIOD_SWITCH_LABELS = 232;
// ponytail: the Dashboard lists this many alerts; Stock Balance has every bin. A paged list here if a shop
// ever runs that low on that much.
const ALERTS_SHOWN = 50;

const META = 'Sales, registers and stock at a glance';
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
 * The period is counted in the store's time zone, the day a sale is dated by, so the page waits for System
 * Settings. Wide, the period switch sits in the page header and the blocks two to a row where they fit.
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
  if (waiting || !settings.data) {
    return (
      <View style={styles.fill}>
        <PageHeader kicker={merchant.name} title="Dashboard" meta={META} />
        <View style={styles.state}>{waiting ? <QueryState query={waiting} offline={OFFLINE} failure={FAILURE} /> : null}</View>
      </View>
    );
  }

  return <Loaded merchant={merchant} today={todayIn(settings.data.time_zone)} shows={shownBlocks(isOwner, permissions.data)} />;
}

/** The page once System Settings (and a member's permissions) are in: the period switch, then the blocks. */
function Loaded({ merchant, today, shows }: { merchant: Merchant; today: string; shows: BlocksProps['shows'] }) {
  const wide = useShellWide();
  const [period, setPeriod] = useState<Period>('today');
  const switcher = <PeriodSwitch value={period} onChange={setPeriod} fill={!wide} />;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={merchant.name}
        title="Dashboard"
        meta={META}
        // Pane switch, wide: in the page header's actions (.claude/instruction_mds/frontend.md §5).
        actions={wide && Object.values(shows).some(Boolean) ? switcher : undefined}
      />
      <Blocks merchant={merchant} today={today} shows={shows} period={period} switcher={wide ? null : switcher} />
    </View>
  );
}

/**
 * Which blocks show, each behind the permission that shows it: a cashier's Process Sales looks sales up, but only
 * View Sales shows them (public.permission_rules). The owner may read everything.
 */
function shownBlocks(isOwner: boolean, permissions: Parameters<typeof has>[0]) {
  const holds = (key: string) => isOwner || has(permissions, key);
  return { sells: holds('view_sales'), stocks: holds('view_stock'), registers: holds('view_shift_totals') || holds('close_any_register') };
}

/**
 * The period pane switch. Its segments do not measure their labels, so it is given the width three of them need
 * (fontScaled). Narrow (`fill`), full width on a row of its own that scrolls sideways when a large font makes that
 * more than the screen — never a cut-off label; wide, that width in the page header (.claude/instruction_mds/frontend.md §5).
 */
function PeriodSwitch({ value, onChange, fill }: { value: Period; onChange: (period: Period) => void; fill?: boolean }) {
  const width = PERIOD_SWITCH_PADDING + fontScaled(PERIOD_SWITCH_LABELS);
  // In the header the segments split exactly this width, and the longest label's share ran out at 1.3 ("Last 7 Day…",
  // Medium Tablet, 2026-10-19): there is room there, so the padding grows with the font too.
  const header = fontScaled(PERIOD_SWITCH_PADDING + PERIOD_SWITCH_LABELS);
  const segments = <SegmentedButtons value={value} onValueChange={onChange} buttons={PERIODS} style={fill ? [styles.grow, { minWidth: width }] : { width: header }} />;

  return fill ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grow}>
      {segments}
    </ScrollView>
  ) : (
    segments
  );
}

type BlocksProps = {
  merchant: Merchant;
  today: string;
  shows: { sells: boolean; stocks: boolean; registers: boolean };
  period: Period;
  /** The period switch on a row of its own (narrow); null when the page header holds it (wide). */
  switcher: ReactNode;
};

function Blocks({ merchant, today, shows: { sells, stocks, registers }, period, switcher }: BlocksProps) {
  const range = periodRange(period, today);
  const { columns, onLayout } = useColumns(BLOCK);
  const bottom = useBottomInset();

  if (!sells && !stocks && !registers) {
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">Your permissions give you nothing to see here. Ask the owner if you need more.</Text>
      </View>
    );
  }

  const blocks = [
    sells ? <SalesPerDay key="sales" merchant={merchant} range={chartRange(period, today)} /> : null,
    sells ? <TopSelling key="top" merchant={merchant} range={range} /> : null,
    stocks ? <StockAlerts key="alerts" merchant={merchant} /> : null,
  ].filter((block) => block !== null);

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.md + bottom }]}>
      {switcher}
      <NumberCards
        merchant={merchant}
        range={range}
        period={period}
        // Gross Profit is answered only to whoever may also read the Stock Ledger, where the cost lives: View Stock Levels.
        shows={{ sales: sells, profit: sells && stocks, registers, stock: stocks }}
      />
      {/* Rows of `columns` blocks, as the cards are: a wide pane gets two side by side, never one wider row (rule 16). */}
      <CellRows items={blocks} columns={columns} onLayout={onLayout} keyOf={(block) => String(block.key)} render={(block) => block} rowGap={spacing.lg} columnGap={spacing.lg} />
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

  return (
    // Never more columns than cards, so four fill a tablet's row.
    <CellRows
      items={list}
      columns={Math.min(columns, list.length)}
      onLayout={onLayout}
      keyOf={(card) => card.label}
      render={(card) => <NumberCard label={card.label} figure={card.figure} sub={card.sub} />}
      rowGap={spacing.ms}
      columnGap={spacing.ms}
    />
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
        <RowBox empty="No sales in this period.">
          {top.data.map((row, index) => (
            <BoxRow
              key={row.id}
              first={index === 0}
              // A group has a name alone; an item its code with it.
              title={grouping === 'group' ? row.name : itemLabel({ item_code: row.code, item_name: row.name })}
              sub={by === 'qty' ? money(row.amount) : `${row.qty} sold`}
              figure={by === 'qty' ? String(row.qty) : money(row.amount)}
            />
          ))}
        </RowBox>
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
        <RowBox empty="Nothing is out of stock or low.">
          {alerts.data.map((alert, index) => (
            <BoxRow
              key={`${alert.item_id}:${alert.warehouse_id}`}
              first={index === 0}
              title={itemLabel(alert)}
              sub={alert.warehouse_name}
              alert={alert.actual_qty <= 0 ? 'Out of stock' : `${alert.actual_qty} left · re-order at ${alert.reorder_level}`}
            />
          ))}
        </RowBox>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  state: { padding: spacing.md, gap: spacing.sm, alignItems: 'flex-start' },
  body: { padding: spacing.md, gap: spacing.md },
  card: { flex: 1, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.xs },
  block: { gap: spacing.sm },
});
