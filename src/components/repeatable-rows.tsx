import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Text } from './text';

// Repeatable rows (.claude/instruction_mds/frontend.md §5): a child table edited inside its form — the tax
// rows of a Sales Taxes and Charges Template, the rates of an Item Tax Template. Each row is a 1px box with
// its number and a remove button; an accent "+ Add …" text button follows the last. The rows themselves are
// the caller's react-hook-form useFieldArray.

type RowProps = {
  /** "Row 2": ERPNext's row number, what a Reference Row # names. */
  title: string;
  /** Absent on a read-only form. */
  onRemove?: () => void;
  children: ReactNode;
};

export function RepeatableRow({ title, onRemove, children }: RowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
      <View style={styles.header}>
        <Text variant="labelMedium" style={styles.fill}>
          {title}
        </Text>
        {onRemove ? <IconButton icon="close" onPress={onRemove} accessibilityLabel={`Remove ${title}`} /> : null}
      </View>
      {children}
    </View>
  );
}

/** "+ Add …" in the accent, left-aligned under the rows (.claude/instruction_mds/frontend.md §2.3). */
export function AddRowButton({ onPress, children }: { onPress: () => void; children: string }) {
  const { colors } = useAppTheme();

  return (
    <Button mode="text" icon="add" textColor={colors.accent} onPress={onPress} style={styles.add}>
      {children}
    </Button>
  );
}

type ListProps = {
  /** useFieldArray's `fields`. */
  fields: { id: string }[];
  /** False on a read-only form: no remove button, no "+ Add …". */
  editable: boolean;
  /** The line that stands in for the rows while there are none. */
  empty: string;
  addLabel: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** One row's fields. */
  children: (index: number) => ReactNode;
};

/** A whole child table: its numbered rows, the line for none, and "+ Add …". */
export function RepeatableList({ fields, editable, empty, addLabel, onAdd, onRemove, children }: ListProps) {
  const { colors } = useAppTheme();

  return (
    <>
      {fields.map((field, index) => (
        <RepeatableRow key={field.id} title={`Row ${index + 1}`} onRemove={editable ? () => onRemove(index) : undefined}>
          {children(index)}
        </RepeatableRow>
      ))}
      {fields.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
          {empty}
        </Text>
      ) : null}
      {editable ? <AddRowButton onPress={onAdd}>{addLabel}</AddRowButton> : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.sm },
  // The IconButton's own 48dp target sets the header's height; no negative margin needed.
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  add: { alignSelf: 'flex-start' },
});
