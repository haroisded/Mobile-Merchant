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
  /**
   * The page under src/app/(app)/systems/[id]/setup/, pushed as a string href. Rejected: `{ pathname, params }`
   * — past 22 routes the union is more than TypeScript will check against expo-router's per-route types.
   */
  route:
    | 'company'
    | 'fiscal-years'
    | 'global-defaults'
    | 'system-settings'
    | 'currency'
    | 'chart-of-accounts'
    | 'cost-centers'
    | 'accounts-settings'
    | 'modes-of-payment'
    | 'tax-categories'
    | 'sales-tax-templates'
    | 'item-tax-templates'
    | 'tax-rules'
    | 'warehouses'
    | 'uoms'
    | 'uom-conversion-factors'
    | 'price-lists'
    | 'brands'
    | 'item-groups'
    | 'stock-settings'
    | 'selling-settings'
    | 'users'
    | 'roles'
    | 'role-profiles'
    | 'role-permissions'
    | 'user-permissions'
    | 'document-naming-settings'
    | 'print-formats'
    | 'letter-heads'
    | 'print-settings';
};

type Section = { title: string; hint: string; entries: Entry[] };

// The foundation a POS needs before its first item, grouped as .claude/erpnext-docs/POS-System-Only-Features.md
// groups it. A section appears once its first screen exists; the rest arrive step by step.
const SECTIONS: Section[] = [
  {
    title: 'Company & Calendar',
    hint: 'Who the books belong to, and the years they are kept in',
    entries: [
      { label: 'Company', hint: 'Name, currency, default accounts, stock', doctype: 'Company', route: 'company' },
      { label: 'Fiscal Years', hint: 'The accounting years every sale is dated in', doctype: 'Fiscal Year', route: 'fiscal-years' },
    ],
  },
  {
    title: 'Defaults & Money',
    hint: 'How numbers, amounts and times read on every screen and receipt',
    entries: [
      { label: 'Global Defaults', hint: 'Rounded total and amount in words on receipts', doctype: 'Global Defaults', route: 'global-defaults' },
      { label: 'System Settings', hint: 'Time zone, number format, precision, rounding', doctype: 'System Settings', route: 'system-settings' },
      { label: 'Currency', hint: 'Symbol, smallest coin, amount in words', doctype: 'Currency', route: 'currency' },
    ],
  },
  {
    title: 'Accounting',
    hint: 'Where every sale, purchase and payment is recorded',
    entries: [
      { label: 'Chart of Accounts', hint: 'Cash, stock, sales and the groups they sit in', doctype: 'Account', route: 'chart-of-accounts' },
      { label: 'Cost Centers', hint: 'Branches or counters to tag income and expenses by', doctype: 'Cost Center', route: 'cost-centers' },
      {
        label: 'Accounts Settings',
        hint: 'Cancellation, discounts, frozen dates',
        doctype: 'Accounts Settings',
        route: 'accounts-settings',
      },
    ],
  },
  {
    title: 'Payments',
    hint: 'The ways a sale can be paid',
    entries: [
      { label: 'Modes of Payment', hint: 'Cash, card, wallets and their accounts', doctype: 'Mode of Payment', route: 'modes-of-payment' },
    ],
  },
  {
    title: 'Taxes',
    hint: 'What tax a sale carries, and how it is worked out',
    entries: [
      {
        label: 'Sales Taxes and Charges Templates',
        hint: 'The tax rows a sale gets, in or on top of the price',
        doctype: 'Sales Taxes and Charges Template',
        route: 'sales-tax-templates',
      },
      { label: 'Item Tax Templates', hint: 'A different rate for particular items', doctype: 'Item Tax Template', route: 'item-tax-templates' },
      { label: 'Tax Categories', hint: 'Names for tax treatments: standard, exempt', doctype: 'Tax Category', route: 'tax-categories' },
      { label: 'Tax Rules', hint: 'Which template a sale takes, by category, group and date', doctype: 'Tax Rule', route: 'tax-rules' },
    ],
  },
  {
    title: 'Stock',
    hint: 'Where stock is kept, what it is counted in, and what it sells for',
    entries: [
      { label: 'Warehouses', hint: 'Stores, rooms and shelves, and their stock account', doctype: 'Warehouse', route: 'warehouses' },
      { label: 'UOMs', hint: 'Units items are counted in: Nos, Kg, Box', doctype: 'UOM', route: 'uoms' },
      {
        label: 'UOM Conversion Factors',
        hint: 'How many of one unit make another',
        doctype: 'UOM Conversion Factor',
        route: 'uom-conversion-factors',
      },
      { label: 'Price Lists', hint: 'The books selling prices are kept in', doctype: 'Price List', route: 'price-lists' },
      { label: 'Brands', hint: 'Brand names, and the sales defaults their items take', doctype: 'Brand', route: 'brands' },
      { label: 'Item Groups', hint: 'How items are classified, and the defaults they take', doctype: 'Item Group', route: 'item-groups' },
      {
        label: 'Stock Settings',
        hint: 'What new items start with; FIFO or Moving Average',
        doctype: 'Stock Settings',
        route: 'stock-settings',
      },
    ],
  },
  {
    title: 'Selling',
    hint: 'Where a sale takes its prices from',
    entries: [
      {
        label: 'Selling Settings',
        hint: 'Default price list, fallback, editing prices',
        doctype: 'Selling Settings',
        route: 'selling-settings',
      },
    ],
  },
  {
    title: 'Users & Access',
    hint: 'Who may work in this system, and what each of them may do',
    entries: [
      { label: 'Users', hint: 'Invite people by email; give them roles', doctype: 'User', route: 'users' },
      { label: 'Roles', hint: 'The standard roles, and your own', doctype: 'Role', route: 'roles' },
      { label: 'Role Profiles', hint: 'A set of roles given together', doctype: 'Role Profile', route: 'role-profiles' },
      {
        label: 'Role Permissions Manager',
        hint: 'What each role may read, write, create and delete',
        doctype: 'Role Permission',
        route: 'role-permissions',
      },
      { label: 'User Permissions', hint: 'Restrict a user to particular records', doctype: 'User Permission', route: 'user-permissions' },
    ],
  },
  {
    title: 'Naming & Printing',
    hint: 'How documents are numbered, and what a receipt looks like',
    entries: [
      {
        label: 'Document Naming Settings',
        hint: 'The series invoices and items are numbered by',
        doctype: 'Document Naming Settings',
        route: 'document-naming-settings',
      },
      { label: 'Print Formats', hint: 'The receipt: paper, heading, a sample', doctype: 'Print Format', route: 'print-formats' },
      { label: 'Letter Heads', hint: 'The name and address at the top of a receipt', doctype: 'Letter Head', route: 'letter-heads' },
      { label: 'Print Settings', hint: 'Letter head, compact items, zero taxes', doctype: 'Print Settings', route: 'print-settings' },
    ],
  },
];

// ponytail: tune on a real tablet. A section card's narrowest width; the column count falls out of it.
const SECTION_CARD = 320;

/** Setup: the index of a system's foundation records, the rail's second destination. */
export function SetupIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  const { columns, onLayout } = useColumns(SECTION_CARD);
  const permissions = usePermissions({ merchantId });
  // A row shows only to whom may read it; a section with none left goes. The owner may read everything,
  // and the systems list already says who that is — so the owner's rows need no my_permissions, which a
  // fresh start in airplane mode has not fetched.
  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => isOwner || can(permissions.data, entry.doctype, 'read')),
  })).filter((section) => section.entries.length > 0);
  // Rows of `columns` sections, the last one padded with empty cells so every card keeps the same width.
  const rows = Array.from({ length: Math.ceil(sections.length / columns) }, (_, row) =>
    sections.slice(row * columns, row * columns + columns)
  );

  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchantName} title="Setup" meta="Set these up before the first item is sold" />
      <ScrollView contentContainerStyle={styles.body}>
        {isOwner || permissions.data ? null : (
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
            onPress={() => router.push(`/systems/${merchantId}/setup/${entry.route}`)}
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
