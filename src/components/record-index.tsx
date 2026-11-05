import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useHiddenFeatures } from '../features/feature-preferences/queries';
import { useMerchant } from '../features/merchants/queries';
import { pageShown } from '../features/feature-preferences/visibility';
import { opens } from '../features/permissions/access';
import type { Permissions } from '../features/permissions/access';
import { usePermissions } from '../features/role-permissions/queries';
import type { Ptype } from '../features/role-permissions/queries';
import { useColumns } from '../lib/columns';
import type { IconName } from '../lib/icons';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { BottomSpacer } from './bottom-spacer';
import { CellRows } from './cell-rows';
import { Icon } from './icon';
import { PageHeader } from './page-header';
import { QueryState } from './query-state';
import { Text } from './text';

export type IndexEntry<R extends string> = {
  label: string;
  /** Setup's and Stock's pages (src/components/section-browser.tsx). */
  icon?: IconName;
  hint: string;
  /** What the page is for, in plain words: the Features page's About for the page. */
  purpose: string;
  /** When to use it: under Purpose in that About. */
  useCase: string;
  /** The page the screen's job cannot be done without: it has no switch of its own, and goes only with its screen. */
  core?: true;
  /** The doctype whose permission shows this row (private.permitted_merchant_ids). */
  doctype: string;
  /** Which permission on it: Read unless the row is an action — Import Items needs Item create. */
  ptype?: Ptype;
  /** The page under the destination's directory in src/app/(app)/systems/[id]/. */
  route: R;
};

export type IndexSection<R extends string> = { title: string; hint: string; /** As on an entry. */ icon?: IconName; entries: IndexEntry<R>[] };

type Props<R extends string> = {
  merchantId: string;
  /** The destination this index is, for the pages the person hid there (the Features page). */
  screen: string;
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
export function RecordIndex<R extends string>({ merchantId, screen, kicker, title, meta, isOwner, sections, onOpen, offline, failure, empty, children }: Props<R>) {
  const { columns, onLayout } = useColumns(SECTION_CARD);
  const permissions = usePermissions({ merchantId });
  const hidden = useStoreHidden(merchantId);
  // A row shows only to whom may open it, and only while they have not hidden it; a section with none left
  // goes. The owner may read everything, and the systems list already says who that is — so the owner's rows
  // need no my_permissions, which a fresh start in airplane mode has not fetched.
  const by = { screen, hidden, isOwner, permissions: permissions.data };
  const shown = listedSections(sections, by);
  const loading = !isOwner && !permissions.data;
  const said = nothingListed(by, shown.length) ? empty : null;

  return (
    <View style={styles.fill}>
      <PageHeader kicker={kicker} title={title} meta={meta} />
      <ScrollView contentContainerStyle={styles.body}>
        {children}
        {loading ? (
          <View style={styles.state}>
            <QueryState query={permissions} offline={offline} failure={failure} />
          </View>
        ) : null}
        {said ? <Text variant="bodyMedium">{said}</Text> : null}
        <CellRows
          items={shown}
          columns={columns}
          onLayout={onLayout}
          keyOf={(section) => section.title}
          render={(section) => <SectionCard section={section} onOpen={onOpen} />}
          rowGap={spacing.lg}
          columnGap={spacing.md}
        />
        <BottomSpacer />
      </ScrollView>
    </View>
  );
}

/** What the person hides in the store, or its level's menu (src/features/merchants/levels.ts): undefined until it loads. */
function useStoreHidden(merchantId: string) {
  const level = useMerchant(merchantId)?.merchant.level;
  return useHiddenFeatures({ merchantId, level });
}

export type ListedBy = { screen: string; hidden: string[] | undefined; isOwner: boolean; permissions: Permissions | null | undefined };

/** Whether a row is listed: the person may open it, and has not hidden it on the Features page. */
function listed(entry: IndexEntry<string>, by: ListedBy) {
  return (by.isOwner || opens(entry, by.permissions)) && !!by.hidden && pageShown(by.hidden, by.screen, entry);
}

/** A destination's sections less the rows that are not listed; a section with none left goes. */
export function listedSections<R extends string>(sections: IndexSection<R>[], by: ListedBy) {
  return sections.map((section) => ({ ...section, entries: section.entries.filter((entry) => listed(entry, by)) })).filter((section) => section.entries.length > 0);
}

/** Nothing is listed once everything the rows depend on has loaded: the moment to say why. */
export const nothingListed = (by: ListedBy, count: number) => !!by.permissions && !!by.hidden && count === 0;

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
