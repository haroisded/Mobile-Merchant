import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { useBottomInset, useTableFits } from '../lib/columns';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { DataTable } from './data-table';
import { HeaderTitle } from './header-title';
import { QueryState } from './query-state';
import { Text } from './text';

/**
 * One column of the wide table: its text, or a node (a status) when `node` is given. The first column's
 * text is the row's name (titleMedium).
 */
type RecordColumn<T> = { label: string; flex: number; cell: (item: T) => string; node?: (item: T) => ReactNode };

type Props<T> = {
  query: { data: T[] | undefined; isPaused: boolean; isPending: boolean; isError: boolean; refetch: () => void };
  keyOf: (item: T) => string;
  columns: RecordColumn<T>[];
  /** The narrow row: a name, a line under it, and a status. */
  title: (item: T) => string;
  subtitle?: (item: T) => string;
  status?: (item: T) => ReactNode;
  accessibilityLabel: (item: T) => string;
  onPress?: (item: T) => void;
  /** A pinned first row — the owner in Users. */
  header?: ReactElement;
  empty: string;
  offline: string;
  failure: string;
  /** A (tabs) screen's list (Access Codes): the tab bar keeps it clear of the navigation bar on a phone (useBottomInset). */
  underTabs?: boolean;
};

/**
 * A Setup master's list: a DataTable when wide and the font scale lets its columns read, rows otherwise
 * (.claude/instruction_mds/frontend.md §4.4, §3.5). A short bounded list, so FlatList (§4.2). The loading,
 * offline and failed states stand in for an empty list.
 */
export function RecordList<T>({ query, keyOf, columns, title, subtitle, status, accessibilityLabel, onPress, header, empty, offline, failure, underTabs = false }: Props<T>) {
  const { colors } = useAppTheme();
  const table = useTableFits();
  // The last row scrolls clear of the system navigation bar.
  const bottom = useBottomInset(underTabs);

  const emptyState = (
    <View style={styles.state}>
      <QueryState query={query} offline={offline} failure={failure}>
        <Text variant="bodyMedium">{empty}</Text>
      </QueryState>
    </View>
  );

  const list = (
    <FlatList
      data={query.data ?? []}
      keyExtractor={keyOf}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyState}
      contentContainerStyle={{ paddingBottom: bottom }}
      renderItem={({ item }) => (
        <Pressable
          onPress={onPress ? () => onPress(item) : undefined}
          disabled={!onPress}
          // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel(item)}
          style={[table ? styles.tableRow : styles.cardRow, { borderBottomColor: colors.surfaceVariant }]}
        >
          {table ? (
            columns.map((column, index) => (
              <View key={column.label} style={[styles.cell, { flex: column.flex }]}>
                {column.node ? (
                  column.node(item)
                ) : (
                  <Text variant={index === 0 ? 'titleMedium' : 'bodyMedium'}>{column.cell(item)}</Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.cardText}>
              <Text variant="titleMedium">{title(item)}</Text>
              {subtitle ? (
                <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {subtitle(item)}
                </Text>
              ) : null}
              {status ? status(item) : null}
            </View>
          )}
        </Pressable>
      )}
    />
  );

  if (!table) return list;

  return (
    <DataTable style={styles.fill}>
      <DataTable.Header style={{ borderBottomColor: colors.outlineVariant }}>
        {columns.map((column) => (
          <HeaderTitle key={column.label} label={column.label} style={[styles.cell, { flex: column.flex }]} />
        ))}
      </DataTable.Header>
      {list}
    </DataTable>
  );
}

/** A status word in a list, in the colours of .claude/instruction_mds/frontend.md §2.4. */
export function StatusText({ words, faint }: { words: string[]; faint?: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Text variant="labelMedium" style={{ color: faint ? colors.onSurfaceFaint : colors.onSurface }}>
      {words.join(' · ')}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  cell: { paddingRight: spacing.sm },
  cardRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  cardText: { gap: spacing.xs },
});
