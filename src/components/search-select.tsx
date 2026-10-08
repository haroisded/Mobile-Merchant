import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useShellWide } from '../lib/columns';
import { useAppTheme } from '../lib/theme';
import { openPicker } from '../Store/picker';
import type { PickOption } from '../Store/picker';
import { spacing } from '../themes';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { Field } from './form-fields';
import type { FieldProps } from './form-fields';
import { Text } from './text';
import { TextInput } from './text-input';

type Props = Omit<FieldProps, 'children'> & {
  /** The picker's own title ("Country"). */
  title: string;
  value: string;
  options: PickOption[];
  onChange: (value: string) => void;
};

/**
 * A select over a list too long for a Menu — countries, currencies, and the accounts and time zones to
 * come: a read-only field that opens a searchable picker. The picker follows the confirm-and-picker pair
 * in .claude/instruction_mds/frontend.md §4.4: a native sheet route narrow (src/app/(app)/sheets/pick.tsx),
 * a Dialog wide.
 */
export function SearchSelect({ title, value, options, onChange, ...field }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const show = () => {
    if (wide) {
      setOpen(true);
      return;
    }
    openPicker({ title, options, value, onPick: onChange });
    router.push('/sheets/pick');
  };

  return (
    <Field {...field}>
      <Pressable
        onPress={show}
        // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
        android_ripple={{ color: colors.ripple }}
        accessibilityRole="button"
        accessibilityLabel={field.label}
      >
        <View pointerEvents="none">
          <TextInput
            mode="outlined"
            dense
            editable={false}
            value={selected?.label ?? ''}
            placeholder="Select"
            error={!!field.error}
            right={<TextInput.Icon icon="chevron-down" />}
          />
        </View>
      </Pressable>
      {open ? (
        <AdaptiveDialog
          onDismiss={() => setOpen(false)}
          title={title}
          actions={
            <Button mode="outlined" onPress={() => setOpen(false)}>
              Cancel
            </Button>
          }
        >
          <PickList
            options={options}
            value={value}
            onPick={(picked) => {
              onChange(picked);
              setOpen(false);
            }}
          />
        </AdaptiveDialog>
      ) : null}
    </Field>
  );
}

type ListProps = {
  options: PickOption[];
  value: string;
  onPick: (value: string) => void;
};

/**
 * The search box and the options that match it — the body of both the wide Dialog above and the narrow
 * sheet route. Mapped rather than virtualized: it lives inside the Dialog's or sheet's ScrollView, and the
 * longest list is a few hundred rows.
 */
export function PickList({ options, value, onPick }: ListProps) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  // Label and hint carry the value too ("PHP · Philippine Peso", a country's code), and '' matches all.
  const shown = options.filter((option) => [option.label, option.hint ?? ''].some((text) => text.toLowerCase().includes(needle)));

  return (
    <>
      <TextInput
        mode="outlined"
        dense
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        accessibilityLabel="Search"
        left={<TextInput.Icon icon="search" />}
      />
      {shown.length === 0 ? <Text variant="bodyMedium">Nothing matches that search.</Text> : null}
      {shown.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onPick(option.value)}
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          // The selected row's ground (.claude/instruction_mds/frontend.md §2.2).
          style={[styles.option, option.value === value ? { backgroundColor: colors.surfaceMuted } : null]}
        >
          <Text variant="bodyMedium">{option.label}</Text>
          {option.hint ? (
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {option.hint}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // 48: the Android touch target floor (.claude/instruction_mds/frontend.md rule 19).
  option: { minHeight: 48, justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
});
