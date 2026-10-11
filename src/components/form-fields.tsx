import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { createContext, use, useState } from 'react';
import type { ReactNode } from 'react';
import { useController } from 'react-hook-form';
import type { Control, FieldPath, FieldPathByValue, FieldValues } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { useShellWide } from '../lib/columns';
import { displayDate, storedDate, toLocalDate } from '../lib/dates';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { HelperText } from './helper-text';
import { IconButton } from './icon-button';
import { Switch } from './switch';
import { Text } from './text';
import { TextInput } from './text-input';

// The form layout pieces with no form path — the labelled Field and its grid, and the date input — and,
// at the end, the Controlled* fields that bind them to any react-hook-form through its `control`. In
// src/components/ because every Setup form lays out its fields with them (.claude/instruction_mds/structure.md
// rule 7). Restored from the pre-teardown form kit (git show 07bd7aa:src/components/form-fields.tsx), with
// only the pieces a Setup form uses so far.

type Span = 'half' | 'full';

export type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  /** Half a row on a wide form, the whole row otherwise. */
  span?: Span;
  error?: string;
  children: ReactNode;
};

/** Label row, control, error. Laid out by FieldGrid. */
export function Field({ label, required, hint, span = 'half', error, children }: FieldProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const halfMax = use(HalfWidthContext);

  return (
    <View style={wide && span === 'half' ? [styles.half, halfMax === undefined ? null : { maxWidth: halfMax }] : styles.full}>
      <View style={styles.labelRow}>
        {/* A required field says so in words; an unmarked field is optional, so nothing says "optional". */}
        <Text variant="labelMedium">{required ? `${label} (required)` : label}</Text>
        {hint ? (
          <Text variant="bodySmall" style={[styles.hint, { color: colors.onSurfaceMuted }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
      {/* Rendered only with an error, so a quiet form does not carry an empty line under every field. */}
      {error ? (
        <HelperText type="error" padding="none">
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

/**
 * The widest a half Field may grow: one column of its FieldGrid. Without it, a half field alone on its
 * row (the next one is full width, or hidden) grows across the whole row; `flexGrow` cannot tell it apart
 * from a pair. Measured, because Yoga has no `calc(50% - gap / 2)`.
 */
const HalfWidthContext = createContext<number | undefined>(undefined);

/** The two-column field grid on a wide form; one column narrow. */
export function FieldGrid({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <HalfWidthContext value={width > 0 ? (width - spacing.md) / 2 : undefined}>{children}</HalfWidthContext>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Dates. Held in the form as "YYYY-MM-DD" (src/lib/dates.ts), and converted to a local Date only for the
// picker.
// ---------------------------------------------------------------------------------------------------

const toPickerDate = (value: string) => (value === '' ? new Date() : toLocalDate(value));

type PickerProps = {
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
};

/**
 * A date, mounted only while open: the platform's own picker. Android shows its Material dialog and
 * closes it itself; iOS has no dialog presentation, so the inline picker sits in a Dialog with Done.
 */
function DatePicker({ value, onPick, onClose }: PickerProps) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(() => toPickerDate(value));

  if (process.env.EXPO_OS === 'android') {
    return (
      <DateTimePicker
        value={draft}
        mode="date"
        presentation="dialog"
        accentColor={colors.accent}
        onValueChange={(_event, date) => {
          onPick(storedDate(date));
          onClose();
        }}
        onDismiss={onClose}
      />
    );
  }

  return (
    <AdaptiveDialog
      onDismiss={onClose}
      title="Pick a date"
      actions={
        <>
          <Button onPress={onClose}>Cancel</Button>
          <Button
            mode="contained"
            onPress={() => {
              onPick(storedDate(draft));
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <DateTimePicker value={draft} mode="date" accentColor={colors.accent} onValueChange={(_event, date) => setDraft(date)} />
    </AdaptiveDialog>
  );
}

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  error?: boolean;
  disabled?: boolean;
  /** A date that may be left empty: a clear button beside it while it holds one. */
  clearable?: boolean;
};

/** A read-only outlined input that opens the date picker. Exported for a date no form holds: a report's filter. */
export function DateInput({ value, onChange, placeholder, accessibilityLabel, error, disabled, clearable }: DateInputProps) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={disabled}
          // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.fill}
        >
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              dense
              editable={false}
              value={displayDate(value)}
              placeholder={placeholder}
              disabled={disabled}
              error={error}
              right={<TextInput.Icon icon="calendar" />}
            />
          </View>
        </Pressable>
        {/* Beside the input, not its affix: the input sits under pointerEvents="none" so the whole field opens the picker. */}
        {clearable && value !== '' && !disabled ? (
          <IconButton icon="close" onPress={() => onChange('')} accessibilityLabel={`Clear ${accessibilityLabel}`} />
        ) : null}
      </View>
      {open ? <DatePicker value={value} onPick={onChange} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type ControlledProps<T extends FieldValues, V> = Omit<FieldProps, 'children' | 'error'> & {
  control: Control<T>;
  name: FieldPathByValue<T, V>;
  /** Shown but not editable: a form the caller's roles may read but not write. */
  disabled?: boolean;
};

/** An outlined TextInput in a Field, bound to one string of a react-hook-form. */
export function ControlledText<T extends FieldValues>({
  control,
  name,
  placeholder,
  maxLength,
  autoCapitalize,
  keyboardType,
  multiline,
  disabled,
  ...field
}: ControlledProps<T, string> & {
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** decimal-pad for a rate or an amount. */
  keyboardType?: TextInputProps['keyboardType'];
  /** Several lines, the box growing with them: a letter head, the series one per line. */
  multiline?: boolean;
}) {
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <TextInput
        mode="outlined"
        dense
        // SAFETY: `name` is a FieldPathByValue<T, string>, so the value at it is a string; TypeScript
        // cannot resolve the generic path's value type inside the component.
        value={input.value as string}
        onChangeText={input.onChange}
        onBlur={input.onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        disabled={disabled}
        error={!!fieldState.error}
        accessibilityLabel={field.label}
      />
    </Field>
  );
}

/** A Switch and the sentence beside it, bound to one boolean of a react-hook-form. */
export function ControlledSwitch<T extends FieldValues>({
  control,
  name,
  on,
  off,
  deps,
  disabled,
  ...field
}: ControlledProps<T, boolean> & {
  on: string;
  off: string;
  /** Fields whose rules read this switch, re-checked when it flips (Short Year → the end date). */
  deps?: FieldPath<T>[];
}) {
  const { colors } = useAppTheme();
  const { field: input, fieldState } = useController({ control, name, rules: { deps } });
  // Touched on the flip, as the checklist is: a switch has no blur, and `deps` run only once it is.
  const flip = (value: boolean) => {
    input.onChange(value);
    input.onBlur();
  };

  return (
    <Field {...field} error={fieldState.error?.message}>
      <View style={styles.toggleRow}>
        {/* A switch that is on is one of the accent's places (.claude/instruction_mds/frontend.md §2.3). */}
        <Switch
          // SAFETY: `name` is a FieldPathByValue<T, boolean>, so the value at it is a boolean; TypeScript
          // cannot resolve the generic path's value type inside the component.
          value={input.value as boolean}
          onValueChange={flip}
          disabled={disabled}
          color={colors.accent}
          accessibilityLabel={field.label}
        />
        <Text variant="bodyMedium" style={styles.fill}>
          {input.value ? on : off}
        </Text>
      </View>
    </Field>
  );
}

/** A date input in a Field, bound to one YYYY-MM-DD string ('' for none) of a react-hook-form. */
export function ControlledDate<T extends FieldValues>({
  control,
  name,
  onPicked,
  disabled,
  clearable,
  ...field
}: ControlledProps<T, string> & {
  /** Runs after the binding's own write, for a date that fills another field (a fiscal year's end). */
  onPicked?: (value: string) => void;
  /** An optional date (Accounts Frozen Till Date): it can be emptied again. */
  clearable?: boolean;
}) {
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <DateInput
        // SAFETY: `name` is a FieldPathByValue<T, string>, so the value at it is a string; TypeScript
        // cannot resolve the generic path's value type inside the component.
        value={input.value as string}
        onChange={(value) => {
          input.onChange(value);
          input.onBlur();
          onPicked?.(value);
        }}
        placeholder="Select a date"
        accessibilityLabel={field.label}
        disabled={disabled}
        clearable={clearable}
        error={!!fieldState.error}
      />
    </Field>
  );
}

/** One choice in a checklist. `hint` is a second line under the label. */
export type CheckOption = { value: string; label: string; hint?: string };

/**
 * A list of checkboxes, bound to one string[] of a react-hook-form: the roles of a user or a role profile.
 * Rows are Pressable + Checkbox.Android + Text rather than Checkbox.Item, whose label reads no variant
 * (.claude/instruction_mds/frontend.md §3.3).
 */
export function ControlledChecklist<T extends FieldValues>({
  control,
  name,
  options,
  disabled,
  ...field
}: ControlledProps<T, string[]> & { options: CheckOption[] }) {
  const { colors } = useAppTheme();
  const { field: input, fieldState } = useController({ control, name });
  // SAFETY: `name` is a FieldPathByValue<T, string[]>, so the value at it is a string[]; TypeScript cannot
  // resolve the generic path's value type inside the component.
  const checked = input.value as string[];

  const toggle = (value: string) => {
    input.onChange(checked.includes(value) ? checked.filter((item) => item !== value) : [...checked, value]);
    input.onBlur();
  };

  return (
    // The error above the list, not under it as Field puts it: a list of every role runs past the bottom
    // of a phone, and Save's "Choose at least one role." would land out of sight.
    <Field {...field}>
      {fieldState.error ? (
        <HelperText type="error" padding="none">
          {fieldState.error.message}
        </HelperText>
      ) : null}
      <View style={[styles.checklist, { borderColor: colors.outlineVariant }]}>
        {options.map((option, index) => (
          <Pressable
            key={option.value}
            onPress={() => toggle(option.value)}
            disabled={disabled}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: checked.includes(option.value), disabled }}
            accessibilityLabel={option.label}
            style={[styles.check, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceVariant } : null]}
          >
            <Checkbox.Android
              status={checked.includes(option.value) ? 'checked' : 'unchecked'}
              disabled={disabled}
              color={colors.accent}
              onPress={() => toggle(option.value)}
            />
            <View style={styles.fill}>
              <Text variant="bodyMedium" style={disabled ? { color: colors.onSurfaceMuted } : null}>
                {option.label}
              </Text>
              {option.hint ? (
                <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {option.hint}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  checklist: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' },
  // 48: the Android touch target floor (.claude/instruction_mds/frontend.md rule 19).
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 48, paddingHorizontal: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.md },
  // 45% plus flexGrow rather than 50%: the column gap would otherwise push the second cell to a row
  // of its own. The gap spaces label row, control and error, so none of them carries a margin.
  half: { flexBasis: '45%', flexGrow: 1, minWidth: 0, gap: spacing.xs },
  full: { flexBasis: '100%', gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 24 },
  hint: { flexShrink: 1, textAlign: 'right' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
});
