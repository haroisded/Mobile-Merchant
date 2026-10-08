import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../../components/icon';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useColumns } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Entry = {
  label: string;
  hint: string;
  /** The doctype whose Read permission shows this row (private.permitted_merchant_ids). */
  doctype: string;
  pathname:
    | '/systems/[id]/setup/company'
    | '/systems/[id]/setup/fiscal-years'
    | '/systems/[id]/setup/global-defaults'
    | '/systems/[id]/setup/system-settings'
    | '/systems/[id]/setup/currency'
    | '/systems/[id]/setup/chart-of-accounts'
    | '/systems/[id]/setup/cost-centers'
    | '/systems/[id]/setup/users'
    | '/systems/[id]/setup/roles'
    | '/systems/[id]/setup/role-profiles'
    | '/systems/[id]/setup/role-permissions'
    | '/systems/[id]/setup/user-permissions';
};

type Section = { title: string; hint: string; entries: Entry[] };

// The foundation a POS needs before its first item, grouped as .claude/erpnext-docs/POS-System-Only-Features.md
// groups it. A section appears once its first screen exists; the rest arrive step by step.
const SECTIONS: Section[] = [
  {
    title: 'Company & Calendar',
    hint: 'Who the books belong to, and the years they are kept in',
    entries: [
      { label: 'Company', hint: 'Name, abbreviation, country and currency', doctype: 'Company', pathname: '/systems/[id]/setup/company' },
      { label: 'Fiscal Years', hint: 'The accounting years every sale is dated in', doctype: 'Fiscal Year', pathname: '/systems/[id]/setup/fiscal-years' },
    ],
  },
  {
    title: 'Defaults & Money',
    hint: 'How numbers, amounts and times read on every screen and receipt',
    entries: [
      { label: 'Global Defaults', hint: 'Rounded total and amount in words on receipts', doctype: 'Global Defaults', pathname: '/systems/[id]/setup/global-defaults' },
      { label: 'System Settings', hint: 'Time zone, number format, precision, rounding', doctype: 'System Settings', pathname: '/systems/[id]/setup/system-settings' },
      { label: 'Currency', hint: 'Symbol, smallest coin, amount in words', doctype: 'Currency', pathname: '/systems/[id]/setup/currency' },
    ],
  },
  {
    title: 'Accounting',
    hint: 'Where every sale, purchase and payment is recorded',
    entries: [
      { label: 'Chart of Accounts', hint: 'Cash, stock, sales and the groups they sit in', doctype: 'Account', pathname: '/systems/[id]/setup/chart-of-accounts' },
      { label: 'Cost Centers', hint: 'Branches or counters to tag income and expenses by', doctype: 'Cost Center', pathname: '/systems/[id]/setup/cost-centers' },
    ],
  },
  {
    title: 'Users & Access',
    hint: 'Who may work in this system, and what each of them may do',
    entries: [
      { label: 'Users', hint: 'Invite people by email; give them roles', doctype: 'User', pathname: '/systems/[id]/setup/users' },
      { label: 'Roles', hint: 'The standard roles, and your own', doctype: 'Role', pathname: '/systems/[id]/setup/roles' },
      { label: 'Role Profiles', hint: 'A set of roles given together', doctype: 'Role Profile', pathname: '/systems/[id]/setup/role-profiles' },
      {
        label: 'Role Permissions Manager',
        hint: 'What each role may read, write, create and delete',
        doctype: 'Role Permission',
        pathname: '/systems/[id]/setup/role-permissions',
      },
      { label: 'User Permissions', hint: 'Restrict a user to particular records', doctype: 'User Permission', pathname: '/systems/[id]/setup/user-permissions' },
    ],
  },
];

// ponytail: tune on a real tablet. A section card's narrowest width; the column count falls out of it.
const SECTION_CARD = 320;

/** Setup: the index of a system's foundation records, the rail's second destination. */
export function SetupIndex({ merchantId, merchantName }: { merchantId: string; merchantName: string }) {
  const { columns, onLayout } = useColumns(SECTION_CARD);
  const permissions = usePermissions({ merchantId });
  // A row shows only to whom may read it; a section with none left goes.
  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => can(permissions.data, entry.doctype, 'read')),
  })).filter((section) => section.entries.length > 0);
  // Rows of `columns` sections, the last one padded with empty cells so every card keeps the same width.
  const rows = Array.from({ length: Math.ceil(sections.length / columns) }, (_, row) =>
    sections.slice(row * columns, row * columns + columns)
  );

  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchantName} title="Setup" meta="Set these up before the first item is sold" />
      <ScrollView contentContainerStyle={styles.body}>
        {permissions.data ? null : (
          <View style={styles.state}>
            <QueryState query={permissions} offline="You're offline. Setup will load when you reconnect." failure="Couldn't load Setup. Try again." />
          </View>
        )}
        {permissions.data && sections.length === 0 ? (
          <Text variant="bodyMedium">Your roles give you nothing to set up here. Ask the owner if you need more.</Text>
        ) : null}
        <View style={styles.grid} onLayout={onLayout}>
          {rows.map((row) => (
            <View key={row[0].title} style={styles.gridRow}>
              {row.map((section) => (
                <SectionCard key={section.title} section={section} merchantId={merchantId} />
              ))}
              {Array.from({ length: columns - row.length }, (_, index) => (
                <View key={index} style={styles.fill} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionCard({ section, merchantId }: { section: Section; merchantId: string }) {
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
            onPress={() => router.push({ pathname: entry.pathname, params: { id: merchantId } })}
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
  grid: { gap: spacing.lg },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  section: { flex: 1, gap: spacing.sm },
  heading: { gap: spacing.xs },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
