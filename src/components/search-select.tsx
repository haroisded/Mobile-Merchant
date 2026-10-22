import { router } from 'expo-router';
import { useState } from 'react';
import { useController } from 'react-hook-form';
import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

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
  /** Shown but not editable: a read-only form, or a value another field decides. */
  disabled?: boolean;
};

/**
 * A select over a list too long for a Menu — countries, currencies, and the accounts and time zones to
 * come: a read-only field that opens a searchable picker. The picker follows the confirm-and-picker pair
 * in .claude/instruction_mds/frontend.md §4.4: a native sheet route narrow (src/app/(app)/sheets/pick.tsx),
 * a Dialog wide.
 */
export function SearchSelect({ title, value, options, onChange, disabled, ...field }: Props) {
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
        disabled={disabled}
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
            disabled={disabled}
            error={!!field.error}
            right={<TextInput.Icon icon="chevron-down" />}
          />
        </View>
      </Pressable>
      {open ? (
        <AdaptiveDialog
          onDismiss={() => setOpen(false)}
          title={title}
          scroll={false}
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

/** A SearchSelect bound to one string of a react-hook-form. `onPicked` runs after the binding's own write. */
export function ControlledSelect<T extends FieldValues>({
  control,
  name,
  onPicked,
  ...select
}: Omit<Props, 'value' | 'onChange' | 'error'> & {
  control: Control<T>;
  name: FieldPathByValue<T, string>;
  onPicked?: (value: string) => void;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <SearchSelect
      {...select}
      // SAFETY: `name` is a FieldPathByValue<T, string>, so the value at it is a string; TypeScript cannot
      // resolve the generic path's value type inside the component.
      value={field.value as string}
      onChange={(picked) => {
        field.onChange(picked);
        field.onBlur();
        onPicked?.(picked);
      }}
      error={fieldState.error?.message}
    />
  );
}

type ListProps = {
  options: PickOption[];
  value: string;
  onPick: (value: string) => void;
};

/**
 * The search box and the options that match it — the body of both the wide Dialog above and the narrow
 * sheet route (AdaptiveDialog `scroll={false}`). The search box stays put and the options scroll under it in a
 * virtualized list, drawn a screenful at a time: the countries are 250 rows. Mapped into the dialog's ScrollView
 * (the shape until 2026-10-22), every row rendered at once and the phone's sheet could not be scrolled.
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
      <FlatList
        data={shown}
        keyExtractor={(option) => option.value}
        keyboardShouldPersistTaps="handled"
        // A screenful first, then more as it scrolls (the lazy loading the picker asked for).
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
        style={styles.list}
        ListEmptyComponent={<Text variant="bodyMedium">Nothing matches that search.</Text>}
        renderItem={({ item: option }) => (
        <Pressable
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
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Shrinks to what the Dialog or sheet leaves under the search box, and scrolls inside it.
  list: { flexShrink: 1 },
  // 48: the Android touch target floor (.claude/instruction_mds/frontend.md rule 19).
  option: { minHeight: 48, justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
});
