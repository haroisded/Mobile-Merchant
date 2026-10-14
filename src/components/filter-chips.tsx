import { ScrollView, StyleSheet } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Chip } from './chip';

type PickProps = { picked: boolean; onPress: () => void; children: string };

/**
 * One chip of a pick-one row: filled in `primary` when picked, outlined otherwise — as the Access Codes mocks draw
 * them. Paper's own selected flat chip is a 12% tint of the others, and read the same as them on the phone
 * (2026-10-14). No check mark: the fill says it, and a check would shift the label.
 */
export function PickChip({ picked, onPress, children }: PickProps) {
  const { colors } = useAppTheme();

  return (
    <Chip
      mode={picked ? 'flat' : 'outlined'}
      selected={picked}
      showSelectedCheck={false}
      selectedColor={picked ? colors.onPrimary : undefined}
      style={picked ? { backgroundColor: colors.primary } : undefined}
      onPress={onPress}
    >
      {children}
    </Chip>
  );
}

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (next: T) => void };

/** One filter with a few values, as a row of PickChips. Slides sideways when it outgrows a phone, rather than wrapping. */
export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((option) => (
        <PickChip key={option.value} picked={value === option.value} onPress={() => onChange(option.value)}>
          {option.label}
        </PickChip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm },
});
