import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { failureMessage, postgrestError, usedElsewhere } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { childrenOf, pathTo, subtree } from '../lib/tree';
import type { PickOption } from '../Store/picker';
import { spacing } from '../themes';
import { Button } from './button';
import { Icon } from './icon';
import { QueryState } from './query-state';
import { Text } from './text';

// The tree masters as folders — Chart of Accounts, Cost Centers, Warehouses and Item Groups
// (docs.frappe.io/erpnext/chart-of-accounts). A group is a folder, a ledger a row.
//
// The open folder is the list route's `parent` param, and opening one pushes the same route a level deeper,
// so Android's back button climbs one folder. Rejected: the path in useState — Back from three folders deep
// would leave the screen.

type TreeRoute =
  | '/systems/[id]/setup/chart-of-accounts'
  | '/systems/[id]/setup/cost-centers'
  | '/systems/[id]/setup/warehouses'
  | '/systems/[id]/setup/item-groups';

// `disabled` is optional: an Item Group has no such flag in ERPNext.
type TreeNode = { id: string; parent_id: string | null; is_group: boolean; disabled?: boolean };

/** The open folder's id — undefined at the top — and a push into one of its folders. */
export function useFolder(pathname: TreeRoute, merchantId: string) {
  const { parent } = useLocalSearchParams<{ parent?: string }>();
  return { parent, open: (id: string) => router.push({ pathname, params: { id: merchantId, parent: id } }) };
}

type Props<T extends TreeNode> = {
  query: { data: T[] | undefined; isPaused: boolean; isPending: boolean; isError: boolean; refetch: () => void };
  parent: string | undefined;
  /** The tree's own name, the breadcrumb's first segment: "Chart of Accounts". */
  root: string;
  label: (node: T) => string;
  /** Words after the row's kind: an account type, "Disabled". */
  status: (node: T) => (string | null)[];
  /** What a group holds: "account", "accounts". */
  noun: [one: string, many: string];
  open: (id: string) => void;
  /** A ledger's press; undefined when the caller may not edit. */
  onEdit?: (node: T) => void;
  offline: string;
  failure: string;
};

/** The open folder's breadcrumb over its groups (folder rows) and ledgers (rows), loading and offline states included. */
export function TreeBrowser<T extends TreeNode>({ query, parent, root, label, status, noun, open, onEdit, offline, failure }: Props<T>) {
  const { colors } = useAppTheme();
  const nodes = query.data ?? [];
  const rows = childrenOf(nodes, parent ?? null);
  const count = (node: T) => {
    const held = childrenOf(nodes, node.id).length;
    return `${held} ${held === 1 ? noun[0] : noun[1]}`;
  };
  const words = (node: T) => [node.is_group ? count(node) : null, ...status(node), node.disabled ? 'Disabled' : null].filter((word) => word !== null);
  // The open folder was deleted (its own Edit Group, or by someone else): this page has nothing left to
  // show, so it steps back to the folder that held it. On focus, not on the refetch: the delete's form
  // and confirm may still sit above this page, and a back from here would close them instead.
  const gone = parent !== undefined && query.data !== undefined && !query.data.some((node) => node.id === parent);
  useFocusEffect(
    useCallback(() => {
      if (gone) router.back();
    }, [gone])
  );

  if (!query.data) {
    return (
      <View style={styles.state}>
        <QueryState query={query} offline={offline} failure={failure} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(node) => node.id}
      ListHeaderComponent={<FolderBreadcrumb root={root} trail={pathTo(nodes, parent).map(label)} />}
      ListEmptyComponent={
        <Text variant="bodyMedium" style={styles.state}>
          Nothing in this group yet.
        </Text>
      }
      renderItem={({ item }) => {
        const press = item.is_group ? () => open(item.id) : onEdit ? () => onEdit(item) : undefined;
        return (
          <Pressable
            onPress={press}
            disabled={!press}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={[label(item), ...words(item)].join(', ')}
            accessibilityHint={item.is_group ? 'Opens the group' : undefined}
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }]}
          >
            {item.is_group ? <Icon source="folder" size={22} color={colors.onSurfaceMuted} /> : null}
            <View style={styles.text}>
              <Text variant="titleMedium" numberOfLines={1} style={item.disabled ? { color: colors.onSurfaceFaint } : undefined}>
                {label(item)}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {words(item).join(' · ')}
              </Text>
            </View>
            {item.is_group ? <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

/**
 * "Chart of Accounts › Application of Funds (Assets) - CC › Current Assets - CC", shown inside a folder. An
 * earlier segment pops back to it: each folder level is one push, so it is that many screens down. Rejected:
 * router.dismissTo — every level is the same route, so it matches the screen already open.
 */
function FolderBreadcrumb({ root, trail }: { root: string; trail: string[] }) {
  const { colors } = useAppTheme();
  if (trail.length === 0) return null;
  const crumbs = [root, ...trail];

  return (
    <View style={styles.crumbs}>
      {crumbs.map((name, index) => (
        // The trail is positional: the same name can sit at two depths.
        <View key={`${index}:${name}`} style={styles.crumb}>
          {index > 0 ? <Icon source="chevron-right" size={16} color={colors.onSurfaceMuted} /> : null}
          {index === crumbs.length - 1 ? (
            <Text variant="titleSmall" numberOfLines={1}>
              {name}
            </Text>
          ) : (
            <Button mode="text" compact onPress={() => router.dismiss(crumbs.length - 1 - index)}>
              {name}
            </Button>
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * Where a tree form's record may sit: every group outside its own subtree, as Parent options. Also whether
 * it is a root (which keeps its place) and whether anything sits under it (so it stays a group).
 */
export function treePlacement<T extends TreeNode>(nodes: T[], existing: T | undefined, option: (node: T) => PickOption) {
  const inside = existing ? subtree(nodes, existing.id) : new Set<string>();
  return {
    root: existing?.parent_id === null,
    hasChildren: existing ? childrenOf(nodes, existing.id).length > 0 : false,
    parents: nodes.filter((node) => node.is_group && !inside.has(node.id)).map(option),
  };
}

/** private.validate_tree's refusals, and the unique and foreign keys both trees share, in words. */
const TREE_FAILURES = new Map([
  ['23505', 'That name or number is already used in this tree.'],
  ['23503', 'Something sits under this one. Move or delete it first, or disable this one instead.'],
  ['parent_not_group', 'The parent must be a group.'],
  ['tree_cycle', "It can't sit under itself, or under anything inside it."],
  ['group_has_children', 'This group has records under it, so it stays a group.'],
  ['root_type_locked', 'This group has accounts under it, so it cannot move under another root type.'],
  ['root_locked', "The company's cost center stays as long as the company."],
  ['warehouse_account_invalid', 'That account is no longer an enabled Stock ledger — pick it again.'],
  ['default_invalid', "One of the defaults can't be used any more — pick it again."],
]);

export function treeFailure(error: Error | null, fallback: string) {
  const cause = postgrestError(error);
  if (cause?.message.includes('accounts_type_fits_root')) return "That account type doesn't belong under the parent's root type.";
  // A 23503 from anything but the tree's own parent key: something else still names it — said by the
  // constraint that refused, a warehouse's or a brand's when it is theirs. (Not usedElsewhere first: an item
  // group's parent key is on item_groups too.)
  if (cause?.code === '23503' && !/accounts_parent_fk|cost_centers_parent_fk|warehouses_parent_fk|item_groups_parent_fk/.test(cause.message)) {
    const elsewhere = usedElsewhere(error);
    if (elsewhere) return elsewhere;
    if (cause.message.includes('warehouses_account_fk')) return 'A warehouse posts its stock to it. Give that warehouse another account first, or disable this one.';
    if (cause.message.includes('brands_')) return "It's a brand's default. Clear it on the brand first, or disable this one.";
    return "It's in use — as a company default, a mode of payment's account or in a tax template. Disable it instead.";
  }
  return TREE_FAILURES.get(cause?.message ?? '') ?? TREE_FAILURES.get(cause?.code ?? '') ?? failureMessage(fallback);
}

const styles = StyleSheet.create({
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, borderBottomWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  text: { flex: 1, gap: spacing.xs },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  crumb: { flexDirection: 'row', alignItems: 'center' },
});
