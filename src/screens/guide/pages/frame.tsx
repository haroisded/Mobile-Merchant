import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormFooter } from '../../../components/form-footer';
import { Icon } from '../../../components/icon';
import { PageHeader } from '../../../components/page-header';
import { Text } from '../../../components/text';
import { FORM_MEASURE, useBottomInset } from '../../../lib/columns';
import { formatMoney } from '../../../lib/money';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { useSandbox } from '../sandbox/context';
import type { Params } from '../sandbox/context';
import { GuideTarget } from '../sandbox/guide-target';
import type { SetupId } from '../sandbox-state';
import type { Page, Target } from '../tasks';

// What every page of the practice store is drawn with: the real pages' header, their measure and footer, an index's
// boxes of rows, a list's rows and a status word — the app's own components, so the practice store looks like a store.

const PHP = { code: 'PHP', symbol: '₱', symbol_on_right: false, fraction: 'Centavo', number_format: '#,###.##' };

/** An amount as a new Philippine store shows it (Setup > Currency's seeded record). */
export const peso = (value: number) => formatMoney(value, PHP, 2, "Banker's Rounding");

/** The practice store's name, the kicker over every page. */
export const STORE_NAME = 'Sample Cafe';

type FrameProps = {
  title: string;
  meta?: string;
  onBack?: () => void;
  actions?: ReactNode;
  /** Pinned under the page: its Save or its main action. */
  footer?: ReactNode;
  children: ReactNode;
};

/** A practice page: the page header, the page scrolling at the form measure, and its footer. */
export function Frame({ title, meta, onBack, actions, footer, children }: FrameProps) {
  // With no footer, the page's end keeps clear of the navigation bar (0 while a task's bar is under it).
  const bottom = useBottomInset();
  return (
    <View style={styles.fill}>
      <PageHeader kicker={STORE_NAME} title={title} meta={meta} onBack={onBack} actions={actions} />
      <ScrollView contentContainerStyle={[styles.body, footer ? null : { paddingBottom: spacing.md + bottom }]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <FormFooter notice={null}>{footer}</FormFooter> : null}
    </View>
  );
}

/** A row of a practice index: shown when `show`, opening `page` — and moving a step on when it is `target`. */
export type IndexRow = { label: string; hint: string; show: boolean; page: Page; params?: Params; target?: Target; setupId?: SetupId };
export type IndexBlock = { title: string; rows: IndexRow[] };

/** A destination's index, as RecordIndex draws one: a heading over a 1px box of the rows shown. Empty sections go. */
export function IndexBoxes({ sections }: { sections: IndexBlock[] }) {
  const { colors } = useAppTheme();
  const shown = sections.map((section) => ({ ...section, rows: section.rows.filter((row) => row.show) })).filter((section) => section.rows.length > 0);

  return (
    <View style={styles.sections}>
      {shown.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="labelMedium" style={{ color: colors.secondary }}>
            {section.title}
          </Text>
          <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
            {section.rows.map((row, index) => (
              <IndexLine key={row.label} row={row} first={index === 0} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function IndexLine({ row, first }: { row: IndexRow; first: boolean }) {
  const { go, did } = useSandbox();
  const { colors } = useAppTheme();
  const press = (
    <Pressable
      onPress={() => {
        if (row.target) did(row.target, row.setupId);
        go(row.page, row.params);
      }}
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
    >
      <View style={styles.rowText}>
        <Text variant="titleMedium">{row.label}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {row.hint}
        </Text>
      </View>
      <Icon source="chevron-right" size={22} color={colors.onSurfaceMuted} />
    </Pressable>
  );
  return row.target ? (
    <GuideTarget target={row.target} setupId={row.setupId}>
      {press}
    </GuideTarget>
  ) : (
    press
  );
}

type ListRowProps = { first: boolean; title: string; sub: string; figure?: string; status?: string; alert?: boolean; onPress?: () => void };

/** One row of a list box: a name over a line, a figure and a status word at the end. Pressable when it opens something. */
export function ListRow({ first, title, sub, figure, status, alert, onPress }: ListRowProps) {
  const { colors } = useAppTheme();
  const body = (
    <View style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
      <View style={styles.rowText}>
        <Text variant="titleMedium">{title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {sub}
        </Text>
        {status ? (
          <Text variant="labelMedium" style={{ color: alert ? colors.error : colors.onSurfaceMuted }}>
            {status}
          </Text>
        ) : null}
      </View>
      {figure ? <Text variant="titleMedium">{figure}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.ripple }} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </Pressable>
  );
}

/** A small read-out: a field label over its value, for what a page shows but does not ask for. */
export function ReadOut({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOut}>
      <Text variant="labelMedium">{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE },
  sections: { gap: spacing.md },
  section: { gap: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms, minHeight: 56 },
  rowText: { flex: 1, gap: spacing.xs },
  readOut: { gap: spacing.xs },
});
