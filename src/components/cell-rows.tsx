import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

type Props<T> = {
  items: T[];
  /** From useColumns, measured on this grid (`onLayout`). */
  columns: number;
  onLayout: (event: LayoutChangeEvent) => void;
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  rowGap: number;
  columnGap: number;
};

/**
 * A useColumns grid (.claude/instruction_mds/frontend.md §4.2): the items in rows of `columns`, each in a `flex: 1`
 * cell, the last row padded with empty cells so every item keeps the same width. Rows, not flexWrap: a wrapped last
 * item would grow across the whole row. Setup's, Stock's and Accounts' indexes, and the Dashboard's cards and blocks.
 */
export function CellRows<T>({ items, columns, onLayout, keyOf, render, rowGap, columnGap }: Props<T>) {
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, row) => items.slice(row * columns, row * columns + columns));

  return (
    // The gaps are the caller's, so they are passed at render (.claude/instruction_mds/frontend.md rule 21).
    <View style={{ gap: rowGap }} onLayout={onLayout}>
      {rows.map((row) => (
        <View key={keyOf(row[0])} style={[styles.row, { gap: columnGap }]}>
          {row.map((item) => (
            <View key={keyOf(item)} style={styles.cell}>
              {render(item)}
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={index} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
});
