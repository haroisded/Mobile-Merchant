import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { DataTable } from './data-table';

/** A wide list's column title, for every Setup list drawn as a DataTable. */
export function HeaderTitle({ label, style }: { label: string; style: StyleProp<ViewStyle> }) {
  const { fonts } = useAppTheme();
  // The label goes in as a string with labelMedium spread over Paper's own cell type
  // (.claude/instruction_mds/frontend.md rule 6), with Paper's own font-scale default (§3.2). The cell styles callers
  // pass centre vertically for a column-direction row cell, but Title is a row, where that
  // justifyContent centred the label across its column — so it is pulled back to the start here.
  return (
    <DataTable.Title style={[style, styles.start]} textStyle={fonts.labelMedium}>
      {label}
    </DataTable.Title>
  );
}

const styles = StyleSheet.create({
  start: { justifyContent: 'flex-start', alignItems: 'center' },
});
