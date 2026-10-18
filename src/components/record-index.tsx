import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { opens } from '../features/permissions/access';
import { usePermissions } from '../features/role-permissions/queries';
import type { Ptype } from '../features/role-permissions/queries';
import { useColumns } from '../lib/columns';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { CellRows } from './cell-rows';
import { Icon } from './icon';
import { PageHeader } from './page-header';
import { QueryState } from './query-state';
import { Text } from './text';

export type IndexEntry<R extends string> = {
  label: string;
  hint: string;
  /** The doctype whose permission shows this row (private.permitted_merchant_ids). */
  doctype: string;
  /** Which permission on it: Read unless the row is an action — Import Items needs Item create. */
  ptype?: Ptype;
  /** The page under the destination's directory in src/app/(app)/systems/[id]/. */
  route: R;
};

export type IndexSection<R extends string> = { title: string; hint: string; entries: IndexEntry<R>[] };

type Props<R extends string> = {
  merchantId: string;
  /** The system's name, above the title. */
  kicker: string;
  title: string;
  meta: string;
  isOwner: boolean;
  sections: IndexSection<R>[];
  /**
   * Pushes the row's page. The caller builds the href as a string from its own route union: past 22 routes
   * `{ pathname, params }` is more than TypeScript will check against expo-router's per-route types.
   */
  onOpen: (route: R) => void;
  offline: string;
  failure: string;
  /** What shows when the person's permissions leave no row; null when the box above (Sell's session) stands in for it. */
  empty: string | null;
  /** What the destination shows above its sections — Sell's session. */
  children?: ReactNode;
};

// ponytail: tune on a real tablet. A section card's narrowest width; the column count falls out of it.
const SECTION_CARD = 320;

/**
 * The index of records a rail destination opens on — Setup, Stock: sections in columns, each a box of rows
 * (.claude/instruction_mds/frontend.md §5, "Index of records").
 */
export function RecordIndex<R extends string>({ merchantId, kicker, title, meta, isOwner, sections, onOpen, offline, failure, empty, children }: Props<R>) {
  const { columns, onLayout } = useColumns(SECTION_CARD);
  const permissions = usePermissions({ merchantId });
  // A row shows only to whom may open it; a section with none left goes. The owner may read everything,
  // and the systems list already says who that is — so the owner's rows need no my_permissions, which a
  // fresh start in airplane mode has not fetched.
  const shown = sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => isOwner || opens(entry, permissions.data)),
    }))
    .filter((section) => section.entries.length > 0);

  return (
    <View style={styles.fill}>
      <PageHeader kicker={kicker} title={title} meta={meta} />
      <ScrollView contentContainerStyle={styles.body}>
        {children}
        {isOwner || permissions.data ? null : (
          <View style={styles.state}>
            <QueryState query={permissions} offline={offline} failure={failure} />
          </View>
        )}
        {permissions.data && shown.length === 0 && empty !== null ? <Text variant="bodyMedium">{empty}</Text> : null}
        <CellRows
          items={shown}
          columns={columns}
          onLayout={onLayout}
          keyOf={(section) => section.title}
          render={(section) => <SectionCard section={section} onOpen={onOpen} />}
          rowGap={spacing.lg}
          columnGap={spacing.md}
        />
      </ScrollView>
    </View>
  );
}

function SectionCard<R extends string>({ section, onOpen }: { section: IndexSection<R>; onOpen: (route: R) => void }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.section}>
      {/* Section heading: headlineSmall and its bodySmall hint (.claude/instruction_mds/frontend.md §5). */}
      <View style={styles.heading}>
        <Text variant="headlineSmall">{section.title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {section.hint}
        </Text>
      </View>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        {section.entries.map((entry, index) => (
          <Pressable
            key={entry.label}
            onPress={() => onOpen(entry.route)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            // A 1px surfaceVariant hairline between rows (.claude/instruction_mds/frontend.md §5).
            style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceVariant } : null]}
          >
            <View style={styles.rowText}>
              <Text variant="titleMedium">{entry.label}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {entry.hint}
              </Text>
            </View>
            <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.md, padding: spacing.md },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  section: { flex: 1, gap: spacing.sm },
  heading: { gap: spacing.xs },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
