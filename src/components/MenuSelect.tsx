import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Menu, TextInput, TouchableRipple } from 'react-native-paper';

import { useAppTheme } from '../lib/theme';

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  error?: boolean;
  disabled?: boolean;
  /** The inline-create row at the foot of the list ("+ New category"). */
  createLabel?: string;
  onCreate?: () => void;
};

/**
 * The Select pattern from docs/visual-language.md §5: an outlined TextInput that cannot be typed in,
 * anchoring a Menu. Plain value/onChange rather than react-hook-form, so the product form, the list's
 * filters and the category manager share it; the form wraps it in a Controller.
 *
 * The input is not editable and ignores touches, so no keyboard opens and a screen reader hears the
 * ripple's button role rather than an editable field.
 */
export function MenuSelect({
  value,
  options,
  onChange,
  placeholder,
  accessibilityLabel,
  error,
  disabled,
  createLabel,
  onCreate,
}: Props) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchorPosition="bottom"
      anchor={
        <TouchableRipple
          onPress={() => setOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={selected ? selected.label : placeholder}
        >
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              dense
              editable={false}
              value={selected?.label ?? ''}
              placeholder={placeholder}
              error={error}
              disabled={disabled}
              right={<TextInput.Icon icon="chevron-down" />}
            />
          </View>
        </TouchableRipple>
      }
    >
      {/* Menu renders every item; a list of categories can outgrow the screen, so it scrolls. */}
      <ScrollView style={styles.list}>
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            title={option.label}
            leadingIcon={option.value === value ? 'check' : undefined}
            onPress={() => {
              setOpen(false);
              onChange(option.value);
            }}
          />
        ))}
      </ScrollView>
      {onCreate && createLabel ? (
        <>
          {options.length > 0 ? <Divider /> : null}
          <Menu.Item
            title={createLabel}
            leadingIcon="plus"
            // Inline field actions carry the accent (docs/visual-language.md §4); colour only, no type.
            titleStyle={{ color: colors.accent }}
            onPress={() => {
              setOpen(false);
              onCreate();
            }}
          />
        </>
      ) : null}
    </Menu>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
});
